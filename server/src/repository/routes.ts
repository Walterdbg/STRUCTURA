import type { FastifyInstance } from "fastify";
import {
  DomainError,
  lineLength,
  repositoryRouteFields,
  toGpx,
  uuidv7,
  type FeatureProps,
  type Geometry,
  type RepositoryRouteFields,
  type RouteLocation,
  routeLocationFields,
  type Waypoint,
} from "@structura/domain";
import { requireAuth, requirePlatformAdmin } from "../auth.js";
import { executeCommand, type CommandContext } from "../commands.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { tenantFeatures } from "../events/maps.js";
import { commandRequest, idParam, type ParsedCommand } from "../http.js";
import { z } from "zod";

// Maps repository (DEC-033): race courses, delivery and pickup routes made
// ahead of time, outside any Event. Every save is a new version stored as a
// GPX file; versions are never changed. Events take a route as their own
// copy. Courses need the courses add-on, like on the Event map.

export interface RepositoryRoute {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  currentVersion: number;
  version: number;
  lengthMeters: number;
  geometry: Geometry;
  props: FeatureProps;
  waypoints: Waypoint[];
  country: string | null;
  area: string | null;
  place: string | null;
  updatedAt: string;
}

export interface RepositoryVersion {
  version: number;
  lengthMeters: number;
  source: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface Row {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  current_version: number;
  version: number;
  length_m: string;
  geometry: Geometry;
  props: FeatureProps | null;
  waypoints: Waypoint[] | null;
  country: string | null;
  area: string | null;
  place: string | null;
  updated_at: Date | string;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const toRecord = (r: Row): RepositoryRoute => ({
  id: r.id,
  name: r.name,
  category: r.category,
  notes: r.notes,
  currentVersion: r.current_version,
  version: r.version,
  lengthMeters: Math.round(Number(r.length_m)),
  geometry: r.geometry,
  props: r.props ?? {},
  waypoints: r.waypoints ?? [],
  country: r.country,
  area: r.area,
  place: r.place,
  updatedAt: iso(r.updated_at),
});

const SELECT = `
  SELECT r.id, r.name, r.category, r.notes, r.current_version, r.version, r.updated_at, r.country, r.area, r.place,
         v.length_m, v.geometry, v.props, v.waypoints
    FROM route_repository r
    JOIN route_repository_versions v ON v.tenant_id = r.tenant_id AND v.route_id = r.id AND v.version = r.current_version`;

export async function getRoute(db: Db, tenantId: string, id: string): Promise<RepositoryRoute> {
  const { rows } = await db.query<Row>(`${SELECT} WHERE r.tenant_id = $1 AND r.id = $2 AND r.removed_at IS NULL`, [tenantId, id]);
  if (!rows[0]) throw new DomainError("not_found", "Route not found");
  return toRecord(rows[0]);
}

async function assertCourses(t: Db, tenantId: string, f: RepositoryRouteFields) {
  if (f.category === "course" && !(await tenantFeatures(t, tenantId)).includes("courses")) {
    throw new DomainError("license_restricted", "Running courses are a paid add-on that is not active for this organization", { feature: "courses" });
  }
}

async function addVersion(t: Db, ctx: CommandContext, routeId: string, version: number, f: RepositoryRouteFields) {
  const coords = f.geometry.coordinates as number[][];
  await t.query(
    `INSERT INTO route_repository_versions (id, tenant_id, route_id, version, gpx, geometry, props, length_m, source, created_by, waypoints)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      uuidv7(),
      ctx.tenantId,
      routeId,
      version,
      toGpx(f.name, coords, f.waypoints),
      JSON.stringify(f.geometry),
      JSON.stringify(f.props),
      lineLength(coords),
      f.source,
      ctx.actorId,
      JSON.stringify(f.waypoints),
    ]
  );
}

export async function createRoute(db: Db, ctx: CommandContext, cmd: ParsedCommand<RepositoryRouteFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "repository.route.create", occurredAt: cmd.occurredAt, payload: cmd.payload },
    async (t) => {
      const f = cmd.payload;
      await assertCourses(t, ctx.tenantId, f);
      const id = uuidv7();
      await t.query(
        `INSERT INTO route_repository (id, tenant_id, name, category, notes, created_by, country, area, place) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, ctx.tenantId, f.name, f.category, f.notes, ctx.actorId, f.country, f.area, f.place]
      );
      await addVersion(t, ctx, id, 1, f);
      const record = await getRoute(t, ctx.tenantId, id);
      return {
        result: record,
        audit: [{ action: "repository.route.created", recordType: "route", recordId: id, change: { name: f.name, category: f.category, version: 1, source: f.source } }],
        outbox: [],
      };
    }
  );
}

