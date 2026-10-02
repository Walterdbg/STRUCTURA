import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { command, login, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
beforeEach(async () => {
  w = await world();
  t = await tenant(w);
  await w.db.query("UPDATE tenants SET features = '{courses}' WHERE id = $1", [t.tenantId]);
});
afterEach(async () => {
  await w.close();
});

const req = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown, expectedVersion: number | null = null, cookie = t.cookie) =>
  w.app.inject({ method, url, headers: { cookie }, ...(payload !== undefined ? { payload: command(payload, { expectedVersion }) } : {}) });

const course = {
  name: "10K Cinta Costera",
  category: "course",
  geometry: { type: "LineString", coordinates: [[-79.53, 8.97, 3], [-79.52, 8.975, 5], [-79.51, 8.98, 4]] },
  props: { anchorIdx: [0, 2], segModes: ["l"] },
  source: "cinta.gpx",
  waypoints: [
    { name: "Start", coordinates: [-79.53, 8.97] },
    { name: "WATER STATION 1", coordinates: [-79.52, 8.975, 5], symbol: "Flag, Blue" },
  ],
};

describe("Maps repository (DEC-033)", () => {
  it("saves a course as GPX; each change is a new GPX version and older versions stay", async () => {
    const created = await req("POST", "/api/repository/routes", course);
    expect(created.statusCode, created.body).toBe(201);
    const r = created.json().result;
    expect(r).toMatchObject({ name: "10K Cinta Costera", category: "course", currentVersion: 1 });
    expect(r.lengthMeters).toBeGreaterThan(2000);

    const moved = { ...course, name: "10K Cinta Costera 2027", geometry: { type: "LineString", coordinates: [[-79.53, 8.97], [-79.5, 8.99]] } };
    const updated = await req("PUT", `/api/repository/routes/${r.id}`, moved, r.version);
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().result.currentVersion).toBe(2);
    expect((await req("PUT", `/api/repository/routes/${r.id}`, moved, r.version)).statusCode).toBe(409); // stale

    const detail = (await req("GET", `/api/repository/routes/${r.id}`)).json();
    expect(detail.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = await req("GET", `/api/repository/routes/${r.id}/gpx?version=1`);
    expect(v1.headers["content-type"]).toContain("application/gpx+xml");
    expect(v1.body).toContain("<name>10K Cinta Costera</name>");
    expect(v1.body).toContain('<trkpt lat="8.975" lon="-79.52"><ele>5</ele></trkpt>');
    // The course's marked points stay with it, in the GPX too.
    expect(v1.body).toContain('<wpt lat="8.975" lon="-79.52"><ele>5</ele><name>WATER STATION 1</name><sym>Flag, Blue</sym></wpt>');
    expect(detail.waypoints).toHaveLength(2);
    const current = await req("GET", `/api/repository/routes/${r.id}/gpx`);
    expect(current.body).toContain("<name>10K Cinta Costera 2027</name>");
    // Versions can never be changed.
    await expect(w.db.query("UPDATE route_repository_versions SET gpx = 'x'")).rejects.toThrow(/append_only/);
  });

  it("keeps a general location for grouping; changing it is recorded but is no new GPX version", async () => {
    const r = (await req("POST", "/api/repository/routes", { ...course, country: "USA", area: "New Jersey", place: "Liberty State Park" })).json().result;
    expect(r).toMatchObject({ country: "USA", area: "New Jersey", place: "Liberty State Park", currentVersion: 1 });
    const moved = await req("PUT", `/api/repository/routes/${r.id}/location`, { country: "USA", area: "New York", place: "Central Park" }, r.version);
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json().result).toMatchObject({ area: "New York", place: "Central Park", currentVersion: 1 });
    expect((await req("GET", "/api/repository/routes?search=Central")).json().items).toHaveLength(1);
  });

  it("delivery routes need no add-on; courses do", async () => {
    await w.db.query("UPDATE tenants SET features = '{}' WHERE id = $1", [t.tenantId]);
    const locked = await req("POST", "/api/repository/routes", course);
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error).toBe("license_restricted");
    const delivery = { ...course, name: "Entrega bodega", category: "delivery", props: {} };
    expect((await req("POST", "/api/repository/routes", delivery)).statusCode).toBe(201);
    expect((await req("POST", "/api/repository/routes", { ...delivery, props: { laps: 2 } })).statusCode).toBe(400); // laps are for courses
  });

  it("a locked course keeps its shape; removing keeps its versions; other organizations can't see it", async () => {
    const r = (await req("POST", "/api/repository/routes", { ...course, props: { locked: true } })).json().result;
    const moved = { ...course, props: { locked: true }, geometry: { type: "LineString", coordinates: [[-79.53, 8.97], [-79.5, 8.99]] } };
    const refused = await req("PUT", `/api/repository/routes/${r.id}`, moved, r.version);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().details).toMatchObject({ reason: "locked" });
    const other = await tenant(w, "Other");
    expect((await req("GET", `/api/repository/routes/${r.id}`, undefined, null, other.cookie)).statusCode).toBe(404);
    expect((await req("POST", `/api/repository/routes/${r.id}/remove`, {}, r.version)).statusCode).toBe(200);
    expect((await req("GET", "/api/repository/routes")).json().items).toEqual([]);
    const { rows } = await w.db.query("SELECT count(*)::int AS n FROM route_repository_versions");
    expect(rows[0]).toMatchObject({ n: 1 });
  });

  it("platform administrators see every organization's courses, grouped; nobody else does (DEC-039)", async () => {
    await req("POST", "/api/repository/routes", { ...course, country: "USA", area: "New Jersey", place: "Lincoln Park" });
    const other = await tenant(w, "Otra org");
    await w.db.query("UPDATE tenants SET features = '{courses}' WHERE id = $1", [other.tenantId]);
    const theirs = (await req("POST", "/api/repository/routes", { ...course, name: "Cinta 10K", country: "Panama", area: "Panamá", place: null }, null, other.cookie)).json().result;
    expect((await req("GET", "/api/platform/routes")).statusCode).toBe(403);
    await w.db.query("UPDATE users SET platform_admin = true WHERE id = $1", [t.adminId]);
    const all = (await req("GET", "/api/platform/routes")).json().items as { name: string; organization: string; country: string }[];
    expect(all.map((i) => [i.country, i.organization])).toEqual([
      ["Panama", "Otra org"],
      ["USA", expect.any(String)],
    ]);
    expect((await req("GET", `/api/platform/routes/${theirs.id}`)).json()).toMatchObject({ name: "Cinta 10K", organization: "Otra org" });
    expect((await req("GET", `/api/platform/routes/${theirs.id}/gpx`)).body).toContain("<name>Cinta 10K</name>");
    // Their own library still shows only their own courses.
    expect((await req("GET", "/api/repository/routes", undefined, null, other.cookie)).json().items).toHaveLength(1);
  });

  it("anyone in the organization can see the repository; changing it needs map.edit", async () => {
    await req("POST", "/api/repository/routes", course);
    await w.app.inject({ method: "POST", url: "/api/members", headers: { cookie: t.cookie }, payload: command({ email: "op@example.test", displayName: "Op", password: "operator-pass-1", preset: "inventory_operator" }) });
    const op = await login(w.app, "op@example.test", "operator-pass-1");
    expect((await req("GET", "/api/repository/routes", undefined, null, op)).json().items).toHaveLength(1);
    expect((await req("POST", "/api/repository/routes", course, null, op)).statusCode).toBe(403);
  });
});
