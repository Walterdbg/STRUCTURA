import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { count } from "./helpers.js";
import { command, login, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
let warehouse: string;
let eventSite: string;
let repair: string;
let mic: { id: string };

beforeEach(async () => {
  w = await world();
  t = await tenant(w);
  warehouse = await location("Almacén", "warehouse");
  eventSite = await location("Sitio del evento", "event");
  repair = await location("Taller", "repair");
  mic = await item("Mic", "10");
});
afterEach(async () => {
  await w.close();
});

const post = (url: string, payload: unknown, expectedVersion: number | null = null, cookie = t.cookie) =>
  w.app.inject({ method: "POST", url, headers: { cookie }, payload: command(payload, { expectedVersion }) });
const put = (url: string, payload: unknown, expectedVersion: number | null = null) =>
  w.app.inject({ method: "PUT", url, headers: { cookie: t.cookie }, payload: command(payload, { expectedVersion }) });

async function location(designation: string, kind: string) {
  return (await post("/api/locations", { designation, kind })).json().result.id as string;
}
async function item(name: string, quantity: string) {
  const res = await post("/api/items", {
    item: { name, productType: "rentable", unit: "Unidad", quantityDecimals: 0 },
    initialQuantity: quantity,
    initialLocationId: warehouse,
  });
  return res.json().result as { id: string };
}

interface Ev {
  id: string;
  version: number;
  fulfillmentState: string;
}

async function event(name: string, departureDate: string, expectedReturnDate: string, timezone = "America/Panama"): Promise<Ev> {
  return (
    await post("/api/events", { designation: name, responsibleUserId: t.adminId, timezone, departureDate, expectedReturnDate })
  ).json().result;
}
async function lines(ev: Ev, list: { itemId: string; quantity: string }[]) {
  const res = await put(`/api/events/${ev.id}/lines`, { lines: list }, ev.version);
  return res;
}
async function current(ev: Ev): Promise<Ev> {
  return (await w.app.inject({ method: "GET", url: `/api/events/${ev.id}`, headers: { cookie: t.cookie } })).json();
}
async function book(name: string, from: string, to: string, qty: string, itemId = mic.id, tz?: string) {
  const ev = await event(name, from, to, tz);
  const l = await lines(ev, [{ itemId, quantity: qty }]);
  expect(l.statusCode, l.body).toBe(200);
  const res = await post(`/api/events/${ev.id}/confirm`, {}, (await current(ev)).version);
  return { ev, res };
}

describe("confirming an Event commits its reservations (UC-21)", () => {
  it("a confirmed Event holds its quantity; lines show what is available (VALIDAR)", async () => {
    const { ev, res } = await book("Boda", "2026-10-10", "2026-10-14", "8");
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().result.event.fulfillmentState).toBe("confirmed");
    expect(res.json().result.lines[0]).toMatchObject({ requested: "8", reserved: "8", availability: { ok: true, available: "10" } });
    const other = await event("Otro", "2026-10-12", "2026-10-13");
    await lines(other, [{ itemId: mic.id, quantity: "3" }]);
    const check = await w.app.inject({ method: "GET", url: `/api/events/${other.id}/lines`, headers: { cookie: t.cookie } });
    expect(check.json().items[0].availability).toMatchObject({ available: "2", ok: false });
    expect(ev.id).toBeTruthy();
  });

  it("refuses an overlapping commitment that exceeds availability, and nothing is reserved (AT-04)", async () => {
    await book("A", "2026-10-10", "2026-10-14", "8");
    const { ev, res } = await book("B", "2026-10-12", "2026-10-20", "3");
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "insufficient_availability", details: { lines: [{ requested: "3", available: "2" }] } });
    expect((await current(ev)).fulfillmentState).toBe("draft");
    const reservedForB = await w.db.query("SELECT 1 FROM reservations WHERE event_id = $1", [ev.id]);
    expect(reservedForB.rows).toHaveLength(0);
    const { res: ok } = await book("C", "2026-10-12", "2026-10-20", "2");
    expect(ok.statusCode).toBe(200);
  });

  it("return on day 14 keeps day 14 reserved; day 15 is free (AT-31)", async () => {
    await book("A", "2026-10-10", "2026-10-14", "10");
    expect((await book("B", "2026-10-14", "2026-10-16", "1")).res.statusCode).toBe(409);
    expect((await book("C", "2026-10-15", "2026-10-16", "10")).res.statusCode).toBe(200);
  });

  it("dates keep their local-day meaning across a daylight-saving change", async () => {
    // New York leaves daylight time on 2026-11-01.
    await book("A", "2026-10-30", "2026-11-01", "10", mic.id, "America/New_York");
    expect((await book("B", "2026-11-01", "2026-11-03", "1", mic.id, "America/New_York")).res.statusCode).toBe(409);
    expect((await book("C", "2026-11-02", "2026-11-03", "10", mic.id, "America/New_York")).res.statusCode).toBe(200);
  });

  it("confirming needs both rental dates and at least one product", async () => {
    const noDates = (await post("/api/events", { designation: "X", responsibleUserId: t.adminId, timezone: "America/Panama" })).json().result;
    await lines(noDates, [{ itemId: mic.id, quantity: "1" }]);
    const r1 = await post(`/api/events/${noDates.id}/confirm`, {}, (await current(noDates)).version);
    expect(r1.statusCode).toBe(400);
    const empty = await event("Vacío", "2026-10-10", "2026-10-11");
    const r2 = await post(`/api/events/${empty.id}/confirm`, {}, empty.version);
    expect(r2.statusCode).toBe(400);
  });
});

