import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { uuidv7 } from "@structura/domain";
import { buildApp } from "../src/app.js";
import type { FileStore } from "../src/storage.js";
import { count, freshDb, testConfig } from "./helpers.js";
import { command, login, tenant, type TestTenant, type TestWorld } from "./session.js";

// In-memory file store; `failing` simulates a broken disk (UC-12).
function memoryStore() {
  const files = new Map<string, Buffer>();
  let failing = false;
  const store: FileStore = {
    async put(key, bytes) {
      if (failing) throw new Error("disk full");
      files.set(key, bytes);
    },
    async get(key) {
      const b = files.get(key);
      if (!b) throw new Error("missing");
      return b;
    },
  };
  return { store, files, fail: (v: boolean) => (failing = v) };
}

const PNG_A = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("photo-of-A")]);
const JPG_B = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("photo-of-B")]);

let w: TestWorld & { mem: ReturnType<typeof memoryStore> };
let t: TestTenant;

async function setup() {
  const db = await freshDb();
  const mem = memoryStore();
  const app = await buildApp({ db, config: testConfig(), logger: false, store: mem.store });
  w = { db, app, mem, close: async () => (await app.close(), await db.close()) };
  t = await tenant(w);
}
afterEach(async () => {
  await w.close();
});

const post = (app: FastifyInstance, cookie: string, url: string, payload: unknown, opts: { commandId?: string; expectedVersion?: number | null } = {}) =>
  app.inject({ method: "POST", url, headers: { cookie }, payload: command(payload, opts) });

async function location(designation: string, kind: string) {
  const res = await post(w.app, t.cookie, "/api/locations", { designation, kind });
  expect(res.statusCode).toBe(201);
  return res.json().result.id as string;
}

