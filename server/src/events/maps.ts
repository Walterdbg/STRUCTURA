import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  DomainError,
  courseTotal,
  lineLength,
  mapFeatureFields,
  positionAt,
  uuidv7,
  type FeatureProps,
  type Geometry,
  type MapFeatureFields,
} from "@structura/domain";
import { requireAuth, requireCapability } from "../auth.js";
import { executeCommand, type CommandContext } from "../commands.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam, type ParsedCommand } from "../http.js";
import { MAX_PHOTO_BYTES, sniffImage, type FileStore } from "../storage.js";
import { getEvent } from "./service.js";

// Event maps (UC-05, AT-07; DEC-022): points, small areas and routes.
// A map change never moves stock and never creates a location (spec 2.2).
// Running courses are a paid add-on (DEC-023), checked here on the server.

export interface MapFeatureRecord {
  id: string;
  kind: "point" | "area" | "route";
  category: string;
  label: string;
  notes: string | null;
  geometry: Geometry;
  preferred: boolean;
  source: string | null;
  props: FeatureProps;
  lengthMeters: number | null;
  // Courses: one pass x (2 if out-and-back) x laps.
  totalMeters: number | null;
  version: number;
  // Pictures of a point of interest (DEC-044): photos and zoom captures.
  photos?: PoiPhoto[];
}

export interface PoiPhoto {
  id: string;
  role: "photo" | "capture";
  filename: string;
}

// Up to three pictures per point (Walter, 2026-10-02).
export const MAX_POI_PHOTOS = 3;

interface Row {
  id: string;
  kind: MapFeatureRecord["kind"];
  category: string;
  label: string;
  notes: string | null;
  geometry: Geometry;
  preferred: boolean;
  source: string | null;
  props: FeatureProps | null;
  version: number;
}

const toRecord = (r: Row): MapFeatureRecord => {
  const length = r.geometry.type === "LineString" ? Math.round(lineLength(r.geometry.coordinates)) : null;
  const props = r.props ?? {};
  return {
    ...r,
    props,
    lengthMeters: length,
    totalMeters: length !== null && r.category === "course" ? Math.round(courseTotal(length, props)) : null,
  };
};

// What an organization can use: its plan's features plus its own add-ons.
export async function tenantFeatures(db: Db, tenantId: string): Promise<string[]> {
  const { rows } = await db.query<{ features: string[] }>(
    `SELECT array(SELECT DISTINCT f FROM unnest(t.features || coalesce(p.features, '{}')) AS f ORDER BY f) AS features
       FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id AND p.active
      WHERE t.id = $1`,
    [tenantId]
  );
  return rows[0]?.features ?? [];
}

async function assertAddOn(t: Db, tenantId: string, f: MapFeatureFields) {
  const usesCourses = (f.kind === "route" && f.category === "course") || f.props.courseId !== undefined;
  if (usesCourses && !(await tenantFeatures(t, tenantId)).includes("courses")) {
    throw new DomainError("license_restricted", "Running courses are a paid add-on that is not active for this organization", {
      feature: "courses",
    });
  }
}

// DEC-031: running courses (and points placed on one) only on races.
function assertRace(eventType: string, f: MapFeatureFields) {
  const usesCourses = (f.kind === "route" && f.category === "course") || f.props.courseId !== undefined;
  if (usesCourses && eventType !== "race") {
    throw new DomainError("validation", "Running courses are only for race Events", { field: "category", reason: "not_a_race" });
  }
}

