import { z } from "zod";

// Event (spec 6.2, 6.4, UC-13). An Event can start internally with a
// provisional designation and no customer (EVT-01, AT-01). Event date,
// departure date, expected return and actual closure stay separate fields.
export const FULFILLMENT_STATES = ["draft", "confirmed", "delivered", "partial_return", "closed", "cancelled"] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export const DESIGNATION_STATUSES = ["provisional", "final"] as const;

// DEC-031: a race has running courses; a rental is rented inventory with a
// location, deliveries and pickups. Chosen at creation, never changed.
export const EVENT_TYPES = ["rental", "race"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// A calendar date (YYYY-MM-DD) in the Event's timezone, never a timestamp:
// "day 14" keeps its local meaning across timezone offset changes (UC-21).
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Not a real calendar date");

const optionalText = z
  .string()
  .max(4000)
  .transform((s) => s.trim())
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional()
  .transform((s) => s ?? null);

export const eventFields = z
  .object({
    designation: z.string().trim().min(1, "A designation is required (it can be provisional)").max(200),
    designationStatus: z.enum(DESIGNATION_STATUSES).default("provisional"),
    eventType: z.enum(EVENT_TYPES).default("rental"),
    responsibleUserId: z.string().uuid(),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    location: optionalText,
    // The location as a point on the map (WGS84), chosen by search or by
    // clicking the map. Both or neither.
    locationLat: z.number().min(-90).max(90).nullable().optional().transform((v) => v ?? null),
    locationLng: z.number().min(-180).max(180).nullable().optional().transform((v) => v ?? null),
    eventDate: localDate.nullable().optional().transform((s) => s ?? null),
    departureDate: localDate.nullable().optional().transform((s) => s ?? null),
    expectedReturnDate: localDate.nullable().optional().transform((s) => s ?? null),
    notes: optionalText,
  })
  .superRefine((e, ctx) => {
    if ((e.locationLat === null) !== (e.locationLng === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["locationLat"], message: "A map point needs both latitude and longitude" });
    }
    for (const issue of timelineIssues(e)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.field], message: issue.message, params: { reason: issue.reason } });
    }
  });

export type EventFields = z.infer<typeof eventFields>;

export const DATE_FIELDS = ["eventDate", "departureDate", "expectedReturnDate"] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export interface TimelineIssue {
  field: DateField;
  reason: "return_before_departure" | "event_outside_rental" | "past" | "departure_too_early" | "return_too_late";
  message: string;
  // For the limits: the earliest departure or latest return allowed.
  limit?: string;
}

// Order of the dates (spec 6.4): stock leaves, the event happens, stock
// comes back. Dates are YYYY-MM-DD strings, so text order is date order.
export function timelineIssues(e: { eventDate: string | null; departureDate: string | null; expectedReturnDate: string | null }): TimelineIssue[] {
  const out: TimelineIssue[] = [];
  const { eventDate, departureDate: dep, expectedReturnDate: ret } = e;
  if (dep && ret && dep > ret) {
    out.push({ field: "expectedReturnDate", reason: "return_before_departure", message: "Expected return cannot be before departure" });
  }
  if (eventDate && dep && eventDate < dep) {
    out.push({ field: "eventDate", reason: "event_outside_rental", message: "The event can't be before the warehouse departure" });
  } else if (eventDate && ret && eventDate > ret) {
    out.push({ field: "eventDate", reason: "event_outside_rental", message: "The event can't be after the expected return" });
  }
  return out;
}

// DEC-019/DEC-020: an Event can't be over before it is recorded. The
// rental may already have started (departure in the past is fine), but
// the event date and the expected return must be today or later. "Today"
// is the calendar day in the Event's own timezone. Only dates being
// entered or changed are checked (pass `changed`), so an Event keeps
// working after its dates pass.
export const MUST_NOT_BE_PAST: readonly DateField[] = ["eventDate", "expectedReturnDate"];

export function pastDateIssues(
  e: { eventDate: string | null; departureDate: string | null; expectedReturnDate: string | null },
  today: string,
  changed: readonly DateField[] = DATE_FIELDS
): TimelineIssue[] {
  return changed
    .filter((f) => MUST_NOT_BE_PAST.includes(f))
    .filter((f) => {
      const v = e[f];
      return v !== null && v < today;
    })
    .map((field) => ({ field, reason: "past" as const, message: "This date is in the past" }));
}

