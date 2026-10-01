import {
  DATE_FIELDS,
  DomainError,
  EDITABLE_STATES,
  limitIssues,
  pastDateIssues,
  returnAlert,
  todayIn,
  uuidv7,
  type DateField,
  type DateRules,
  type EventFields,
  type EventType,
  type FulfillmentState,
  type ReturnAlert,
} from "@structura/domain";
import { executeCommand, type CommandContext, type CommandResult } from "../commands.js";
import type { Db } from "../db.js";
import type { ParsedCommand } from "../http.js";
import { commitReservations } from "./reservations.js";

export interface EventRecord {
  id: string;
  designation: string;
  designationStatus: "provisional" | "final";
  eventType: EventType;
  responsibleUserId: string;
  responsibleName: string;
  timezone: string;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  eventDate: string | null;
  departureDate: string | null;
  expectedReturnDate: string | null;
  closureDate: string | null;
  notes: string | null;
  fulfillmentState: FulfillmentState;
  // DEC-028: equipment sent out for this Event and not yet back, and the
  // warning that follows from it (ended_out a few days after the event,
  // overdue after the expected return).
  equipmentOut: boolean;
  returnAlert: ReturnAlert;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface EventRow {
  id: string;
  designation: string;
  designation_status: "provisional" | "final";
  event_type: EventType;
  responsible_user_id: string;
  responsible_name: string;
  timezone: string;
  location_text: string | null;
  location_lat: string | null;
  location_lng: string | null;
  event_date: string | null;
  departure_date: string | null;
  expected_return_date: string | null;
  closure_date: string | null;
  notes: string | null;
  fulfillment_state: FulfillmentState;
  equipment_out: boolean;
  departure_max_days: number;
  return_max_business_days: number;
  return_warning_days: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const rulesOf = (r: { departure_max_days: number; return_max_business_days: number; return_warning_days: number }): DateRules => ({
  departureMaxDays: Number(r.departure_max_days),
  returnMaxBusinessDays: Number(r.return_max_business_days),
  returnWarningDays: Number(r.return_warning_days),
});

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function toRecord(r: EventRow, now: Date): EventRecord {
  const base = {
    eventDate: r.event_date,
    expectedReturnDate: r.expected_return_date,
    fulfillmentState: r.fulfillment_state,
  };
  return {
    id: r.id,
    designation: r.designation,
    designationStatus: r.designation_status,
    eventType: r.event_type,
    responsibleUserId: r.responsible_user_id,
    responsibleName: r.responsible_name,
    timezone: r.timezone,
    location: r.location_text,
    locationLat: r.location_lat === null ? null : Number(r.location_lat),
    locationLng: r.location_lng === null ? null : Number(r.location_lng),
    eventDate: r.event_date,
    departureDate: r.departure_date,
    expectedReturnDate: r.expected_return_date,
    closureDate: r.closure_date,
    notes: r.notes,
    fulfillmentState: r.fulfillment_state,
    equipmentOut: Boolean(r.equipment_out),
    returnAlert: returnAlert(base, Boolean(r.equipment_out), todayIn(r.timezone, now), rulesOf(r)),
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

// Equipment out for an Event: what its movements sent to event locations
// minus what they brought back from them.
const SELECT = `
  SELECT e.*, u.display_name AS responsible_name,
         t.departure_max_days, t.return_max_business_days, t.return_warning_days,
         coalesce((SELECT sum(CASE WHEN dl.kind = 'event' THEN ml.quantity ELSE 0 END)
                        - sum(CASE WHEN sl.kind = 'event' THEN ml.quantity ELSE 0 END)
                     FROM movements m
                     JOIN movement_lines ml ON ml.movement_id = m.id
                     LEFT JOIN locations sl ON sl.id = m.source_location_id
                     LEFT JOIN locations dl ON dl.id = m.destination_location_id
                    WHERE m.tenant_id = e.tenant_id AND m.event_id = e.id), 0) > 0 AS equipment_out
    FROM events e
    JOIN users u ON u.id = e.responsible_user_id
    JOIN tenants t ON t.id = e.tenant_id`;

export async function getEvent(db: Db, tenantId: string, id: string, now: Date = new Date()): Promise<EventRecord> {
  const { rows } = await db.query<EventRow>(`${SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [tenantId, id]);
  if (!rows[0]) throw new DomainError("not_found", "Event not found");
  return toRecord(rows[0], now);
}

// The organization's date rules (DEC-028).
export async function getDateRules(db: Db, tenantId: string): Promise<DateRules> {
  const { rows } = await db.query<{ departure_max_days: number; return_max_business_days: number; return_warning_days: number }>(
    "SELECT departure_max_days, return_max_business_days, return_warning_days FROM tenants WHERE id = $1",
    [tenantId]
  );
  if (!rows[0]) throw new DomainError("not_found", "Organization not found");
  return rulesOf(rows[0]);
}

export async function setDateRules(db: Db, ctx: CommandContext, cmd: ParsedCommand<DateRules>): Promise<CommandResult<DateRules>> {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "tenant.date_rules", occurredAt: cmd.occurredAt, payload: cmd.payload },
    async (t) => {
      const before = await getDateRules(t, ctx.tenantId);
      const p = cmd.payload;
      await t.query(
        "UPDATE tenants SET departure_max_days = $2, return_max_business_days = $3, return_warning_days = $4, config_version = config_version + 1 WHERE id = $1",
        [ctx.tenantId, p.departureMaxDays, p.returnMaxBusinessDays, p.returnWarningDays]
      );
      return {
        result: p,
        audit: [{ action: "tenant.date_rules_changed", recordType: "tenant", recordId: ctx.tenantId, change: { before, after: p } }],
        outbox: [],
      };
    }
  );
}

export async function listEvents(
  db: Db,
  tenantId: string,
  opts: { search?: string; state?: string; limit: number; offset: number },
  now: Date = new Date()
): Promise<{ items: EventRecord[]; total: number }> {
  const where = ["e.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(e.designation ILIKE $${params.length} OR e.location_text ILIKE $${params.length})`);
  }
  if (opts.state) {
    params.push(opts.state);
    where.push(`e.fulfillment_state = $${params.length}`);
  }
  const cond = where.join(" AND ");
  const total = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM events e WHERE ${cond}`, params);
  params.push(opts.limit, opts.offset);
  const { rows } = await db.query<EventRow>(
    `${SELECT} WHERE ${cond}
     ORDER BY coalesce(e.departure_date, e.event_date) DESC NULLS LAST, e.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: rows.map((r) => toRecord(r, now)), total: Number(total.rows[0]?.n ?? 0) };
}

// DEC-019: dates being entered or changed can't be before today in the
// Event's timezone. Refuses with the first offending field.
function assertNotPast(
  f: EventFields,
  now: Date | undefined,
  changed: readonly DateField[] = DATE_FIELDS
): void {
  const issue = pastDateIssues(f, todayIn(f.timezone, now ?? new Date()), changed)[0];
  if (issue) {
    throw new DomainError("validation", "This date is in the past", { field: issue.field, reason: "past" });
  }
}

// DEC-028: departure and return limits of the organization.
async function assertWithinLimits(t: Db, tenantId: string, f: EventFields, changed: readonly DateField[] = DATE_FIELDS): Promise<void> {
  const issue = limitIssues(f, await getDateRules(t, tenantId), changed)[0];
  if (issue) {
    throw new DomainError("validation", issue.message, { field: issue.field, reason: issue.reason, limit: issue.limit });
  }
}

async function assertMember(t: Db, tenantId: string, userId: string): Promise<void> {
  const { rows } = await t.query("SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND active", [
    tenantId,
    userId,
  ]);
  if (!rows[0]) {
    throw new DomainError("validation", "The responsible person must be an active member of this organization", {
      field: "responsibleUserId",
    });
  }
}

// UC-13: create a draft Event. No customer, final name, inventory, Trip or
// invoice is required or created.
export async function createEvent(
  db: Db,
  ctx: CommandContext,
  cmd: ParsedCommand<EventFields>
): Promise<CommandResult<EventRecord>> {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "event.create", occurredAt: cmd.occurredAt, payload: f },
    async (t) => {
      assertNotPast(f, ctx.now);
      await assertWithinLimits(t, ctx.tenantId, f);
      await assertMember(t, ctx.tenantId, f.responsibleUserId);
      const id = uuidv7();
      await t.query(
        `INSERT INTO events (id, tenant_id, designation, designation_status, responsible_user_id, timezone,
                             location_text, event_date, departure_date, expected_return_date, notes, created_by,
                             location_lat, location_lng, event_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          ctx.tenantId,
          f.designation,
          f.designationStatus,
          f.responsibleUserId,
          f.timezone,
          f.location,
          f.eventDate,
          f.departureDate,
          f.expectedReturnDate,
          f.notes,
          ctx.actorId,
          f.locationLat,
          f.locationLng,
          f.eventType,
        ]
      );
      const record = await getEvent(t, ctx.tenantId, id, ctx.now);
      return {
        result: record,
        audit: [{ action: "event.created", recordType: "event", recordId: id, change: { after: f } }],
        outbox: [{ aggregateType: "event", aggregateId: id, payload: { type: "event.created", event: record } }],
      };
    }
  );
}

// Metadata edit with optimistic concurrency: the user's expected version
// must still be current, otherwise nothing is overwritten (stale_version).
export async function updateEvent(
  db: Db,
  ctx: CommandContext,
  id: string,
  cmd: ParsedCommand<EventFields>
): Promise<CommandResult<EventRecord>> {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "event.update", occurredAt: cmd.occurredAt, payload: { id, ...f } },
    async (t) => {
      const before = await getEvent(t, ctx.tenantId, id, ctx.now);
      if (cmd.expectedVersion === null) {
        throw new DomainError("validation", "expectedVersion is required when editing");
      }
      if (before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this Event. Reload it and try again.", {
          currentVersion: before.version,
        });
      }
      if (!EDITABLE_STATES.includes(before.fulfillmentState)) {
        throw new DomainError("invalid_state", `An Event in state "${before.fulfillmentState}" can no longer be edited`);
      }
      // Only dates that change are checked, so an Event whose dates have
      // gone by can still be edited (notes, responsible, ...).
      const changed = DATE_FIELDS.filter((d) => f[d] !== before[d]);
      assertNotPast(f, ctx.now, f.timezone !== before.timezone ? DATE_FIELDS : changed);
      // DEC-031: the type is chosen at creation and never changes (a rental
      // can't become a race; a race is created as one).
      if (f.eventType !== before.eventType) {
        throw new DomainError("validation", "The type of an Event can't be changed", { field: "eventType", reason: "type_fixed" });
      }
      await assertWithinLimits(t, ctx.tenantId, f, changed);
      await assertMember(t, ctx.tenantId, f.responsibleUserId);
      const { rows } = await t.query<{ id: string }>(
        `UPDATE events
            SET designation = $3, designation_status = $4, responsible_user_id = $5, timezone = $6,
                location_text = $7, event_date = $8, departure_date = $9, expected_return_date = $10,
                notes = $11, location_lat = $13, location_lng = $14, version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $12
          RETURNING id`,
        [
          ctx.tenantId,
          id,
          f.designation,
          f.designationStatus,
          f.responsibleUserId,
          f.timezone,
          f.location,
          f.eventDate,
          f.departureDate,
          f.expectedReturnDate,
          f.notes,
          cmd.expectedVersion,
          f.locationLat,
          f.locationLng,
        ]
      );
      if (!rows[0]) throw new DomainError("stale_version", "Someone else changed this Event. Reload it and try again.");
      let after = await getEvent(t, ctx.tenantId, id, ctx.now);
      // New rental dates on a confirmed Event: its reservations must fit
      // the new dates too, or the edit is refused (UC-21).
      if (
        before.fulfillmentState === "confirmed" &&
        (before.departureDate !== after.departureDate || before.expectedReturnDate !== after.expectedReturnDate)
      ) {
        await commitReservations(t, ctx, after, cmd.commandId);
        after = await getEvent(t, ctx.tenantId, id, ctx.now);
      }
      return {
        result: after,
        audit: [{ action: "event.updated", recordType: "event", recordId: id, change: { before, after: f } }],
        outbox: [{ aggregateType: "event", aggregateId: id, payload: { type: "event.updated", event: after } }],
      };
    }
  );
}
