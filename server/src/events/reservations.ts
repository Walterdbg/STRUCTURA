import {
  CANCELLABLE_STATES,
  DomainError,
  EDITABLE_STATES,
  dec,
  decimalPlaces,
  uuidv7,
  type EventActionFields,
  type EventLinesFields,
} from "@structura/domain";
import { executeCommand, type CommandContext } from "../commands.js";
import type { Db } from "../db.js";
import type { ParsedCommand } from "../http.js";
import { trimQuantity } from "../inventory/ledger.js";
import { MAX_RESERVATION_DAYS, availability, type Availability } from "./availability.js";
import { getEvent, type EventRecord } from "./service.js";

export interface EventLineRecord {
  id: string;
  itemId: string;
  itemName: string;
  internalReference: string | null;
  unit: string;
  requested: string;
  reserved: string;
  notes: string | null;
  // Present when the Event has both rental dates.
  availability: (Availability & { ok: boolean }) | null;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

// The workbook's VALIDAR: each line with what is still available for the
// Event's dates, not counting the Event's own reservations.
export async function getEventLines(db: Db, tenantId: string, eventId: string): Promise<EventLineRecord[]> {
  const ev = await getEvent(db, tenantId, eventId);
  const { rows } = await db.query<{
    id: string;
    item_id: string;
    name: string;
    internal_reference: string | null;
    unit: string;
    requested_qty: string;
    notes: string | null;
    reserved: string;
  }>(
    `SELECT l.id, l.item_id, i.name, i.internal_reference, l.unit, l.requested_qty, l.notes,
            coalesce((SELECT sum(r.quantity) FROM reservations r
                       WHERE r.tenant_id = l.tenant_id AND r.event_id = l.event_id AND r.item_id = l.item_id
                         AND r.state = 'committed'), 0)::text AS reserved
       FROM event_inventory_lines l JOIN inventory_items i ON i.id = l.item_id
      WHERE l.tenant_id = $1 AND l.event_id = $2
      ORDER BY lower(i.name)`,
    [tenantId, eventId]
  );
  const withDates = ev.departureDate && ev.expectedReturnDate && daysBetween(ev.departureDate, ev.expectedReturnDate) <= MAX_RESERVATION_DAYS;
  const out: EventLineRecord[] = [];
  for (const r of rows) {
    let a: EventLineRecord["availability"] = null;
    if (withDates) {
      const av = await availability(db, tenantId, r.item_id, ev.departureDate!, ev.expectedReturnDate!, eventId);
      const { availableDec, ...rest } = av;
      a = { ...rest, ok: !availableDec.lessThan(dec(r.requested_qty)) };
    }
    out.push({
      id: r.id,
      itemId: r.item_id,
      itemName: r.name,
      internalReference: r.internal_reference,
      unit: r.unit,
      requested: trimQuantity(r.requested_qty),
      reserved: trimQuantity(r.reserved),
      notes: r.notes,
      availability: a,
    });
  }
  return out;
}

function checkVersion(ev: EventRecord, expected: number | null) {
  if (expected === null || ev.version !== expected) {
    throw new DomainError("stale_version", "Someone else changed this Event. Reload it and try again.", {
      currentVersion: ev.version,
    });
  }
}

async function closeReservations(t: Db, ctx: CommandContext, eventId: string, state: "released" | "cancelled", reason: string) {
  const { rows } = await t.query<{ id: string }>(
    `UPDATE reservations SET state = $3, closed_at = now(), closed_by = $4, close_reason = $5
      WHERE tenant_id = $1 AND event_id = $2 AND state = 'committed'
      RETURNING id`,
    [ctx.tenantId, eventId, state, ctx.actorId, reason]
  );
  return rows.map((r) => r.id);
}

// Replaces the Event's reservations with ones matching its current lines
// and dates, or refuses with the lines that don't fit (AT-04). Runs inside
// the command transaction: on refusal the previous reservations stand.
export async function commitReservations(t: Db, ctx: CommandContext, ev: EventRecord, commandId: string): Promise<string[]> {
  if (!ev.departureDate || !ev.expectedReturnDate) {
    throw new DomainError("validation", "Set the departure and expected return dates first", { field: "departureDate" });
  }
  if (daysBetween(ev.departureDate, ev.expectedReturnDate) > MAX_RESERVATION_DAYS) {
    throw new DomainError("validation", `A rental can't be longer than ${MAX_RESERVATION_DAYS} days`, { field: "expectedReturnDate" });
  }
  const lines = await t.query<{ id: string; item_id: string; requested_qty: string; name: string }>(
    `SELECT l.id, l.item_id, l.requested_qty, i.name FROM event_inventory_lines l JOIN inventory_items i ON i.id = l.item_id
      WHERE l.tenant_id = $1 AND l.event_id = $2 ORDER BY l.item_id`,
    [ctx.tenantId, ev.id]
  );
  if (lines.rows.length === 0) {
    throw new DomainError("validation", "Add at least one product before confirming", { field: "lines" });
  }
  // Serialize commitments per item: whoever confirms first wins; the other
  // re-checks against the new commitment instead of overbooking.
  for (const l of lines.rows) {
    await t.query("SELECT 1 FROM inventory_items WHERE tenant_id = $1 AND id = $2 FOR UPDATE", [ctx.tenantId, l.item_id]);
  }
  await closeReservations(t, ctx, ev.id, "released", "replaced");

  const short: { itemId: string; name: string; requested: string; available: string }[] = [];
  for (const l of lines.rows) {
    const av = await availability(t, ctx.tenantId, l.item_id, ev.departureDate, ev.expectedReturnDate, ev.id);
    if (av.availableDec.lessThan(dec(l.requested_qty))) {
      short.push({ itemId: l.item_id, name: l.name, requested: trimQuantity(l.requested_qty), available: av.available });
    }
  }
  if (short.length) {
    throw new DomainError("insufficient_availability", "Not enough available for these dates", { lines: short });
  }
  const ids: string[] = [];
  for (const l of lines.rows) {
    const id = uuidv7();
    await t.query(
      `INSERT INTO reservations (id, tenant_id, event_id, line_id, item_id, quantity, starts_on, ends_on, state, command_id)
       VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, 'committed', $9)`,
      [id, ctx.tenantId, ev.id, l.id, l.item_id, l.requested_qty, ev.departureDate, ev.expectedReturnDate, commandId]
    );
    ids.push(id);
  }
  return ids;
}

async function bumpEvent(t: Db, tenantId: string, id: string, state?: string) {
  await t.query(
    `UPDATE events SET version = version + 1, updated_at = now(), fulfillment_state = coalesce($3, fulfillment_state)
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, state ?? null]
  );
}

export async function setEventLines(db: Db, ctx: CommandContext, eventId: string, cmd: ParsedCommand<EventLinesFields>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "event.lines.set", occurredAt: cmd.occurredAt, payload: { eventId, ...f } },
    async (t) => {
      const ev = await getEvent(t, ctx.tenantId, eventId);
      checkVersion(ev, cmd.expectedVersion);
      if (!EDITABLE_STATES.includes(ev.fulfillmentState)) {
        throw new DomainError("invalid_state", `Products can't change once the Event is "${ev.fulfillmentState}"`);
      }
      const before = await getEventLines(t, ctx.tenantId, eventId);
      for (const l of f.lines) {
        const { rows } = await t.query<{ unit: string; quantity_decimals: number; name: string; active: boolean }>(
          "SELECT unit, quantity_decimals, name, active FROM inventory_items WHERE tenant_id = $1 AND id = $2",
          [ctx.tenantId, l.itemId]
        );
        const item = rows[0];
        if (!item) throw new DomainError("validation", "Unknown product", { field: "lines", itemId: l.itemId });
        if (!item.active) throw new DomainError("validation", `"${item.name}" is inactive`, { field: "lines", itemId: l.itemId });
        if (decimalPlaces(l.quantity) > item.quantity_decimals) {
          throw new DomainError("validation", `"${item.name}" is counted in ${item.unit} with ${item.quantity_decimals} decimals`, {
            field: "lines",
            itemId: l.itemId,
          });
        }
      }
      // Lines are planning data: they are replaced as a set; the audit
      // keeps the before/after. (reservations.line_id is informational.)
      await t.query("DELETE FROM event_inventory_lines WHERE tenant_id = $1 AND event_id = $2", [ctx.tenantId, eventId]);
      for (const l of f.lines) {
        await t.query(
          `INSERT INTO event_inventory_lines (id, tenant_id, event_id, item_id, requested_qty, unit, notes)
           SELECT $1, $2, $3, $4, $5::numeric, unit, $6 FROM inventory_items WHERE tenant_id = $2 AND id = $4`,
          [uuidv7(), ctx.tenantId, eventId, l.itemId, l.quantity, l.notes]
        );
      }
      let reservations: string[] = [];
      if (ev.fulfillmentState === "confirmed") {
        // A confirmed Event keeps its promise only if the new lines fit.
        reservations = await commitReservations(t, ctx, ev, cmd.commandId);
      }
      await bumpEvent(t, ctx.tenantId, eventId);
      const after = await getEventLines(t, ctx.tenantId, eventId);
      return {
        result: { event: await getEvent(t, ctx.tenantId, eventId), lines: after },
        audit: [
          {
            action: "event.lines.set",
            recordType: "event",
            recordId: eventId,
            change: {
              before: before.map((l) => ({ itemId: l.itemId, quantity: l.requested })),
              after: f.lines,
              reservations,
            },
          },
        ],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "event.lines.set", lines: f.lines } }],
      };
    }
  );
}

