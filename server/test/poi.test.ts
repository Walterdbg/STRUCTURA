import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "@structura/domain";
import { buildApp } from "../src/app.js";
import type { FileStore } from "../src/storage.js";
import { freshDb, testConfig } from "./helpers.js";
import { command, tenant, type TestTenant, type TestWorld } from "./session.js";

// Pictures on points of interest and the session Clear (DEC-044).

const PNG = (tag: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(tag)]);

let w: TestWorld;
let t: TestTenant;
let eventId: string;
const files = new Map<string, Buffer>();

beforeEach(async () => {
  files.clear();
  const store: FileStore = {
    async put(key, bytes) {
      files.set(key, bytes);
    },
    async get(key) {
      const b = files.get(key);
      if (!b) throw new Error("missing");
      return b;
    },
  };
  const db = await freshDb();
  const app = await buildApp({ db, config: testConfig(), logger: false, store });
  w = { db, app, setNow: () => {}, close: async () => (await app.close(), await db.close()) } as TestWorld;
  t = await tenant(w);
  eventId = (
    await w.app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: t.cookie },
      payload: command({ designation: "Entregas Coronado", eventType: "rental", responsibleUserId: t.adminId, timezone: "America/Panama" }),
    })
  ).json().result.id;
});
afterEach(async () => {
  await w.close();
});

const add = async (payload: Record<string, unknown>) =>
  (await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map`, headers: { cookie: t.cookie }, payload: command(payload) })).json().result as {
    id: string;
    version: number;
  };
type Item = { id: string; label: string; version: number; photos: { id: string; role: string }[]; geometry: { coordinates: number[] } };
const items = async () => (await w.app.inject({ method: "GET", url: `/api/events/${eventId}/map`, headers: { cookie: t.cookie } })).json().items as Item[];
const upload = (featureId: string, bytes: Buffer, role = "photo") =>
  w.app.inject({
    method: "PUT",
    url: `/api/events/${eventId}/map/${featureId}/photos`,
    headers: { cookie: t.cookie, "content-type": "image/png", "x-command-id": uuidv7(), "x-occurred-at": new Date().toISOString(), "x-filename": "esquina.png", "x-photo-role": role },
    payload: bytes,
  });

const stage = { kind: "point", category: "stage", label: "Tarima uno", geometry: { type: "Point", coordinates: [-79.8896, 8.5282] } };

describe("pictures on points of interest (DEC-044)", () => {
  it("keeps up to three pictures per point, photos and captures, and serves them", async () => {
    const p = await add(stage);
    expect((await upload(p.id, PNG("a"))).statusCode).toBe(201);
    expect((await upload(p.id, PNG("b"), "capture")).statusCode).toBe(201);
    expect((await upload(p.id, PNG("c"))).statusCode).toBe(201);
    const fourth = await upload(p.id, PNG("d"));
    expect(fourth.statusCode).toBe(400);
    expect(fourth.json().details).toMatchObject({ reason: "limit", max: 3 });
    const [item] = await items();
    expect(item!.photos.map((x) => x.role)).toEqual(["photo", "capture", "photo"]);
    const img = await w.app.inject({ method: "GET", url: `/api/attachments/${item!.photos[1]!.id}/content`, headers: { cookie: t.cookie } });
    expect(img.body).toBe(PNG("b").toString());
  });

  it("refuses pictures on routes and anything that isn't an image; removing frees a place", async () => {
    const route = await add({ kind: "route", category: "delivery", label: "Entrega", geometry: { type: "LineString", coordinates: [[-79.892, 8.525], [-79.8896, 8.5282]] } });
    expect((await upload(route.id, PNG("a"))).statusCode).toBe(400);
    const p = await add(stage);
    expect((await upload(p.id, Buffer.from("not an image"))).statusCode).toBe(400);
    const ids: string[] = [];
    for (const tag of ["a", "b", "c"]) ids.push((await upload(p.id, PNG(tag))).json().result.id);
    const rm = await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map/${p.id}/photos/${ids[0]}/remove`, headers: { cookie: t.cookie }, payload: command({}) });
    expect(rm.statusCode).toBe(200);
    expect((await upload(p.id, PNG("d"))).statusCode).toBe(201);
  });
});

describe("session Clear (DEC-044)", () => {
  it("puts the map back as it was when it was opened: added items go, changed and removed ones come back, with their pictures", async () => {
    const a = await add(stage);
    const keptPhoto = (await upload(a.id, PNG("kept"))).json().result.id as string;
    const b = await add({ ...stage, label: "Baños", category: "toilets" });
    // The map as opened.
    const opened = (await items()).map((i) => ({
      id: i.id,
      fields: { kind: "point", category: (i as unknown as { category: string }).category, label: i.label, geometry: { type: "Point", coordinates: i.geometry.coordinates } },
      photos: i.photos.map((x) => x.id),
    }));
    // The session: move A and give it another picture, remove B and A's first picture, add C.
    await w.app.inject({ method: "PUT", url: `/api/events/${eventId}/map/${a.id}`, headers: { cookie: t.cookie }, payload: command({ ...stage, label: "Tarima movida", geometry: { type: "Point", coordinates: [-79.88, 8.52] } }, { expectedVersion: a.version }) });
    await upload(a.id, PNG("new"));
    await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map/${a.id}/photos/${keptPhoto}/remove`, headers: { cookie: t.cookie }, payload: command({}) });
    await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map/${b.id}/remove`, headers: { cookie: t.cookie }, payload: command({}, { expectedVersion: b.version }) });
    await add({ ...stage, label: "Nuevo punto" });
    expect((await items()).map((i) => i.label).sort()).toEqual(["Nuevo punto", "Tarima movida"]);

    const res = await w.app.inject({ method: "POST", url: `/api/events/${eventId}/map/restore`, headers: { cookie: t.cookie }, payload: command({ items: opened }) });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toEqual({ restored: 2, removed: 1 });
    const after = await items();
    expect(after.map((i) => i.label).sort()).toEqual(["Baños", "Tarima uno"]);
    const back = after.find((i) => i.id === a.id)!;
    expect(back.geometry.coordinates).toEqual([-79.8896, 8.5282]);
    expect(back.photos.map((x) => x.id)).toEqual([keptPhoto]);
  });

  it("refuses a map state from another Event", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: `/api/events/${eventId}/map/restore`,
      headers: { cookie: t.cookie },
      payload: command({ items: [{ id: uuidv7(), fields: stage, photos: [] }] }),
    });
    expect(res.statusCode).toBe(400);
  });
});