// DEC-028: logistics limits, per organization (an administrator can change
// them). The warehouse departure can be at most `departureMaxDays` before
// the event date; the expected return at most `returnMaxBusinessDays`
// business days (Monday to Friday) after it. When equipment is still out
// `returnWarningDays` days after the event, the Event shows a warning;
// past the expected return it is overdue and must be returned or picked up.
export interface DateRules {
  departureMaxDays: number;
  returnMaxBusinessDays: number;
  returnWarningDays: number;
}
export const DEFAULT_DATE_RULES: DateRules = { departureMaxDays: 15, returnMaxBusinessDays: 7, returnWarningDays: 3 };

export const dateRulesFields = z.object({
  departureMaxDays: z.number().int().min(0).max(365),
  returnMaxBusinessDays: z.number().int().min(0).max(260),
  returnWarningDays: z.number().int().min(0).max(60),
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

// N business days after a date (Saturdays and Sundays don't count).
export function addBusinessDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return ymd(d);
}

// Checked only when the dates involved are entered or changed, like the
// past-date rule, so older Events keep working.
export function limitIssues(
  e: { eventDate: string | null; departureDate: string | null; expectedReturnDate: string | null },
  rules: DateRules,
  changed: readonly DateField[] = DATE_FIELDS
): TimelineIssue[] {
  const out: TimelineIssue[] = [];
  const { eventDate, departureDate: dep, expectedReturnDate: ret } = e;
  if (!eventDate) return out;
  if (dep && (changed.includes("departureDate") || changed.includes("eventDate"))) {
    const earliest = addDays(eventDate, -rules.departureMaxDays);
    if (dep < earliest) {
      out.push({ field: "departureDate", reason: "departure_too_early", message: `Departure can be at most ${rules.departureMaxDays} days before the event`, limit: earliest });
    }
  }
  if (ret && (changed.includes("expectedReturnDate") || changed.includes("eventDate"))) {
    const latest = addBusinessDays(eventDate, rules.returnMaxBusinessDays);
    if (ret > latest) {
      out.push({ field: "expectedReturnDate", reason: "return_too_late", message: `Expected return can be at most ${rules.returnMaxBusinessDays} business days after the event`, limit: latest });
    }
  }
  return out;
}

// Equipment still out after the event (DEC-028): a warning a few days after
// the event, overdue once the expected return has passed.
export type ReturnAlert = "ended_out" | "overdue" | null;
export function returnAlert(
  e: { eventDate: string | null; expectedReturnDate: string | null; fulfillmentState: FulfillmentState },
  equipmentOut: boolean,
  today: string,
  rules: DateRules
): ReturnAlert {
  if (!equipmentOut || e.fulfillmentState === "closed" || e.fulfillmentState === "cancelled") return null;
  if (e.expectedReturnDate && today > e.expectedReturnDate) return "overdue";
  if (e.eventDate && today > addDays(e.eventDate, rules.returnWarningDays)) return "ended_out";
  return null;
}

// Today's calendar date (YYYY-MM-DD) in a timezone.
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Metadata edits are allowed while the Event is still being planned.
export const EDITABLE_STATES: readonly FulfillmentState[] = ["draft", "confirmed"];
// The workbook's CANCELAR EVENTO: only before anything left the warehouse.
export const CANCELLABLE_STATES: readonly FulfillmentState[] = ["draft", "confirmed"];

// What the Event asks for (workbook "Detalle Alquiler"). Quantities are
// text decimals, like every quantity in STRUCTURA.
export const eventLinesFields = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z
          .string()
          .trim()
          .regex(/^\d+(\.\d{1,6})?$/, "Enter a positive number")
          .refine((s) => /[1-9]/.test(s), "Quantity must be greater than zero"),
        notes: z
          .string()
          .max(1000)
          .transform((s) => s.trim() || null)
          .nullable()
          .optional()
          .transform((s) => s ?? null),
      })
    )
    .max(500)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((l, i) => {
        if (seen.has(l.itemId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "itemId"], message: "Item listed twice" });
        seen.add(l.itemId);
      });
    }),
});
export type EventLinesFields = z.infer<typeof eventLinesFields>;

export const eventActionFields = z.object({
  note: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional()
    .transform((s) => s ?? null),
});
export type EventActionFields = z.infer<typeof eventActionFields>;