// A point placed on a course (e.g. water at km 5) gets its position from
// the course itself, so it sits exactly on the line (DEC-027 item 3).
async function placeOnCourse(t: Db, tenantId: string, eventId: string, f: MapFeatureFields): Promise<MapFeatureFields> {
  if (f.props.courseId === undefined || f.props.distanceM === undefined) return f;
  const { rows } = await t.query<{ geometry: Geometry; category: string; kind: string }>(
    "SELECT geometry, category, kind FROM map_features WHERE tenant_id = $1 AND event_id = $2 AND id = $3 AND removed_at IS NULL",
    [tenantId, eventId, f.props.courseId]
  );
  const course = rows[0];
  if (!course || course.kind !== "route" || course.category !== "course" || course.geometry.type !== "LineString") {
    throw new DomainError("validation", "The course to place this point on doesn't exist on this Event's map", { field: "props" });
  }
  const length = lineLength(course.geometry.coordinates);
  if (f.props.distanceM > length + 1) {
    throw new DomainError("validation", "That distance is beyond the end of the course", { field: "props", lengthMeters: Math.round(length) });
  }
  const [lng, lat] = positionAt(course.geometry.coordinates, f.props.distanceM);
  return { ...f, geometry: { type: "Point", coordinates: [round6(lng), round6(lat)] } };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

// When a course's shape changes, the points placed on it move with it,
// keeping their distance (clamped to the new end).
async function moveLinkedPoints(t: Db, tenantId: string, eventId: string, courseId: string, coords: number[][]) {
  const length = lineLength(coords);
  const { rows } = await t.query<{ id: string; props: FeatureProps }>(
    `SELECT id, props FROM map_features
      WHERE tenant_id = $1 AND event_id = $2 AND kind = 'point' AND removed_at IS NULL AND props->>'courseId' = $3`,
    [tenantId, eventId, courseId]
  );
  for (const r of rows) {
    const d = Math.min(r.props.distanceM ?? 0, length);
    const [lng, lat] = positionAt(coords, d);
    await t.query(
      `UPDATE map_features SET geometry = $3, props = $4, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, r.id, JSON.stringify({ type: "Point", coordinates: [round6(lng), round6(lat)] }), JSON.stringify({ ...r.props, distanceM: d })]
    );
  }
}

async function getFeature(t: Db, tenantId: string, eventId: string, id: string): Promise<MapFeatureRecord> {
  const { rows } = await t.query<Row>(
    `SELECT id, kind, category, label, notes, geometry, preferred, source, props, version FROM map_features
      WHERE tenant_id = $1 AND event_id = $2 AND id = $3 AND removed_at IS NULL`,
    [tenantId, eventId, id]
  );
  if (!rows[0]) throw new DomainError("not_found", "Map item not found");
  return toRecord(rows[0]);
}

export async function listFeatures(db: Db, tenantId: string, eventId: string): Promise<MapFeatureRecord[]> {
  await getEvent(db, tenantId, eventId);
  const { rows } = await db.query<Row>(
    `SELECT id, kind, category, label, notes, geometry, preferred, source, props, version FROM map_features
      WHERE tenant_id = $1 AND event_id = $2 AND removed_at IS NULL
      ORDER BY kind, label`,
    [tenantId, eventId]
  );
  const photos = await photosOf(db, tenantId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...toRecord(r), photos: photos.get(r.id) ?? [] }));
}

async function photosOf(db: Db, tenantId: string, ids: string[]): Promise<Map<string, PoiPhoto[]>> {
  const out = new Map<string, PoiPhoto[]>();
  if (ids.length === 0) return out;
  const { rows } = await db.query<{ id: string; parent_id: string; role: string | null; filename: string }>(
    `SELECT id, parent_id, role, filename FROM attachments
      WHERE tenant_id = $1 AND parent_type = 'map_feature' AND parent_id = ANY($2::uuid[]) AND state = 'available'
      ORDER BY created_at, id`,
    [tenantId, ids]
  );
  for (const r of rows) {
    const list = out.get(r.parent_id) ?? [];
    list.push({ id: r.id, role: r.role === "capture" ? "capture" : "photo", filename: r.filename });
    out.set(r.parent_id, list);
  }
  return out;
}

// Only one preferred route per category (e.g. the preferred delivery path).
async function clearOtherPreferred(t: Db, tenantId: string, eventId: string, category: string, exceptId: string) {
  await t.query(
    `UPDATE map_features SET preferred = false, version = version + 1, updated_at = now()
      WHERE tenant_id = $1 AND event_id = $2 AND kind = 'route' AND category = $3 AND preferred AND id <> $4 AND removed_at IS NULL`,
    [tenantId, eventId, category, exceptId]
  );
}

export async function createFeature(db: Db, ctx: CommandContext, eventId: string, cmd: ParsedCommand<MapFeatureFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.feature.create", occurredAt: cmd.occurredAt, payload: { eventId, ...cmd.payload } },
    async (t) => {
      const ev = await getEvent(t, ctx.tenantId, eventId);
      assertRace(ev.eventType, cmd.payload);
      await assertAddOn(t, ctx.tenantId, cmd.payload);
      const f = await placeOnCourse(t, ctx.tenantId, eventId, cmd.payload);
      const id = uuidv7();
      await t.query(
        `INSERT INTO map_features (id, tenant_id, event_id, kind, category, label, notes, geometry, preferred, source, props, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, ctx.tenantId, eventId, f.kind, f.category, f.label, f.notes, JSON.stringify(f.geometry), f.preferred, f.source, JSON.stringify(f.props), ctx.actorId]
      );
      if (f.preferred) await clearOtherPreferred(t, ctx.tenantId, eventId, f.category, id);
      const record = await getFeature(t, ctx.tenantId, eventId, id);
      return {
        result: record,
        audit: [{ action: "map.feature.created", recordType: "event", recordId: eventId, change: { id, kind: f.kind, category: f.category, label: f.label } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "map.feature.created", feature: record } }],
      };
    }
  );
}

