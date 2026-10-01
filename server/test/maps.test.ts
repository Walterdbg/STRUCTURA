import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { count } from "./helpers.js";
import { command, login, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
let eventId: string;

beforeEach(async () => {
  w = await world();
  t = await tenant(w);
  eventId = (
    await w.app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: t.cookie },
      payload: command({ designation: "Triatlón Coronado", responsibleUserId: t.adminId, timezone: "America/Panama" }),
    })
  ).json().result.id;
});
afterEach(async () => {
  await w.close();
});

const add = (payload: Record<string, unknown>, cookie = t.cookie) =>
  w.app.inject({ method: "POST", url: `/api/events/${eventId}/map`, headers: { cookie }, payload: command(payload) });
const map = (cookie = t.cookie) => w.app.inject({ method: "GET", url: `/api/events/${eventId}/map`, headers: { cookie } });

const stage = { kind: "point", category: "stage", label: "Tarima uno", geometry: { type: "Point", coordinates: [-79.8896, 8.5282] } };
const toilets = { kind: "point", category: "toilets", label: "Baños portátiles norte", geometry: { type: "Point", coordinates: [-79.8901, 8.5291] } };
const bar = {
  kind: "area",
  category: "bar_storage",
  label: "Bodega de bebidas",
  geometry: { type: "Polygon", coordinates: [[[-79.889, 8.527], [-79.8885, 8.527], [-79.8885, 8.5274], [-79.889, 8.5274], [-79.889, 8.527]]] },
};
const delivery = (label: string, preferred = true) => ({
  kind: "route",
  category: "delivery",
  label,
  preferred,
  geometry: { type: "LineString", coordinates: [[-79.892, 8.525], [-79.891, 8.526], [-79.8896, 8.5282]] },
});
const course = {
  kind: "route",
  category: "course",
  label: "10K",
  geometry: { type: "LineString", coordinates: [[-79.892, 8.525, 3], [-79.882, 8.525, 12], [-79.872, 8.525, 5]] },
};

describe("event map (UC-05, AT-07)", () => {
  it("saves and reloads 'tarima uno', mobile toilets, a bar area and a preferred delivery path, without creating locations or moving stock", async () => {
    for (const f of [stage, toilets, bar, delivery("Entrega a tarima")]) expect((await add(f)).statusCode).toBe(201);
    const items = (await map()).json().items as { label: string; kind: string; lengthMeters: number | null; geometry: { coordinates: unknown } }[];
    expect(items.map((i) => i.label).sort()).toEqual(["Baños portátiles norte", "Bodega de bebidas", "Entrega a tarima", "Tarima uno"]);
    const route = items.find((i) => i.kind === "route")!;
    expect(route.geometry.coordinates).toEqual(delivery("x").geometry.coordinates); // point order kept
    expect(route.lengthMeters).toBeGreaterThan(400);
    expect(await count(w.db, "locations")).toBe(0);
    expect(await count(w.db, "movements")).toBe(0);
  });

  it("only one route per type is preferred", async () => {
    await add(delivery("Ruta A"));
    await add(delivery("Ruta B"));
    const routes = ((await map()).json().items as { label: string; preferred: boolean }[]).filter((i) => i.label.startsWith("Ruta"));
    expect(routes.find((r) => r.label === "Ruta A")!.preferred).toBe(false);
    expect(routes.find((r) => r.label === "Ruta B")!.preferred).toBe(true);
  });

  it("refuses malformed geometry with a clear error", async () => {
    expect((await add({ ...stage, geometry: { type: "Point", coordinates: [-200, 8.5] } })).statusCode).toBe(400);
    const open = { ...bar, geometry: { type: "Polygon", coordinates: [[[-79.889, 8.527], [-79.8885, 8.527], [-79.8885, 8.5274], [-79.889, 8.5275]]] } };
    expect((await add(open)).statusCode).toBe(400);
    expect((await add({ ...stage, kind: "route" })).statusCode).toBe(400); // a route needs a line
    expect((await add({ ...stage, preferred: true })).statusCode).toBe(400);
  });

  it("edits with the current version, refuses a stale one, and removing keeps the history", async () => {
    const created = (await add(stage)).json().result;
    const edit = (label: string, v: number) =>
      w.app.inject({ method: "PUT", url: `/api/events/${eventId}/map/${created.id}`, headers: { cookie: t.cookie }, payload: command({ ...stage, label }, { expectedVersion: v }) });
    expect((await edit("Tarima principal", 1)).statusCode).toBe(200);
    expect((await edit("Otra", 1)).statusCode).toBe(409);
    const rm = await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map/${created.id}/remove`, headers: { cookie: t.cookie }, payload: command({}, { expectedVersion: 2 }) });
    expect(rm.statusCode).toBe(200);
    expect((await map()).json().items).toEqual([]);
    expect(await count(w.db, "map_features")).toBe(1);
  });

  it("needs map.edit to change it; everyone in the organization can see it; other organizations can't", async () => {
    await add(stage);
    await w.app.inject({ method: "POST", url: "/api/members", headers: { cookie: t.cookie }, payload: command({ email: "op@example.test", displayName: "Op", password: "operator-pass-1", preset: "inventory_operator" }) });
    const op = await login(w.app, "op@example.test", "operator-pass-1");
    expect((await add(toilets, op)).statusCode).toBe(403);
    expect((await map(op)).json().items).toHaveLength(1);
    const other = await tenant(w, "Other");
    expect((await map(other.cookie)).statusCode).toBe(404);
  });
});

describe("running courses are a paid add-on (DEC-023)", () => {
  it("is refused when the organization doesn't have it", async () => {
    const res = await add(course);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "license_restricted", details: { feature: "courses" } });
  });

  it("follows the organization's plan: included in the plan works, removed from the plan stops (DEC-024)", async () => {
    await w.db.query("INSERT INTO plans (id, code, name, features) VALUES ('01a0f000-0000-7000-8000-0000000000aa', 'pro', 'Plan de prueba', '{courses}')");
    await w.db.query("UPDATE tenants SET plan_id = '01a0f000-0000-7000-8000-0000000000aa' WHERE id = $1", [t.tenantId]);
    expect((await add(course)).statusCode).toBe(201);
    const me = await w.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: t.cookie } });
    expect(me.json().tenant.features).toEqual(["courses"]);
    await w.db.query("UPDATE plans SET features = '{}' WHERE code = 'pro'");
    expect((await add({ ...course, label: "21K" })).statusCode).toBe(403);
  });

  it("an add-on on top of the plan also works", async () => {
    await w.db.query("INSERT INTO plans (id, code, name, features) VALUES ('01a0f000-0000-7000-8000-0000000000bb', 'basic', 'Básico de prueba', '{}')");
    await w.db.query("UPDATE tenants SET plan_id = '01a0f000-0000-7000-8000-0000000000bb', features = '{courses}' WHERE id = $1", [t.tenantId]);
    expect((await add(course)).statusCode).toBe(201);
  });

  it("works once the add-on is switched on, keeping the elevations", async () => {
    await w.db.query("UPDATE tenants SET features = '{courses}' WHERE id = $1", [t.tenantId]);
    const res = await add(course);
    expect(res.statusCode).toBe(201);
    expect(res.json().result.geometry.coordinates[1]).toEqual([-79.882, 8.525, 12]);
    expect((await map()).json().features).toEqual(["courses"]);
  });
});
