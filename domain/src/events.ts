import { z } from "zod";

// Event (spec 6.2, 6.4, UC-13). An Event can start internally with a
// provisional designation and no customer (EVT-01, AT-01). Event date,
// departure date, expected return and actual closure stay separate fields.
export const FULFILLMENT_STATES = ["draft", "confirmed", "delivered", "partial_return", "closed", "cancelled"] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export const DESIGNATION_STATUSES = ["provisional", "final"] as const;

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
    responsibleUserId: z.string().uuid(),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    location: optionalText,
    eventDate: localDate.nullable().optional().transform((s) => s ?? null),
    departureDate: localDate.nullable().optional().transform((s) => s ?? null),
    expectedReturnDate: localDate.nullable().optional().transform((s) => s ?? null),
    notes: optionalText,
  })
  .superRefine((e, ctx) => {
    if (e.departureDate && e.expectedReturnDate && e.departureDate > e.expectedReturnDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedReturnDate"],
        message: "Expected return cannot be before departure",
      });
    }
  });

export type EventFields = z.infer<typeof eventFields>;

// Metadata edits are allowed while the Event is still being planned.
export const EDITABLE_STATES: readonly FulfillmentState[] = ["draft", "confirmed"];