export async function updateFeature(db: Db, ctx: CommandContext, eventId: string, id: string, cmd: ParsedCommand<MapFeatureFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.feature.update", occurredAt: cmd.occurredAt, payload: { eventId, id, ...cmd.payload } },
    async (t) => {
      const before = await getFeature(t, ctx.tenantId, eventId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this map item. Reload the map and try again.");
      }
      if (before.kind !== cmd.payload.kind) throw new DomainError("validation", "A map item can't change its kind", { field: "kind" });
      assertRace((await getEvent(t, ctx.tenantId, eventId)).eventType, cmd.payload);
      // DEC-032 item 6: a locked course keeps its shape until it is unlocked.
      if (before.props?.locked && JSON.stringify(before.geometry) !== JSON.stringify(cmd.payload.geometry)) {
        throw new DomainError("validation", "This course is locked. Unlock it before changing its shape.", { field: "geometry", reason: "locked" });
      }
      await assertAddOn(t, ctx.tenantId, cmd.payload);
      if (cmd.payload.props.courseId === id) throw new DomainError("validation", "A point can't be placed on itself", { field: "props" });
      const f = await placeOnCourse(t, ctx.tenantId, eventId, cmd.payload);
      await t.query(
        `UPDATE map_features SET category = $4, label = $5, notes = $6, geometry = $7, preferred = $8, source = $9, props = $10,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND event_id = $2 AND id = $3`,
        [ctx.tenantId, eventId, id, f.category, f.label, f.notes, JSON.stringify(f.geometry), f.preferred, f.source, JSON.stringify(f.props)]
      );
      if (f.preferred) await clearOtherPreferred(t, ctx.tenantId, eventId, f.category, id);
      if (f.category === "course" && f.geometry.type === "LineString") {
        await moveLinkedPoints(t, ctx.tenantId, eventId, id, f.geometry.coordinates);
      }
      const after = await getFeature(t, ctx.tenantId, eventId, id);
      return {
        result: after,
        audit: [
          {
            action: "map.feature.updated",
            recordType: "event",
            recordId: eventId,
            change: {
              id,
              before: { label: before.label, category: before.category, version: before.version, locked: before.props?.locked ?? false },
              after: { label: f.label, category: f.category, locked: f.props.locked ?? false },
            },
          },
        ],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "map.feature.updated", feature: after } }],
      };
    }
  );
}