describe("availability counts real stock (integration contract)", () => {
  it("stock in repair can't be booked", async () => {
    await post("/api/movements", { reason: "to_repair", sourceLocationId: warehouse, destinationLocationId: repair, lines: [{ itemId: mic.id, quantity: "2" }] });
    expect((await book("A", "2026-10-10", "2026-10-11", "9")).res.statusCode).toBe(409);
    expect((await book("B", "2026-10-10", "2026-10-11", "8")).res.statusCode).toBe(200);
  });

  it("stock sent to an Event for that Event is not counted twice", async () => {
    const { ev } = await book("A", "2026-10-10", "2026-10-14", "5");
    const sent = await post("/api/movements", {
      reason: "transfer",
      sourceLocationId: warehouse,
      destinationLocationId: eventSite,
      eventId: ev.id,
      lines: [{ itemId: mic.id, quantity: "5" }],
    });
    expect(sent.statusCode).toBe(201);
    // 10 owned - 5 reserved by A (and physically with A) = 5, not 0.
    expect((await book("B", "2026-10-12", "2026-10-13", "5")).res.statusCode).toBe(200);
  });

  it("stock out at an event location with no reservation behind it is not available", async () => {
    await post("/api/movements", { reason: "transfer", sourceLocationId: warehouse, destinationLocationId: eventSite, lines: [{ itemId: mic.id, quantity: "3" }] });
    expect((await book("A", "2026-10-10", "2026-10-11", "8")).res.statusCode).toBe(409);
    expect((await book("B", "2026-10-10", "2026-10-11", "7")).res.statusCode).toBe(200);
  });

  it("stock still out after its expected return keeps blocking new bookings", async () => {
    // Booked and sent out back in October; then the clock moves past its return.
    const { ev } = await book("Pasado", "2026-10-01", "2026-10-05", "5");
    await post("/api/movements", {
      reason: "transfer",
      sourceLocationId: warehouse,
      destinationLocationId: eventSite,
      eventId: ev.id,
      lines: [{ itemId: mic.id, quantity: "5" }],
    });
    w.setNow!(new Date("2026-11-15T17:00:00Z"));
    // The expected return (5 Oct) is past and nothing came back.
    expect((await book("Futuro", "2026-12-01", "2026-12-02", "6")).res.statusCode).toBe(409);
    expect((await book("Futuro 2", "2026-12-01", "2026-12-02", "5")).res.statusCode).toBe(200);
  });
});