async function item(fields: Record<string, unknown> = {}, initial?: { quantity: string; locationId: string }) {
  const res = await post(w.app, t.cookie, "/api/items", {
    item: { name: "Mic de Mano EW D", productType: "rentable", unit: "Unidad", quantityDecimals: 0, ...fields },
    initialQuantity: initial?.quantity ?? null,
    initialLocationId: initial?.locationId ?? null,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().result;
}

async function stock(itemId: string) {
  const res = await w.app.inject({ method: "GET", url: `/api/items/${itemId}`, headers: { cookie: t.cookie } });
  return res.json() as { item: { stock: Record<string, string>; version: number; photo: { attachmentId: string } | null; barcode: string }; positions: { designation: string; quantity: string }[] };
}

const move = (payload: Record<string, unknown>, opts: { commandId?: string } = {}) => post(w.app, t.cookie, "/api/movements", payload, opts);

describe("catalog and opening balance (spec 6.4)", () => {
  it("creating an item with an initial quantity posts an opening-balance movement, not a total", async () => {
    await setup();
    const almacen = await location("Almacén", "warehouse");
    const it = await item({ barcode: "0273110251529", categoryPath: "All / Produccion / Audio / Microfonos" }, { quantity: "7", locationId: almacen });
    expect(it.stock).toMatchObject({ total: "7", inWarehouse: "7", atEvents: "0", inRepair: "0" });
    const moves = await w.app.inject({ method: "GET", url: `/api/movements?itemId=${it.id}`, headers: { cookie: t.cookie } });
    expect(moves.json().items[0]).toMatchObject({ reason: "opening_balance", destinationName: "Almacén", lines: [{ quantity: "7", unit: "Unidad" }] });
  });

  it("keeps a barcode's leading zero, and a category change never recodes it (AT-36)", async () => {
    await setup();
    const it = await item({ barcode: "0273114250191", categoryPath: "All / Produccion / Audio / Bodypack" });
    const res = await w.app.inject({
      method: "PUT",
      url: `/api/items/${it.id}`,
      headers: { cookie: t.cookie },
      payload: command(
        { name: it.name, productType: "rentable", unit: "Unidad", quantityDecimals: 0, barcode: it.barcode, categoryPath: "All / Produccion / Audio / Receivers" },
        { expectedVersion: it.version }
      ),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toMatchObject({ barcode: "0273114250191", categoryPath: "All / Produccion / Audio / Receivers" });
  });

  it("refuses a barcode already used by another item, naming it", async () => {
    await setup();
    await item({ name: "Body EW D", barcode: "0273114250191" });
    const res = await post(w.app, t.cookie, "/api/items", {
      item: { name: "Otro", productType: "rentable", unit: "Unidad", quantityDecimals: 0, barcode: "0273114250191" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toMatchObject({ field: "barcode", usedBy: "Body EW D" });
  });

  it("allows the same name for distinct items and finds each by reference (UC-08)", async () => {
    await setup();
    await item({ name: "Cable XLR", internalReference: "PRO-AUD-CAB-10", categoryPath: "Audio" });
    await item({ name: "Cable XLR", internalReference: "PRO-ILU-CAB-10", categoryPath: "Iluminacion" });
    const all = await w.app.inject({ method: "GET", url: "/api/items?search=cable%20xlr", headers: { cookie: t.cookie } });
    expect(all.json().total).toBe(2);
    const one = await w.app.inject({ method: "GET", url: "/api/items?search=PRO-ILU", headers: { cookie: t.cookie } });
    expect(one.json().items.map((i: { internalReference: string }) => i.internalReference)).toEqual(["PRO-ILU-CAB-10"]);
  });

  it("a price needs a currency", async () => {
    await setup();
    const res = await post(w.app, t.cookie, "/api/items", {
      item: { name: "X", productType: "rentable", unit: "Unidad", quantityDecimals: 0, salesPrice: "25" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("movements (UC-03)", () => {
  it("moves A → B with no Trip: exact balances, history with source, destination and actor (AT-02)", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const b = await location("Tarima uno", "event");
    const it = await item({}, { quantity: "10", locationId: a });
    const res = await move({ reason: "transfer", sourceLocationId: a, destinationLocationId: b, lines: [{ itemId: it.id, quantity: "4" }] });
    expect(res.statusCode).toBe(201);
    expect(res.json().result).toMatchObject({ sourceName: "Almacén", destinationName: "Tarima uno", actorId: t.adminId, correctsMovementId: null });
    const s = await stock(it.id);
    expect(s.item.stock).toMatchObject({ total: "10", inWarehouse: "6", atEvents: "4" });
    expect(await count(w.db, "audit_entries")).toBeGreaterThanOrEqual(1);
  });

  it("a retry with the same command ID moves the stock only once", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const b = await location("Evento", "event");
    const it = await item({}, { quantity: "10", locationId: a });
    const commandId = uuidv7();
    const body = { reason: "transfer", sourceLocationId: a, destinationLocationId: b, lines: [{ itemId: it.id, quantity: "3" }] };
    expect((await move(body, { commandId })).statusCode).toBe(201);
    expect((await move(body, { commandId })).statusCode).toBe(200);
    expect((await stock(it.id)).item.stock).toMatchObject({ inWarehouse: "7", atEvents: "3" });
  });

  it("refuses to move more than is there, and changes nothing - not even the other lines", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const b = await location("Evento", "event");
    const x = await item({ name: "X" }, { quantity: "5", locationId: a });
    const y = await item({ name: "Y" }, { quantity: "1", locationId: a });
    const res = await move({
      reason: "transfer",
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [
        { itemId: x.id, quantity: "5" },
        { itemId: y.id, quantity: "2" },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "insufficient_availability", details: { available: "1", requested: "2" } });
    expect((await stock(x.id)).item.stock.inWarehouse).toBe("5");
    expect((await stock(y.id)).item.stock.inWarehouse).toBe("1");
  });

  it("respects each item's decimals: 2.5 gallons yes, 2.5 units no", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const liquid = await item({ name: "Líquido de humo", productType: "consumable", unit: "Galón", quantityDecimals: 3 });
    const mic = await item();
    expect((await move({ reason: "receipt", destinationLocationId: a, lines: [{ itemId: liquid.id, quantity: "2.5" }] })).statusCode).toBe(201);
    const bad = await move({ reason: "receipt", destinationLocationId: a, lines: [{ itemId: mic.id, quantity: "2.5" }] });
    expect(bad.statusCode).toBe(400);
  });

  it("consumption permanently reduces what is owned; adjustments need a written reason", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const liquid = await item({ name: "Líquido", productType: "consumable", unit: "Galón", quantityDecimals: 3 }, { quantity: "10", locationId: a });
    expect((await move({ reason: "consumption", sourceLocationId: a, lines: [{ itemId: liquid.id, quantity: "1.25" }] })).statusCode).toBe(201);
    expect((await stock(liquid.id)).item.stock.total).toBe("8.75");
    const noNote = await move({ reason: "adjustment_out", sourceLocationId: a, lines: [{ itemId: liquid.id, quantity: "1" }] });
    expect(noNote.statusCode).toBe(400);
  });

  it("repair is owned but not in the warehouse; the repair return restores it once (UC-23 path, AT-33)", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const r = await location("Taller de reparación", "repair");
    const it = await item({}, { quantity: "3", locationId: a });
    await move({ reason: "to_repair", sourceLocationId: a, destinationLocationId: r, lines: [{ itemId: it.id, quantity: "1" }] });
    expect((await stock(it.id)).item.stock).toMatchObject({ total: "3", inWarehouse: "2", inRepair: "1" });
    const wrongWay = await move({ reason: "to_repair", sourceLocationId: a, destinationLocationId: a, lines: [{ itemId: it.id, quantity: "1" }] });
    expect(wrongWay.statusCode).toBe(400);
    const commandId = uuidv7();
    const back = { reason: "repair_return", sourceLocationId: r, destinationLocationId: a, lines: [{ itemId: it.id, quantity: "1" }] };
    await move(back, { commandId });
    await move(back, { commandId });
    expect((await stock(it.id)).item.stock).toMatchObject({ total: "3", inWarehouse: "3", inRepair: "0" });
  });

  it("a wrong movement is corrected by a linked reverse movement; the original stays (AT-03)", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const b = await location("Evento", "event");
    const it = await item({}, { quantity: "10", locationId: a });
    const wrong = (await move({ reason: "transfer", sourceLocationId: a, destinationLocationId: b, lines: [{ itemId: it.id, quantity: "8" }] })).json().result;

    const fix = await post(w.app, t.cookie, "/api/movements/corrections", { movementId: wrong.id, note: "Eran 3, no 8" });
    expect(fix.statusCode).toBe(201);
    expect(fix.json().result).toMatchObject({ reason: "correction", correctsMovementId: wrong.id, sourceName: "Evento", destinationName: "Almacén", note: "Eran 3, no 8" });
    expect((await stock(it.id)).item.stock).toMatchObject({ inWarehouse: "10", atEvents: "0" });

    const original = await w.app.inject({ method: "GET", url: `/api/movements/${wrong.id}`, headers: { cookie: t.cookie } });
    expect(original.json()).toMatchObject({ reason: "transfer", correctedByMovementId: fix.json().result.id });

    const again = await post(w.app, t.cookie, "/api/movements/corrections", { movementId: wrong.id, note: "otra vez" });
    expect(again.statusCode).toBe(409);
    expect((await stock(it.id)).item.stock.inWarehouse).toBe("10");
  });

  it("a posted movement can't be edited or deleted in the database", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    await item({}, { quantity: "1", locationId: a });
    await expect(w.db.query("UPDATE movements SET note = 'x'")).rejects.toThrow(/append_only/);
    await expect(w.db.query("DELETE FROM movement_lines")).rejects.toThrow(/append_only/);
  });

  it("another organization's location can't be used (AT-28)", async () => {
    await setup();
    const mine = await location("Almacén", "warehouse");
    const it = await item({}, { quantity: "5", locationId: mine });
    const other = await tenant(w, "Other");
    const theirs = (await post(w.app, other.cookie, "/api/locations", { designation: "Suyo", kind: "warehouse" })).json().result.id;
    const res = await move({ reason: "transfer", sourceLocationId: mine, destinationLocationId: theirs, lines: [{ itemId: it.id, quantity: "1" }] });
    expect(res.statusCode).toBe(400);
    const peek = await w.app.inject({ method: "GET", url: `/api/items/${it.id}`, headers: { cookie: other.cookie } });
    expect(peek.statusCode).toBe(404);
  });

  it("an inventory operator can move stock but not edit the catalog", async () => {
    await setup();
    const a = await location("Almacén", "warehouse");
    const b = await location("Evento", "event");
    const it = await item({}, { quantity: "2", locationId: a });
    await post(w.app, t.cookie, "/api/members", { email: "op@example.test", displayName: "Op", password: "operator-pass-1", preset: "inventory_operator" });
    const cookie = await login(w.app, "op@example.test", "operator-pass-1");
    const ok = await post(w.app, cookie, "/api/movements", { reason: "transfer", sourceLocationId: a, destinationLocationId: b, lines: [{ itemId: it.id, quantity: "1" }] });
    expect(ok.statusCode).toBe(201);
    const no = await post(w.app, cookie, "/api/items", { item: { name: "Z", productType: "rentable", unit: "Unidad", quantityDecimals: 0 } });
    expect(no.statusCode).toBe(403);
  });
});

describe("product photos (UC-12, AT-05)", () => {
  const upload = (itemId: string, bytes: Buffer, type: string, expectedVersion: number, commandId = uuidv7()) =>
    w.app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/photo`,
      headers: {
        cookie: t.cookie,
        "content-type": type,
        "x-command-id": commandId,
        "x-occurred-at": new Date().toISOString(),
        "x-expected-version": String(expectedVersion),
        "x-filename": "foto.png",
      },
      payload: bytes,
    });

  it("each item shows its own photo after switching between them", async () => {
    await setup();
    const A = await item({ name: "A" });
    const B = await item({ name: "B" });
    expect((await upload(A.id, PNG_A, "image/png", A.version)).statusCode).toBe(200);
    expect((await upload(B.id, JPG_B, "image/jpeg", B.version)).statusCode).toBe(200);

    const a = await stock(A.id);
    const b = await stock(B.id);
    const imgA = await w.app.inject({ method: "GET", url: `/api/attachments/${a.item.photo!.attachmentId}/content`, headers: { cookie: t.cookie } });
    const imgB = await w.app.inject({ method: "GET", url: `/api/attachments/${b.item.photo!.attachmentId}/content`, headers: { cookie: t.cookie } });
    expect(imgA.rawPayload.equals(PNG_A)).toBe(true);
    expect(imgA.headers["content-type"]).toBe("image/png");
    expect(imgB.rawPayload.equals(JPG_B)).toBe(true);
  });

  it("a storage failure never reports a saved photo and leaves the item unchanged", async () => {
    await setup();
    const A = await item({ name: "A" });
    w.mem.fail(true);
    const res = await upload(A.id, PNG_A, "image/png", A.version);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("provider_failure");
    const a = await stock(A.id);
    expect(a.item.photo).toBeNull();
    expect(a.item.version).toBe(A.version);
    expect(await count(w.db, "attachments")).toBe(0);
  });

  it("checks the content, not the name: a text file labelled PNG is refused", async () => {
    await setup();
    const A = await item({ name: "A" });
    const res = await upload(A.id, Buffer.from("not an image"), "image/png", A.version);
    expect(res.statusCode).toBe(400);
  });

  it("another organization can't open the photo", async () => {
    await setup();
    const A = await item({ name: "A" });
    await upload(A.id, PNG_A, "image/png", A.version);
    const attachmentId = (await stock(A.id)).item.photo!.attachmentId;
    const other = await tenant(w, "Other");
    const res = await w.app.inject({ method: "GET", url: `/api/attachments/${attachmentId}/content`, headers: { cookie: other.cookie } });
    expect(res.statusCode).toBe(404);
  });
});
