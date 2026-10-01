import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError, lineLength, mapFeatureFields, uuidv7, type Geometry, type MapFeatureFields } from "@structura/domain";
import { requireAuth } from "../auth.js";
import { executeCommand, type CommandContext } from "../commands.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam, type ParsedCommand } from "../http.js";
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
  lengthMeters: number | null;
  version: number;
}

interface Row {
  id: string;
  kind: MapFeatureRecord["kind"];
  category: string;
  label: string;
  notes: string | null;
  geometry: Geometry;
  preferred: boolean;
  source: string | null;
  version: number;
}

const toRecord = (r: Row): MapFeatureRecord => ({
  ...r,
  lengthMeters: r.geometry.type === "LineString" ? Math.round(lineLength(r.geometry.coordinates)) : null,
});

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
  if (f.kind === "route" && f.category === "course" && !(await tenantFeatures(t, tenantId)).includes("courses")) {
    throw new DomainError("license_restricted", "Running courses are a paid add-on that is not active for this organization", {
      feature: "courses",
    });
  }
}

async function getFeature(t: Db, tenantId: string, eventId: string, id: string): Promise<MapFeatureRecord> {
  const { rows } = await t.query<Row>(
    `SELECT id, kind, category, label, notes, geometry, preferred, source, version FROM map_features
      WHERE tenant_id = $1 AND event_id = $2 AND id = $3 AND removed_at IS NULL`,
    [tenantId, eventId, id]
  );
  if (!rows[0]) throw new DomainError("not_found", "Map item not found");
  return toRecord(rows[0]);
}

export async function listFeatures(db: Db, tenantId: string, eventId: string): Promise<MapFeatureRecord[]> {
  await getEvent(db, tenantId, eventId);
  const { rows } = await db.query<Row>(
    `SELECT id, kind, category, label, notes, geometry, preferred, source, version FROM map_features
      WHERE tenant_id = $1 AND event_id = $2 AND removed_at IS NULL
      ORDER BY kind, label`,
    [tenantId, eventId]
  );
  return rows.map(toRecord);
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
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.feature.create", occurredAt: cmd.occurredAt, payload: { eventId, ...f } },
    async (t) => {
      await getEvent(t, ctx.tenantId, eventId);
      await assertAddOn(t, ctx.tenantId, f);
      const id = uuidv7();
      await t.query(
        `INSERT INTO map_features (id, tenant_id, event_id, kind, category, label, notes, geometry, preferred, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, ctx.tenantId, eventId, f.kind, f.category, f.label, f.notes, JSON.stringify(f.geometry), f.preferred, f.source, ctx.actorId]
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
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "map.feature.update", occurredAt: cmd.occurredAt, payload: { eventId, id, ...f } },
    async (t) => {
      const before = await getFeature(t, ctx.tenantId, eventId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this map item. Reload the map and try again.");
      }
      if (before.kind !== f.kind) throw new DomainError("validation", "A map item can't change its kind", { field: "kind" });
      await assertAddOn(t, ctx.tenantId, f);
      await t.query(
        `UPDATE map_features SET category = $4, label = $5, notes = $6, geometry = $7, preferred = $8, source = $9,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND event_id = $2 AND id = $3`,
        [ctx.tenantId, eventId, id, f.category, f.label, f.notes, JSON.stringify(f.geometry), f.preferred, f.source]
      );
      if (f.preferred) await clearOtherPreferred(t, ctx.tenantId, eventId, f.category, id);
      const after = await getFeature(t, ctx.tenantId, eventId, id);
      return {
        result: after,
        audit: [
          {
            action: "map.feature.updated",
            recordType: "event",
            recordId: eventId,
            change: { id, before: { label: before.label, category: before.category, version: before.version }, after: { label: f.label, category: f.category } },
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
      return {
        result: { id, removed: true },
        audit: [{ action: "map.feature.removed", recordType: "event", recordId: eventId, change: { id, label: before.label } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "map.feature.removed", id } }],
      };
    }
  );
}

export function mapRoutes(app: FastifyInstance, db: Db, config: Config): void {
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
}
