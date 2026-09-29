import { dec, type Dec } from "@structura/domain";
import type { Db } from "../db.js";
import { trimQuantity } from "../inventory/ledger.js";

// How much of an item can still be committed over [from, to] - both days
// included (UC-21, spec 6.5). The rule, per day d of the interval:
//
//   used(d)   = other Events' committed reservations covering d
//             + stock out at event locations that no reservation explains
//             + stock still out for an Event whose expected return has passed
//   capacity  = everything owned except what is in repair
//   available = capacity - max over d of used(d)
//
// Stock moved to an event location *for* an Event (movement.event_id) is
// already counted by that Event's reservation, up to the reserved
// quantity, so it isn't counted twice (integration contract, "Inventory
// quantity contract"). An expected return date never creates a receipt:
// once it has passed, stock still out keeps blocking new commitments.

export interface Availability {
  capacity: string;
  peakCommitted: string;
  unexplainedOut: string;
  overdueOut: string;
  available: string;
}

export async function availability(
  db: Db,
  tenantId: string,
  itemId: string,
  from: string,
  to: string,
  excludeEventId: string | null
): Promise<Availability & { availableDec: Dec }> {
  const { rows } = await db.query<{
    usable: string;
    out_now: string;
    attributed: string;
    overdue_out: string;
    peak: string;
  }>(
    `WITH pos AS (
       SELECT coalesce(sum(sp.quantity) FILTER (WHERE l.kind <> 'repair'), 0) AS usable,
              coalesce(sum(sp.quantity) FILTER (WHERE l.kind = 'event'), 0) AS out_now
         FROM stock_positions sp JOIN locations l ON l.id = sp.location_id
        WHERE sp.tenant_id = $1 AND sp.item_id = $2),
     moved AS (
       SELECT m.event_id,
              coalesce(sum(ml.quantity) FILTER (WHERE dl.kind = 'event'), 0)
            - coalesce(sum(ml.quantity) FILTER (WHERE sl.kind = 'event'), 0) AS net
         FROM movements m
         JOIN movement_lines ml ON ml.movement_id = m.id
         LEFT JOIN locations sl ON sl.id = m.source_location_id
         LEFT JOIN locations dl ON dl.id = m.destination_location_id
        WHERE m.tenant_id = $1 AND ml.item_id = $2 AND m.event_id IS NOT NULL
        GROUP BY m.event_id),
     res AS (
       SELECT r.event_id, sum(r.quantity) AS qty, max(r.ends_on) AS ends_on
         FROM reservations r
        WHERE r.tenant_id = $1 AND r.item_id = $2 AND r.state = 'committed'
        GROUP BY r.event_id),
     attr AS (
       SELECT res.event_id,
              least(greatest(coalesce(moved.net, 0), 0), res.qty) AS q,
              res.ends_on < (now() AT TIME ZONE e.timezone)::date AS overdue
         FROM res
         LEFT JOIN moved ON moved.event_id = res.event_id
         JOIN events e ON e.id = res.event_id),
     days AS (
       SELECT d::date AS d FROM generate_series($3::date, $4::date, interval '1 day') AS d),
     per_day AS (
       SELECT days.d, coalesce(sum(r.quantity), 0) AS committed
         FROM days
         LEFT JOIN reservations r
           ON r.tenant_id = $1 AND r.item_id = $2 AND r.state = 'committed'
          AND r.event_id IS DISTINCT FROM $5::uuid
          AND days.d BETWEEN r.starts_on AND r.ends_on
        GROUP BY days.d)
     SELECT pos.usable::text, pos.out_now::text,
            (SELECT coalesce(sum(q), 0) FROM attr)::text AS attributed,
            (SELECT coalesce(sum(q), 0) FROM attr WHERE overdue AND event_id IS DISTINCT FROM $5::uuid)::text AS overdue_out,
            (SELECT coalesce(max(committed), 0) FROM per_day)::text AS peak
       FROM pos`,
    [tenantId, itemId, from, to, excludeEventId]
  );
  const r = rows[0]!;
  const usable = dec(r.usable);
  const unexplained = atLeastZero(dec(r.out_now).minus(dec(r.attributed)));
  const overdue = dec(r.overdue_out);
  const peak = dec(r.peak);
  const capacity = usable.minus(unexplained).minus(overdue);
  const available = atLeastZero(capacity.minus(peak));
  return {
    capacity: trimQuantity(atLeastZero(capacity).toFixed()),
    peakCommitted: trimQuantity(peak.toFixed()),
    unexplainedOut: trimQuantity(unexplained.toFixed()),
    overdueOut: trimQuantity(overdue.toFixed()),
    available: trimQuantity(available.toFixed()),
    availableDec: available,
  };
}

function atLeastZero(v: Dec): Dec {
  return v.isNegative() ? dec("0") : v;
}

// Longest rental interval accepted in one reservation.
export const MAX_RESERVATION_DAYS = 366;
