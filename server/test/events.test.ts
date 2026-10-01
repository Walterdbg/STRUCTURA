import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "@structura/domain";
import { count } from "./helpers.js";
import { command, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
beforeEach(async () => {
  w = await world();
  t = await tenant(w);
});
afterEach(async () => {
  await w.close();
});

function create(payload: Record<string, unknown>, opts: { cookie?: string; commandId?: string } = {}) {
  return w.app.inject({
    method: "POST",
    url: "/api/events",
    headers: { cookie: opts.cookie ?? t.cookie },
    payload: command(payload, { commandId: opts.commandId }),
  });
}

const base = () => ({ responsibleUserId: t.adminId, timezone: "America/Panama" });

describe("create Event (UC-13, AT-01)", () => {
  it("saves a provisional Event with no customer and no final name", async () => {
    const res = await create({ ...base(), designation: "Evento interno — octubre" });
    expect(res.statusCode).toBe(201);
    const ev = res.json().result;
    expect(ev).toMatchObject({
      designation: "Evento interno — octubre",
      designationStatus: "provisional",
      fulfillmentState: "draft",
      version: 1,
      responsibleName: "Admin 1",
    });
    const reload = await w.app.inject({ method: "GET", url: `/api/events/${ev.id}`, headers: { cookie: t.cookie } });
    expect(reload.json().id).toBe(ev.id);
  });

  it("keeps event date, departure and expected return as separate dates", async () => {
    const res = await create({
      ...base(),
      designation: "Maratón",
      eventDate: "2026-10-18",
      departureDate: "2026-10-16",
      expectedReturnDate: "2026-10-20",
    });
    expect(res.json().result).toMatchObject({
      eventDate: "2026-10-18",
      departureDate: "2026-10-16",
      expectedReturnDate: "2026-10-20",
      closureDate: null,
    });
  });

  it("names the field when the return is before the departure", async () => {
    const res = await create({ ...base(), designation: "X", departureDate: "2026-10-20", expectedReturnDate: "2026-10-16" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.issues[0].path).toBe("payload.expectedReturnDate");
  });

  it("refuses impossible dates and unknown timezones", async () => {
    expect((await create({ ...base(), designation: "X", eventDate: "2026-02-30" })).statusCode).toBe(400);
    expect((await create({ ...base(), designation: "X", timezone: "Mars/Olympus" })).statusCode).toBe(400);
  });

  it("creates nothing else: no inventory, trip or invoice side effects", async () => {
    await create({ ...base(), designation: "Solo borrador" });
    expect(await count(w.db, "events")).toBe(1);
    expect(await count(w.db, "audit_entries")).toBe(2); // tenant setup + event.created
    expect(await count(w.db, "outbox")).toBe(1);
  });

  it("a repeated submission returns the same Event (UC-13 failure handling)", async () => {
    const commandId = uuidv7();
    const first = await create({ ...base(), designation: "Doble clic" }, { commandId });
    const second = await create({ ...base(), designation: "Doble clic" }, { commandId });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().replayed).toBe(true);
    expect(second.json().result.id).toBe(first.json().result.id);
    expect(await count(w.db, "events")).toBe(1);
  });

  it("the responsible person must belong to this organization (AT-28)", async () => {
    const other = await tenant(w, "Other Org");
    const res = await create({ ...base(), responsibleUserId: other.adminId, designation: "X" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.field).toBe("responsibleUserId");
  });
});

describe("timeline rules (DEC-019, DEC-020; today = 2026-09-30)", () => {
  const issue = async (payload: Record<string, unknown>) => {
    const res = await create({ ...base(), designation: "X", ...payload });
    return { status: res.statusCode, details: res.json().details };
  };

  it("refuses an expected return in the past", async () => {
    expect(await issue({ departureDate: "2026-08-06", expectedReturnDate: "2026-09-22" })).toMatchObject({
      status: 400,
      details: { field: "expectedReturnDate", reason: "past" },
    });
  });

  it("refuses an event date in the past", async () => {
    expect(await issue({ eventDate: "2026-09-29" })).toMatchObject({ status: 400, details: { field: "eventDate", reason: "past" } });
  });

  it("allows creating an Event a week into its rental period, if the event and the return are today or later", async () => {
    const res = await create({ ...base(), designation: "Ya en curso", departureDate: "2026-09-23", eventDate: "2026-10-03", expectedReturnDate: "2026-10-05" });
    expect(res.statusCode).toBe(201);
  });

  it("today itself is allowed", async () => {
    const res = await create({ ...base(), designation: "Hoy", departureDate: "2026-09-30", eventDate: "2026-09-30", expectedReturnDate: "2026-09-30" });
    expect(res.statusCode).toBe(201);
  });

  it("the event date must fall between departure and expected return", async () => {
    const before = await create({ ...base(), designation: "X", eventDate: "2026-10-10", departureDate: "2026-10-12", expectedReturnDate: "2026-10-15" });
    expect(before.statusCode).toBe(400);
    expect(before.json().details.issues[0].path).toBe("payload.eventDate");
    const after = await create({ ...base(), designation: "X", eventDate: "2026-10-20", departureDate: "2026-10-12", expectedReturnDate: "2026-10-15" });
    expect(after.statusCode).toBe(400);
    expect(after.json().details.issues[0].path).toBe("payload.eventDate");
  });

  it("an Event whose dates have passed can still be edited without touching its dates", async () => {
    const ev = (await create({ ...base(), designation: "Octubre", departureDate: "2026-10-01", eventDate: "2026-10-02", expectedReturnDate: "2026-10-03" })).json().result;
    w.setNow!(new Date("2026-11-15T17:00:00Z"));
    const edit = (patch: Record<string, unknown>, expectedVersion: number) =>
      w.app.inject({
        method: "PUT",
        url: `/api/events/${ev.id}`,
        headers: { cookie: t.cookie },
        payload: command(
          { ...base(), designation: "Octubre", departureDate: "2026-10-01", eventDate: "2026-10-02", expectedReturnDate: "2026-10-03", ...patch },
          { expectedVersion }
        ),
      });
    expect((await edit({ notes: "Factura pendiente" }, 1)).statusCode).toBe(200);
    // Moving the return to another past day is refused.
    const moved = await edit({ expectedReturnDate: "2026-10-04" }, 2);
    expect(moved.statusCode).toBe(400);
    expect(moved.json().details).toMatchObject({ field: "expectedReturnDate", reason: "past" });
  });
});

describe("location as a map point", () => {
  it("saves the place name and its coordinates", async () => {
    const res = await create({ ...base(), designation: "Triatlón", location: "Playa Coronado", locationLat: 8.528194, locationLng: -79.889631 });
    expect(res.statusCode).toBe(201);
    expect(res.json().result).toMatchObject({ location: "Playa Coronado", locationLat: 8.528194, locationLng: -79.889631 });
  });

  it("refuses half a point or coordinates off the globe", async () => {
    expect((await create({ ...base(), designation: "X", locationLat: 8.5 })).statusCode).toBe(400);
    expect((await create({ ...base(), designation: "X", locationLat: 95, locationLng: 10 })).statusCode).toBe(400);
  });

  it("place search is off by default and says so; the map point still works", async () => {
    const status = await w.app.inject({ method: "GET", url: "/api/geo/status", headers: { cookie: t.cookie } });
    expect(status.json()).toEqual({ search: false, provider: "none" });
    const search = await w.app.inject({ method: "GET", url: "/api/geo/search?q=Coronado", headers: { cookie: t.cookie } });
    expect(search.statusCode).toBe(502);
    expect(search.json().details.reason).toBe("not_configured");
  });
});

describe("edit Event", () => {
  it("updates with the current version and refuses a stale one", async () => {
    const ev = (await create({ ...base(), designation: "Provisional" })).json().result;
    const edit = (designation: string, expectedVersion: number) =>
      w.app.inject({
        method: "PUT",
        url: `/api/events/${ev.id}`,
        headers: { cookie: t.cookie },
        payload: command({ ...base(), designation, designationStatus: "final" }, { expectedVersion }),
      });
    const ok = await edit("Carrera 10K Panamá", 1);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().result).toMatchObject({ designation: "Carrera 10K Panamá", designationStatus: "final", version: 2 });

    const stale = await edit("Otro nombre", 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("stale_version");
    const now = await w.app.inject({ method: "GET", url: `/api/events/${ev.id}`, headers: { cookie: t.cookie } });
    expect(now.json().designation).toBe("Carrera 10K Panamá");
  });
});

describe("tenant isolation (AT-28)", () => {
  it("another organization cannot see, list or edit my Events", async () => {
    const ev = (await create({ ...base(), designation: "Privado" })).json().result;
    const other = await tenant(w, "Other Org");

    const get = await w.app.inject({ method: "GET", url: `/api/events/${ev.id}`, headers: { cookie: other.cookie } });
    expect(get.statusCode).toBe(404);

    const list = await w.app.inject({ method: "GET", url: "/api/events", headers: { cookie: other.cookie } });
    expect(list.json()).toEqual({ items: [], total: 0 });

    const edit = await w.app.inject({
      method: "PUT",
      url: `/api/events/${ev.id}`,
      headers: { cookie: other.cookie },
      payload: command(
        { responsibleUserId: other.adminId, timezone: "America/Panama", designation: "Hacked" },
        { expectedVersion: 1 }
      ),
    });
    expect(edit.statusCode).toBe(404);
  });

  it("a malformed ID looks exactly like an unknown one", async () => {
    const res = await w.app.inject({ method: "GET", url: "/api/events/not-a-uuid", headers: { cookie: t.cookie } });
    expect(res.statusCode).toBe(404);
  });
});

describe("list Events", () => {
  it("searches by designation or location", async () => {
    await create({ ...base(), designation: "Triatlón Coronado", location: "Playa Coronado" });
    await create({ ...base(), designation: "Feria interna" });
    const res = await w.app.inject({ method: "GET", url: "/api/events?search=coronado", headers: { cookie: t.cookie } });
    expect(res.json().total).toBe(1);
    expect(res.json().items[0].designation).toBe("Triatlón Coronado");
  });
});