// Removing hides the item from the map; the row and its history stay.
export async function removeFeature(db: Db, ctx: CommandContext, eventId: string, id: string, cmd: ParsedCommand<unknown>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.feature.remove", occurredAt: cmd.occurredAt, payload: { eventId, id } },
    async (t) => {
      const before = await getFeature(t, ctx.tenantId, eventId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this map item. Reload the map and try again.");
      }
      await t.query("UPDATE map_features SET removed_at = now(), version = version + 1 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, id]);
      // Points placed on a removed course stay where they are, no longer tied to it.
      await t.query(
        `UPDATE map_features SET props = props - 'courseId' - 'distanceM', version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND event_id = $2 AND removed_at IS NULL AND props->>'courseId' = $3`,
        [ctx.tenantId, eventId, id]
      );
      return {
        result: { id, removed: true },
        audit: [{ action: "map.feature.removed", recordType: "event", recordId: eventId, change: { id, label: before.label } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "map.feature.removed", id } }],
      };
    }
  );
}

// ================================================================ pictures (DEC-044)
// A point of interest keeps up to three pictures: photos taken there, or
// captures of the map zoomed in on it (streets, corners) for the crew.
export interface PoiPhotoUpload {
  commandId: string;
  occurredAt: string;
  role: "photo" | "capture";
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export async function addPoiPhoto(db: Db, store: FileStore, ctx: CommandContext, eventId: string, featureId: string, up: PoiPhotoUpload) {
  const sha256 = crypto.createHash("sha256").update(up.bytes).digest("hex");
  return executeCommand(
    db,
    ctx,
    {
      commandId: up.commandId,
      commandType: "map.photo.add",
      occurredAt: up.occurredAt,
      payload: { eventId, featureId, role: up.role, sha256, byteSize: up.bytes.length, contentType: up.contentType, filename: up.filename },
    },
    async (t) => {
      // The point's row is locked so two uploads at once can't pass the limit.
      const { rows } = await t.query<{ kind: string }>(
        "SELECT kind FROM map_features WHERE tenant_id = $1 AND event_id = $2 AND id = $3 AND removed_at IS NULL FOR UPDATE",
        [ctx.tenantId, eventId, featureId]
      );
      if (!rows[0]) throw new DomainError("not_found", "Map item not found");
      if (rows[0].kind !== "point") throw new DomainError("validation", "Pictures go on points of interest", { field: "kind" });
      const have = (await photosOf(t, ctx.tenantId, [featureId])).get(featureId)?.length ?? 0;
      if (have >= MAX_POI_PHOTOS) {
        throw new DomainError("validation", `A point keeps up to ${MAX_POI_PHOTOS} pictures. Remove one first.`, {
          field: "photo",
          reason: "limit",
          max: MAX_POI_PHOTOS,
        });
      }
      const attachmentId = uuidv7();
      const key = `${ctx.tenantId}/${attachmentId}`;
      try {
        await store.put(key, up.bytes);
      } catch {
        throw new DomainError("provider_failure", "The picture could not be stored. Nothing was changed.");
      }
      await t.query(
        `INSERT INTO attachments (id, tenant_id, parent_type, parent_id, filename, content_type, byte_size, sha256, storage_key, state, uploaded_by, role)
         VALUES ($1, $2, 'map_feature', $3, $4, $5, $6, $7, $8, 'available', $9, $10)`,
        [attachmentId, ctx.tenantId, featureId, up.filename, up.contentType, up.bytes.length, sha256, key, ctx.actorId, up.role]
      );
      return {
        result: { id: attachmentId, role: up.role, filename: up.filename },
        audit: [
          {
            action: "map.photo.added",
            recordType: "event",
            recordId: eventId,
            change: { featureId, attachmentId, role: up.role, filename: up.filename, byteSize: up.bytes.length, sha256 },
          },
        ],
        outbox: [{ aggregateType: "attachment", aggregateId: attachmentId, payload: { type: "attachment.stored", featureId, sha256, byteSize: up.bytes.length } }],
      };
    }
  );
}

// Removing hides the picture; the file and its record stay (a session Clear
// can bring it back).
export async function removePoiPhoto(db: Db, ctx: CommandContext, eventId: string, featureId: string, attachmentId: string, cmd: ParsedCommand<unknown>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.photo.remove", occurredAt: cmd.occurredAt, payload: { eventId, featureId, attachmentId } },
    async (t) => {
      await getFeature(t, ctx.tenantId, eventId, featureId);
      const { rows } = await t.query(
        `UPDATE attachments SET state = 'removed', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND parent_type = 'map_feature' AND parent_id = $3 AND state = 'available' RETURNING id`,
        [ctx.tenantId, attachmentId, featureId]
      );
      if (rows.length === 0) throw new DomainError("not_found", "Picture not found");
      return {
        result: { id: attachmentId, removed: true },
        audit: [{ action: "map.photo.removed", recordType: "event", recordId: eventId, change: { featureId, attachmentId } }],
      };
    }
  );
}

