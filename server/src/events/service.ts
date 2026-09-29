import { DomainError, EDITABLE_STATES, uuidv7, type EventFields, type FulfillmentState } from "@structura/domain";
import { executeCommand, type CommandContext, type CommandResult } from "../commands.js";
import type { Db } from "../db.js";
import type { ParsedCommand } from "../http.js";
import { commitReservations } from "./reservations.js";

export interface EventRecord {
  id: string;
  designation: string;
  designationStatus: "provisional" | "final";
  responsibleUserId: string;
  responsibleName: string;
  timezone: string;
  location: string | null;
  eventDate: string | null;
  departureDate: string | null;
  expectedReturnDate: string | null;
  closureDate: string | null;
  notes: string | null;
  fulfillmentState: FulfillmentState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface EventRow {
  id: string;
  designation: string;
  designation_status: "provisional" | "final";
  responsible_user_id: string;
  responsible_name: string;
  timezone: string;
  location_text: string | null;
  event_date: string | null;
  departure_date: string | null;
  expected_return_date: string | null;
  closure_date: string | null;
  notes: string | null;
  fulfillment_state: FulfillmentState;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function toRecord(r: EventRow): EventRecord {
  return {
    id: r.id,
    designation: r.designation,
    designationStatus: r.designation_status,
    responsibleUserId: r.responsible_user_id,
    responsibleName: r.responsible_name,
    timezone: r.timezone,
    location: r.location_text,
    eventDate: r.event_date,
    departureDate: r.departure_date,
    expectedReturnDate: r.expected_return_date,
    closureDate: r.closure_date,
    notes: r.notes,
    fulfillmentState: r.fulfillment_state,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const SELECT = `
  SELECT e.*, u.display_name AS responsible_name
    FROM events e
    JOIN users u ON u.id = e.responsible_user_id`;

export async function getEvent(db: Db, tenantId: string, id: string): Promise<EventRecord> {
  const { rows } = await db.query<EventRow>(`${SELECT} WHERE e.tenant_id = $1 AND e.id = $2`, [tenantId, id]);
  if (!rows[0]) throw new DomainError("not_found", "Event not found");
  return toRecord(rows[0]);
}

export async function listEvents(
  db: Db,
  tenantId: string,
  opts: { search?: string; state?: string; limit: number; offset: number }
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
  return { items: rows.map(toRecord), total: Number(total.rows[0]?.n ?? 0) };
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
      await assertMember(t, ctx.tenantId, f.responsibleUserId);
      const id = uuidv7();
      await t.query(
        `INSERT INTO events (id, tenant_id, designation, designation_status, responsible_user_id, timezone,
                             location_text, event_date, departure_date, expected_return_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
        ]
      );
      const record = await getEvent(t, ctx.tenantId, id);
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
      const before = await getEvent(t, ctx.tenantId, id);
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
      await assertMember(t, ctx.tenantId, f.responsibleUserId);
      const { rows } = await t.query<{ id: string }>(
        `UPDATE events
            SET designation = $3, designation_status = $4, responsible_user_id = $5, timezone = $6,
                location_text = $7, event_date = $8, departure_date = $9, expected_return_date = $10,
                notes = $11, version = version + 1, updated_at = now()
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
        ]
      );
      if (!rows[0]) throw new DomainError("stale_version", "Someone else changed this Event. Reload it and try again.");
      let after = await getEvent(t, ctx.tenantId, id);
      // New rental dates on a confirmed Event: its reservations must fit
      // the new dates too, or the edit is refused (UC-21).
      if (
        before.fulfillmentState === "confirmed" &&
        (before.departureDate !== after.departureDate || before.expectedReturnDate !== after.expectedReturnDate)
      ) {
        await commitReservations(t, ctx, after, cmd.commandId);
        after = await getEvent(t, ctx.tenantId, id);
      }
      return {
        result: after,
        audit: [{ action: "event.updated", recordType: "event", recordId: id, change: { before, after: f } }],
        outbox: [{ aggregateType: "event", aggregateId: id, payload: { type: "event.updated", event: after } }],
      };
    }
  );
}