describe("changing a confirmed Event", () => {
  it("new lines that don't fit are refused and the old reservation stands", async () => {
    const { ev } = await book("A", "2026-10-10", "2026-10-14", "5");
    await book("B", "2026-10-10", "2026-10-14", "5");
    const cur = await current(ev);
    const res = await lines(cur, [{ itemId: mic.id, quantity: "6" }]);
    expect(res.statusCode).toBe(409);
    const held = await w.db.query<{ q: string }>("SELECT sum(quantity)::text AS q FROM reservations WHERE event_id = $1 AND state = 'committed'", [ev.id]);
    expect(Number(held.rows[0]!.q)).toBe(5);
  });

  it("moving a confirmed Event's dates re-checks availability", async () => {
    const { ev } = await book("A", "2026-10-10", "2026-10-12", "10");
    await book("B", "2026-10-20", "2026-10-22", "10");
    const cur = await current(ev);
    const res = await put(
      `/api/events/${ev.id}`,
      { designation: "A", responsibleUserId: t.adminId, timezone: "America/Panama", departureDate: "2026-10-19", expectedReturnDate: "2026-10-21" },
      cur.version
    );
    expect(res.statusCode).toBe(409);
    expect((await current(ev)).version).toBe(cur.version);
  });

  it("cancelling releases the reservations; a cancelled Event can't be cancelled again", async () => {
    const { ev } = await book("A", "2026-10-10", "2026-10-14", "10");
    const cancel = await post(`/api/events/${ev.id}/cancel`, { note: "Cliente canceló" }, (await current(ev)).version);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().result.event.fulfillmentState).toBe("cancelled");
    expect((await book("B", "2026-10-10", "2026-10-14", "10")).res.statusCode).toBe(200);
    const again = await post(`/api/events/${ev.id}/cancel`, {}, (await current(ev)).version);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("invalid_state");
    // History is kept: the released reservation still exists.
    expect(await count(w.db, "reservations")).toBe(2);
  });
});

describe("confirming after the rental period is over", () => {
  it("is refused, since stock can't be held for past days", async () => {
    const ev = await event("Tarde", "2026-10-01", "2026-10-05");
    await lines(ev, [{ itemId: mic.id, quantity: "1" }]);
    w.setNow!(new Date("2026-10-06T17:00:00Z"));
    const res = await post(`/api/events/${ev.id}/confirm`, {}, (await current(ev)).version);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "invalid_state", details: { reason: "past" } });
  });

  it("is allowed while the rental is under way", async () => {
    const ev = await event("En curso", "2026-10-01", "2026-10-05");
    await lines(ev, [{ itemId: mic.id, quantity: "1" }]);
    w.setNow!(new Date("2026-10-03T17:00:00Z"));
    expect((await post(`/api/events/${ev.id}/confirm`, {}, (await current(ev)).version)).statusCode).toBe(200);
  });
});

describe("rules enforced below the app", () => {
  it("reservations can't be deleted or edited, only closed", async () => {
    await book("A", "2026-10-10", "2026-10-14", "2");
    await expect(w.db.query("DELETE FROM reservations")).rejects.toThrow(/append_only/);
    await expect(w.db.query("UPDATE reservations SET quantity = 1")).rejects.toThrow(/append_only/);
  });

  it("only people with reservation.commit can confirm", async () => {
    const ev = await event("A", "2026-10-10", "2026-10-11");
    await lines(ev, [{ itemId: mic.id, quantity: "1" }]);
    await post("/api/members", { email: "op2@example.test", displayName: "Op", password: "operator-pass-2", preset: "inventory_operator" });
    const cookie = await login(w.app, "op2@example.test", "operator-pass-2");
    const res = await post(`/api/events/${ev.id}/confirm`, {}, (await current(ev)).version, cookie);
    expect(res.statusCode).toBe(403);
  });
});

describe("equipment still out after the event (DEC-028)", () => {
  it("warns 3 days after the event, is overdue after the expected return, and clears once everything is back", async () => {
    const ev = (
      await post("/api/events", { designation: "Feria", responsibleUserId: t.adminId, timezone: "America/Panama", departureDate: "2026-10-01", eventDate: "2026-10-02", expectedReturnDate: "2026-10-09" })
    ).json().result as Ev;
    const move = (from: string, to: string) =>
      post("/api/movements", { reason: "transfer", sourceLocationId: from, destinationLocationId: to, eventId: ev.id, lines: [{ itemId: mic.id, quantity: "4" }] });
    expect((await move(warehouse, eventSite)).statusCode).toBe(201);
    const at = async (iso: string) => {
      w.setNow!(new Date(iso));
      return (await current(ev)) as Ev & { equipmentOut: boolean; returnAlert: string | null };
    };
    expect(await at("2026-10-05T17:00:00Z")).toMatchObject({ equipmentOut: true, returnAlert: null });
    expect((await at("2026-10-06T17:00:00Z")).returnAlert).toBe("ended_out");
    expect((await at("2026-10-10T17:00:00Z")).returnAlert).toBe("overdue");
    const list = await w.app.inject({ method: "GET", url: "/api/events", headers: { cookie: t.cookie } });
    expect(list.json().items.find((e: { id: string }) => e.id === ev.id).returnAlert).toBe("overdue");
    expect((await move(eventSite, warehouse)).statusCode).toBe(201);
    expect(await at("2026-10-10T18:00:00Z")).toMatchObject({ equipmentOut: false, returnAlert: null });
  });
});