// ================================================================ session Clear (DEC-044)
// "Go back to where I started on this map" (Walter, 2026-10-02): the map is
// put back exactly as it was when it was opened - items added since are
// removed, items changed or removed come back as they were, and so do their
// pictures. Ids stay the same, so nothing linked to an item is lost. One
// step, recorded as one change.
export const sessionSnapshot = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        fields: mapFeatureFields,
        photos: z.array(z.string().uuid()).max(MAX_POI_PHOTOS).default([]),
      })
    )
    .max(5000),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshot>;

export async function restoreSession(db: Db, ctx: CommandContext, eventId: string, cmd: ParsedCommand<SessionSnapshot>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.session.restore", occurredAt: cmd.occurredAt, payload: { eventId, items: cmd.payload.items.length } },
    async (t) => {
      const ev = await getEvent(t, ctx.tenantId, eventId);
      const { rows: all } = await t.query<{ id: string; removed: boolean }>(
        "SELECT id, removed_at IS NOT NULL AS removed FROM map_features WHERE tenant_id = $1 AND event_id = $2 FOR UPDATE",
        [ctx.tenantId, eventId]
      );
      const known = new Set(all.map((r) => r.id));
      const keep = new Set(cmd.payload.items.map((i) => i.id));
      for (const i of cmd.payload.items) {
        if (!known.has(i.id)) throw new DomainError("validation", "That map state belongs to another Event", { field: "items" });
        assertRace(ev.eventType, i.fields);
        await assertAddOn(t, ctx.tenantId, i.fields);
      }
      let removed = 0;
      for (const r of all) {
        if (!r.removed && !keep.has(r.id)) {
          await t.query("UPDATE map_features SET removed_at = now(), version = version + 1 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, r.id]);
          removed++;
        }
      }
      for (const i of cmd.payload.items) {
        const f = i.fields;
        await t.query(
          `UPDATE map_features SET category = $3, label = $4, notes = $5, geometry = $6, preferred = $7, source = $8, props = $9,
                  removed_at = NULL, version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, i.id, f.category, f.label, f.notes, JSON.stringify(f.geometry), f.preferred, f.source, JSON.stringify(f.props)]
        );
      }
      // Pictures: as they were when the map was opened.
      const wanted = cmd.payload.items.flatMap((i) => i.photos);
      await t.query(
        `UPDATE attachments SET state = CASE WHEN id = ANY($3::uuid[]) THEN 'available' ELSE 'removed' END, updated_at = now()
          WHERE tenant_id = $1 AND parent_type = 'map_feature' AND parent_id = ANY($2::uuid[])
            AND state IN ('available', 'removed') AND (state = 'available') <> (id = ANY($3::uuid[]))`,
        [ctx.tenantId, all.map((r) => r.id), wanted]
      );
      return {
        result: { restored: cmd.payload.items.length, removed },
        audit: [{ action: "map.session.restored", recordType: "event", recordId: eventId, change: { items: cmd.payload.items.length, removedSince: removed } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "map.session.restored" } }],
      };
    }
  );
}

// Picture uploads send the raw image as the body; the command envelope
// travels in headers (as for product photos).
const poiPhotoHeaders = z.object({
  "x-command-id": z.string().uuid(),
  "x-occurred-at": z.string().datetime({ offset: true }),
  "x-filename": z.string().max(300).optional(),
  "x-photo-role": z.enum(["photo", "capture"]).default("photo"),
});

export function mapRoutes(app: FastifyInstance, db: Db, config: Config, store: FileStore): void {
  app.get("/api/events/:id/map", async (req) => {
    const auth = requireAuth(req);
    const eventId = idParam(req);
    return { items: await listFeatures(db, auth.tenantId, eventId), features: await tenantFeatures(db, auth.tenantId) };
  });

  app.post("/api/events/:id/map", async (req, reply) => {
    const eventId = idParam(req);
    const { ctx, cmd } = commandRequest(req, "map.edit", mapFeatureFields, config.deploymentId, config.now());
    const res = await createFeature(db, ctx, eventId, cmd);
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  app.put("/api/events/:id/map/:featureId", async (req) => {
    const eventId = idParam(req);
    const id = idParam(req, "featureId");
    const { ctx, cmd } = commandRequest(req, "map.edit", mapFeatureFields, config.deploymentId, config.now());
    return updateFeature(db, ctx, eventId, id, cmd);
  });

  app.post("/api/events/:id/map/:featureId/remove", async (req) => {
    const eventId = idParam(req);
    const id = idParam(req, "featureId");
    const { ctx, cmd } = commandRequest(req, "map.edit", z.object({}).passthrough(), config.deploymentId, config.now());
    return removeFeature(db, ctx, eventId, id, cmd);
  });

  // Session Clear (DEC-044): the map back as it was when it was opened.
  app.post("/api/events/:id/map/restore", async (req) => {
    const eventId = idParam(req);
    const { ctx, cmd } = commandRequest(req, "map.edit", sessionSnapshot, config.deploymentId, config.now());
    return restoreSession(db, ctx, eventId, cmd);
  });

  // Pictures of a point of interest (DEC-044).
  app.put("/api/events/:id/map/:featureId/photos", { bodyLimit: MAX_PHOTO_BYTES }, async (req, reply) => {
    const auth = requireCapability(req, "map.edit");
    const eventId = idParam(req);
    const featureId = idParam(req, "featureId");
    const h = poiPhotoHeaders.safeParse(req.headers);
    if (!h.success) throw new DomainError("validation", "Missing command headers for the picture upload");
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new DomainError("validation", "No image received");
    const contentType = sniffImage(bytes);
    if (!contentType) throw new DomainError("validation", "Only JPEG, PNG or WebP images are accepted", { field: "photo" });
    const res = await addPoiPhoto(db, store, { tenantId: auth.tenantId, actorId: auth.userId, deploymentId: config.deploymentId }, eventId, featureId, {
      commandId: h.data["x-command-id"],
      occurredAt: h.data["x-occurred-at"],
      role: h.data["x-photo-role"],
      filename: decodeURIComponent(h.data["x-filename"] ?? "picture"),
      contentType,
      bytes,
    });
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  app.post("/api/events/:id/map/:featureId/photos/:photoId/remove", async (req) => {
    const eventId = idParam(req);
    const featureId = idParam(req, "featureId");
    const photoId = idParam(req, "photoId");
    const { ctx, cmd } = commandRequest(req, "map.edit", z.object({}).passthrough(), config.deploymentId, config.now());
    return removePoiPhoto(db, ctx, eventId, featureId, photoId, cmd);
  });
}