// A change saves a new GPX version; the old ones stay as they were.
export async function updateRoute(db: Db, ctx: CommandContext, id: string, cmd: ParsedCommand<RepositoryRouteFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "repository.route.update", occurredAt: cmd.occurredAt, payload: { id, ...cmd.payload } },
    async (t) => {
      const before = await getRoute(t, ctx.tenantId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this route. Reload it and try again.");
      }
      const f = cmd.payload;
      if (before.props.locked && JSON.stringify(before.geometry) !== JSON.stringify(f.geometry)) {
        throw new DomainError("validation", "This course is locked. Unlock it before changing its shape.", { field: "geometry", reason: "locked" });
      }
      await assertCourses(t, ctx.tenantId, f);
      const next = before.currentVersion + 1;
      await addVersion(t, ctx, id, next, f);
      await t.query(
        `UPDATE route_repository SET name = $3, category = $4, notes = $5, current_version = $6, country = $7, area = $8, place = $9,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, id, f.name, f.category, f.notes, next, f.country, f.area, f.place]
      );
      const after = await getRoute(t, ctx.tenantId, id);
      return {
        result: after,
        audit: [{ action: "repository.route.updated", recordType: "route", recordId: id, change: { before: { name: before.name, version: before.currentVersion }, after: { name: f.name, version: next } } }],
        outbox: [],
      };
    }
  );
}

// The general location only (grouping): recorded in the history, no new GPX version.
export async function setRouteLocation(db: Db, ctx: CommandContext, id: string, cmd: ParsedCommand<RouteLocation>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "repository.route.location", occurredAt: cmd.occurredAt, payload: { id, ...cmd.payload } },
    async (t) => {
      const before = await getRoute(t, ctx.tenantId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this route. Reload it and try again.");
      }
      const p = cmd.payload;
      await t.query(
        "UPDATE route_repository SET country = $3, area = $4, place = $5, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2",
        [ctx.tenantId, id, p.country, p.area, p.place]
      );
      return {
        result: await getRoute(t, ctx.tenantId, id),
        audit: [
          {
            action: "repository.route.location",
            recordType: "route",
            recordId: id,
            change: { before: { country: before.country, area: before.area, place: before.place }, after: p },
          },
        ],
        outbox: [],
      };
    }
  );
}

export async function removeRoute(db: Db, ctx: CommandContext, id: string, cmd: ParsedCommand<unknown>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "repository.route.remove", occurredAt: cmd.occurredAt, payload: { id } },
    async (t) => {
      const before = await getRoute(t, ctx.tenantId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this route. Reload it and try again.");
      }
      await t.query("UPDATE route_repository SET removed_at = now(), version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, id]);
      return {
        result: { id },
        audit: [{ action: "repository.route.removed", recordType: "route", recordId: id, change: { name: before.name } }],
        outbox: [],
      };
    }
  );
}

export function repositoryRoutes(app: FastifyInstance, db: Db, config: Config): void {
  app.get("/api/repository/routes", async (req) => {
    const auth = requireAuth(req);
    const q = String((req.query as Record<string, string | undefined>).search ?? "").trim();
    const params: unknown[] = [auth.tenantId];
    let cond = "r.tenant_id = $1 AND r.removed_at IS NULL";
    if (q) {
      params.push(`%${q}%`);
      cond += ` AND (r.name ILIKE $2 OR r.notes ILIKE $2 OR r.place ILIKE $2 OR r.area ILIKE $2 OR r.country ILIKE $2)`;
    }
    // Grouped by general location (country, area, place), then name.
    const { rows } = await db.query<Row>(`${SELECT} WHERE ${cond} ORDER BY r.country NULLS LAST, r.area NULLS LAST, r.place NULLS LAST, r.name`, params);
    // The list carries no geometry (it can be long); open a route for it.
    return { items: rows.map((r) => ({ ...toRecord(r), geometry: undefined, waypoints: undefined, waypointCount: (r.waypoints ?? []).length })) };
  });

  app.get("/api/repository/routes/:id", async (req) => {
    const auth = requireAuth(req);
    const id = idParam(req);
    const route = await getRoute(db, auth.tenantId, id);
    const { rows } = await db.query<{ version: number; length_m: string; source: string | null; created_at: Date | string; created_by: string | null }>(
      `SELECT v.version, v.length_m, v.source, v.created_at, u.display_name AS created_by
         FROM route_repository_versions v LEFT JOIN users u ON u.id = v.created_by
        WHERE v.tenant_id = $1 AND v.route_id = $2 ORDER BY v.version DESC`,
      [auth.tenantId, id]
    );
    const versions: RepositoryVersion[] = rows.map((v) => ({
      version: v.version,
      lengthMeters: Math.round(Number(v.length_m)),
      source: v.source,
      createdAt: iso(v.created_at),
      createdBy: v.created_by,
    }));
    return { ...route, versions };
  });

  // The GPX file of a version (the current one unless ?version= is given).
  app.get("/api/repository/routes/:id/gpx", async (req, reply) => {
    const auth = requireAuth(req);
    const id = idParam(req);
    const route = await getRoute(db, auth.tenantId, id);
    const v = z.coerce.number().int().min(1).optional().safeParse((req.query as Record<string, string | undefined>).version);
    const version = v.success && v.data ? v.data : route.currentVersion;
    const { rows } = await db.query<{ gpx: string }>(
      "SELECT gpx FROM route_repository_versions WHERE tenant_id = $1 AND route_id = $2 AND version = $3",
      [auth.tenantId, id, version]
    );
    if (!rows[0]) throw new DomainError("not_found", "Version not found");
    const file = `${route.name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "_")} v${version}.gpx`;
    return reply
      .header("content-type", "application/gpx+xml; charset=utf-8")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(file)}"`)
      .send(rows[0].gpx);
  });

  // ------------------------------------------------------------ platform level
  // DEC-039: the platform administrator sees the course library of every
  // organization, grouped by country > area > place, read-only.
  app.get("/api/platform/routes", async (req) => {
    requirePlatformAdmin(req);
    const q = String((req.query as Record<string, string | undefined>).search ?? "").trim();
    const params: unknown[] = [];
    let cond = "r.removed_at IS NULL";
    if (q) {
      params.push(`%${q}%`);
      cond += ` AND (r.name ILIKE $1 OR r.notes ILIKE $1 OR r.place ILIKE $1 OR r.area ILIKE $1 OR r.country ILIKE $1 OR t.display_name ILIKE $1)`;
    }
    const { rows } = await db.query<Row & { tenant_name: string }>(
      `${SELECT.replace("FROM route_repository r", "FROM route_repository r JOIN tenants t ON t.id = r.tenant_id").replace("SELECT r.id,", "SELECT t.display_name AS tenant_name, r.id,")}
        WHERE ${cond} ORDER BY r.country NULLS LAST, r.area NULLS LAST, r.place NULLS LAST, r.name`,
      params
    );
    return { items: rows.map((r) => ({ ...toRecord(r), geometry: undefined, waypoints: undefined, waypointCount: (r.waypoints ?? []).length, organization: r.tenant_name })) };
  });

  async function platformRoute(id: string): Promise<{ tenantId: string; organization: string }> {
    const { rows } = await db.query<{ tenant_id: string; display_name: string }>(
      "SELECT r.tenant_id, t.display_name FROM route_repository r JOIN tenants t ON t.id = r.tenant_id WHERE r.id = $1 AND r.removed_at IS NULL",
      [id]
    );
    if (!rows[0]) throw new DomainError("not_found", "Route not found");
    return { tenantId: rows[0].tenant_id, organization: rows[0].display_name };
  }

  app.get("/api/platform/routes/:id", async (req) => {
    requirePlatformAdmin(req);
    const id = idParam(req);
    const { tenantId, organization } = await platformRoute(id);
    return { ...(await getRoute(db, tenantId, id)), organization };
  });

  app.get("/api/platform/routes/:id/gpx", async (req, reply) => {
    requirePlatformAdmin(req);
    const id = idParam(req);
    const { tenantId } = await platformRoute(id);
    const route = await getRoute(db, tenantId, id);
    const { rows } = await db.query<{ gpx: string }>("SELECT gpx FROM route_repository_versions WHERE tenant_id = $1 AND route_id = $2 AND version = $3", [
      tenantId,
      id,
      route.currentVersion,
    ]);
    const file = `${route.name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "_")} v${route.currentVersion}.gpx`;
    return reply
      .header("content-type", "application/gpx+xml; charset=utf-8")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(file)}"`)
      .send(rows[0]!.gpx);
  });

  app.post("/api/repository/routes", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "map.edit", repositoryRouteFields, config.deploymentId, config.now());
    const res = await createRoute(db, ctx, cmd);
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  app.put("/api/repository/routes/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "map.edit", repositoryRouteFields, config.deploymentId, config.now());
    return updateRoute(db, ctx, id, cmd);
  });

  app.put("/api/repository/routes/:id/location", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "map.edit", routeLocationFields, config.deploymentId, config.now());
    return setRouteLocation(db, ctx, id, cmd);
  });

  app.post("/api/repository/routes/:id/remove", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "map.edit", z.object({}).passthrough(), config.deploymentId, config.now());
    return removeRoute(db, ctx, id, cmd);
  });
}
