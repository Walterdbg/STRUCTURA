import {
  DomainError,
  NOTE_REQUIRED,
  dec,
  decimalPlaces,
  uuidv7,
  type LocationKind,
  type MovementReason,
} from "@structura/domain";
import type { Db } from "../db.js";

// The one place where stock changes (spec 18.1: "all stock-changing paths
// use the same inventory service"). Always called inside a command
// transaction; posts the movement, its lines and the stock-position
// changes together.

export interface PostMovementInput {
  tenantId: string;
  actorId: string | null;
  commandId: string;
  reason: MovementReason;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  occurredAt: string;
  eventId: string | null;
  note: string | null;
  correctsMovementId?: string | null;
  lines: { itemId: string; quantity: string }[];
}

export interface MovementLineRecord {
  itemId: string;
  itemName: string;
  quantity: string;
  unit: string;
}

export interface MovementRecord {
  id: string;
  reason: MovementReason;
  sourceLocationId: string | null;
  sourceName: string | null;
  destinationLocationId: string | null;
  destinationName: string | null;
  occurredAt: string;
  recordedAt: string;
  actorId: string | null;
  actorName: string | null;
  eventId: string | null;
  eventDesignation: string | null;
  correctsMovementId: string | null;
  correctedByMovementId: string | null;
  note: string | null;
  lines: MovementLineRecord[];
}

async function location(t: Db, tenantId: string, id: string, role: string) {
  const { rows } = await t.query<{ id: string; kind: LocationKind; active: boolean; designation: string }>(
    "SELECT id, kind, active, designation FROM locations WHERE tenant_id = $1 AND id = $2",
    [tenantId, id]
  );
  const loc = rows[0];
  if (!loc) throw new DomainError("validation", `Unknown ${role} location`, { field: `${role}LocationId` });
  return loc;
}

export async function postMovement(t: Db, m: PostMovementInput): Promise<string> {
  const src = m.sourceLocationId ? await location(t, m.tenantId, m.sourceLocationId, "source") : null;
  const dst = m.destinationLocationId ? await location(t, m.tenantId, m.destinationLocationId, "destination") : null;

  if (dst && !dst.active) {
    throw new DomainError("validation", "The destination location is inactive", { field: "destinationLocationId" });
  }
  if (m.reason === "to_repair" && dst?.kind !== "repair") {
    throw new DomainError("validation", "Sending to repair needs a repair location as destination", {
      field: "destinationLocationId",
    });
  }
  if (m.reason === "repair_return" && (src?.kind !== "repair" || dst?.kind === "repair")) {
    throw new DomainError("validation", "A repair return goes from a repair location to a non-repair location", {
      field: "sourceLocationId",
    });
  }
  if (NOTE_REQUIRED.includes(m.reason) && !m.note) {
    throw new DomainError("validation", "Explain the reason for this movement", { field: "note" });
  }
  if (m.eventId) {
    const ev = await t.query("SELECT 1 FROM events WHERE tenant_id = $1 AND id = $2", [m.tenantId, m.eventId]);
    if (!ev.rows[0]) throw new DomainError("validation", "Unknown Event", { field: "eventId" });
  }

  const movementId = uuidv7();
  await t.query(
    `INSERT INTO movements (id, tenant_id, reason, source_location_id, destination_location_id, occurred_at,
                            actor_id, command_id, event_id, corrects_movement_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      movementId,
      m.tenantId,
      m.reason,
      m.sourceLocationId,
      m.destinationLocationId,
      m.occurredAt,
      m.actorId,
      m.commandId,
      m.eventId,
      m.correctsMovementId ?? null,
      m.note,
    ]
  );

  // Lines in a stable order, so two movements touching the same items lock
  // their stock rows in the same order and can't deadlock.
  const lines = [...m.lines].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
  for (const line of lines) {
    const { rows } = await t.query<{ unit: string; quantity_decimals: number; name: string; active: boolean }>(
      "SELECT unit, quantity_decimals, name, active FROM inventory_items WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
      [m.tenantId, line.itemId]
    );
    const item = rows[0];
    if (!item) throw new DomainError("validation", "Unknown item", { field: "lines", itemId: line.itemId });
    if (!item.active && !src) {
      throw new DomainError("validation", `"${item.name}" is inactive; stock can't be added to it`, {
        field: "lines",
        itemId: line.itemId,
      });
    }
    if (decimalPlaces(line.quantity) > item.quantity_decimals) {
      throw new DomainError(
        "validation",
        `"${item.name}" is counted in ${item.unit} with ${item.quantity_decimals} decimals`,
        { field: "lines", itemId: line.itemId, decimals: item.quantity_decimals }
      );
    }
    const qty = dec(line.quantity);

    if (src) {
      const pos = await t.query<{ quantity: string }>(
        "SELECT quantity FROM stock_positions WHERE tenant_id = $1 AND item_id = $2 AND location_id = $3 FOR UPDATE",
        [m.tenantId, line.itemId, src.id]
      );
      const available = dec(pos.rows[0]?.quantity ?? "0");
      if (available.lessThan(qty)) {
        // No silent negative stock (spec 6.5).
        throw new DomainError("insufficient_availability", `Not enough "${item.name}" at ${src.designation}`, {
          itemId: line.itemId,
          locationId: src.id,
          available: available.toFixed(),
          requested: qty.toFixed(),
        });
      }
      await t.query(
        `UPDATE stock_positions SET quantity = quantity - $4::numeric, updated_at = now()
          WHERE tenant_id = $1 AND item_id = $2 AND location_id = $3`,
        [m.tenantId, line.itemId, src.id, qty.toFixed()]
      );
    }
    if (dst) {
      await t.query(
        `INSERT INTO stock_positions (tenant_id, item_id, location_id, quantity) VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (tenant_id, item_id, location_id)
         DO UPDATE SET quantity = stock_positions.quantity + EXCLUDED.quantity, updated_at = now()`,
        [m.tenantId, line.itemId, dst.id, qty.toFixed()]
      );
    }
    await t.query(
      "INSERT INTO movement_lines (id, tenant_id, movement_id, item_id, quantity, unit) VALUES ($1, $2, $3, $4, $5::numeric, $6)",
      [uuidv7(), m.tenantId, movementId, line.itemId, qty.toFixed(), item.unit]
    );
  }
  return movementId;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