// Borrador -> Confirmado: availability is committed for every line.
export async function confirmEvent(db: Db, ctx: CommandContext, eventId: string, cmd: ParsedCommand<EventActionFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "event.confirm", occurredAt: cmd.occurredAt, payload: { eventId, ...cmd.payload } },
    async (t) => {
      const ev = await getEvent(t, ctx.tenantId, eventId);
      checkVersion(ev, cmd.expectedVersion);
      if (ev.fulfillmentState !== "draft") {
        throw new DomainError("invalid_state", `Only a draft Event can be confirmed (this one is "${ev.fulfillmentState}")`);
      }
      const reservations = await commitReservations(t, ctx, ev, cmd.commandId);
      await bumpEvent(t, ctx.tenantId, eventId, "confirmed");
      const after = await getEvent(t, ctx.tenantId, eventId);
      return {
        result: { event: after, lines: await getEventLines(t, ctx.tenantId, eventId) },
        audit: [{ action: "event.confirmed", recordType: "event", recordId: eventId, change: { reservations, note: cmd.payload.note } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "event.confirmed", event: after, reservations } }],
      };
    }
  );
}

// CANCELAR EVENTO: only before dispatch. Reservations are released; no
// stock history is touched (spec 6.5).
export async function cancelEvent(db: Db, ctx: CommandContext, eventId: string, cmd: ParsedCommand<EventActionFields>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "event.cancel", occurredAt: cmd.occurredAt, payload: { eventId, ...cmd.payload } },
    async (t) => {
      const ev = await getEvent(t, ctx.tenantId, eventId);
      checkVersion(ev, cmd.expectedVersion);
      if (!CANCELLABLE_STATES.includes(ev.fulfillmentState)) {
        throw new DomainError("invalid_state", `An Event that is "${ev.fulfillmentState}" can't be cancelled; record the returns instead`);
      }
      const released = await closeReservations(t, ctx, eventId, "cancelled", cmd.payload.note ?? "event cancelled");
      await bumpEvent(t, ctx.tenantId, eventId, "cancelled");
      const after = await getEvent(t, ctx.tenantId, eventId);
      return {
        result: { event: after, lines: await getEventLines(t, ctx.tenantId, eventId) },
        audit: [{ action: "event.cancelled", recordType: "event", recordId: eventId, change: { released, note: cmd.payload.note } }],
        outbox: [{ aggregateType: "event", aggregateId: eventId, payload: { type: "event.cancelled", event: after, released } }],
      };
    }
  );
}