// Trailing zeros from NUMERIC(19,6) ("12.000000") are dropped for display.
export function trimQuantity(q: string): string {
  return dec(q).toFixed();
}

export async function listMovements(
  db: Db,
  tenantId: string,
  opts: { itemId?: string; locationId?: string; eventId?: string; movementId?: string; limit: number; offset: number }
): Promise<{ items: MovementRecord[]; total: number }> {
  const where = ["m.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (opts.movementId) {
    params.push(opts.movementId);
    where.push(`m.id = $${params.length}`);
  }
  if (opts.itemId) {
    params.push(opts.itemId);
    where.push(`EXISTS (SELECT 1 FROM movement_lines x WHERE x.movement_id = m.id AND x.item_id = $${params.length})`);
  }
  if (opts.locationId) {
    params.push(opts.locationId);
    where.push(`(m.source_location_id = $${params.length} OR m.destination_location_id = $${params.length})`);
  }
  if (opts.eventId) {
    params.push(opts.eventId);
    where.push(`m.event_id = $${params.length}`);
  }
  const cond = where.join(" AND ");
  const total = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM movements m WHERE ${cond}`, params);
  params.push(opts.limit, opts.offset);
  const { rows } = await db.query<{
    id: string;
    reason: MovementReason;
    source_location_id: string | null;
    source_name: string | null;
    destination_location_id: string | null;
    destination_name: string | null;
    occurred_at: Date | string;
    recorded_at: Date | string;
    actor_id: string | null;
    actor_name: string | null;
    event_id: string | null;
    event_designation: string | null;
    corrects_movement_id: string | null;
    corrected_by: string | null;
    note: string | null;
  }>(
    `SELECT m.*, s.designation AS source_name, d.designation AS destination_name, u.display_name AS actor_name,
            e.designation AS event_designation, c.id AS corrected_by
       FROM movements m
       LEFT JOIN locations s ON s.id = m.source_location_id
       LEFT JOIN locations d ON d.id = m.destination_location_id
       LEFT JOIN users u ON u.id = m.actor_id
       LEFT JOIN events e ON e.id = m.event_id
       LEFT JOIN movements c ON c.corrects_movement_id = m.id
      WHERE ${cond}
      ORDER BY m.occurred_at DESC, m.recorded_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? (
        await db.query<{ movement_id: string; item_id: string; name: string; quantity: string; unit: string }>(
          `SELECT l.movement_id, l.item_id, i.name, l.quantity, l.unit
             FROM movement_lines l JOIN inventory_items i ON i.id = l.item_id
            WHERE l.tenant_id = $1 AND l.movement_id = ANY($2::uuid[])
            ORDER BY i.name`,
          [tenantId, ids]
        )
      ).rows
    : [];
  const byMovement = new Map<string, MovementLineRecord[]>();
  for (const l of lines) {
    const list = byMovement.get(l.movement_id) ?? [];
    list.push({ itemId: l.item_id, itemName: l.name, quantity: trimQuantity(l.quantity), unit: l.unit });
    byMovement.set(l.movement_id, list);
  }
  return {
    total: Number(total.rows[0]?.n ?? 0),
    items: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      sourceLocationId: r.source_location_id,
      sourceName: r.source_name,
      destinationLocationId: r.destination_location_id,
      destinationName: r.destination_name,
      occurredAt: iso(r.occurred_at),
      recordedAt: iso(r.recorded_at),
      actorId: r.actor_id,
      actorName: r.actor_name,
      eventId: r.event_id,
      eventDesignation: r.event_designation,
      correctsMovementId: r.corrects_movement_id,
      correctedByMovementId: r.corrected_by,
      note: r.note,
      lines: byMovement.get(r.id) ?? [],
    })),
  };
}

export async function getMovement(db: Db, tenantId: string, id: string): Promise<MovementRecord> {
  const res = await listMovements(db, tenantId, { movementId: id, limit: 1, offset: 0 });
  if (!res.items[0]) throw new DomainError("not_found", "Movement not found");
  return res.items[0];
}
