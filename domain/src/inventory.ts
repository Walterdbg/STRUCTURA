import { z } from "zod";

// ---------------------------------------------------------------- vocabulary
// From the 27TS workbook (Listas sheet) and spec 6.4.
export const PRODUCT_TYPES = ["rentable", "consumable", "spare_part"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const LOCATION_KINDS = ["warehouse", "event", "repair", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

// Units in the workbook, with the decimals each normally allows. Any other
// unit can be typed; its decimals are then chosen explicitly on the item.
export const UNIT_SUGGESTIONS: readonly { unit: string; decimals: number }[] = [
  { unit: "Unidad", decimals: 0 },
  { unit: "Kit", decimals: 0 },
  { unit: "Caja", decimals: 0 },
  { unit: "Galón", decimals: 3 },
  { unit: "Metro", decimals: 2 },
];

// Movement reasons. Mapping to the workbook's "Tipos de movimiento":
//   Ingreso inventario -> receipt          Ajuste -> adjustment_in / adjustment_out
//   A reparación       -> to_repair        Retorno reparación -> repair_return
//   Consumido en evento / Consumo interno -> consumption
//   Baja / Baja desde reparación -> write_off
//   (location update, UC-03) -> transfer   Cantidad inicial -> opening_balance
// Salida alquiler / Retorno alquiler become Event dispatch/return commands
// in Phase 3; until then a plain transfer can move stock to an event location.
export const MOVEMENT_REASONS = [
  "opening_balance",
  "receipt",
  "adjustment_in",
  "transfer",
  "to_repair",
  "repair_return",
  "consumption",
  "write_off",
  "adjustment_out",
  "correction",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export const INBOUND_REASONS: readonly MovementReason[] = ["opening_balance", "receipt", "adjustment_in"];
export const OUTBOUND_REASONS: readonly MovementReason[] = ["consumption", "write_off", "adjustment_out"];
export const INTERNAL_REASONS: readonly MovementReason[] = ["transfer", "to_repair", "repair_return"];
// These change what the organization owns, so they need a written reason.
export const NOTE_REQUIRED: readonly MovementReason[] = ["adjustment_in", "adjustment_out", "write_off", "correction"];

// Reasons a person can choose on screen (the others are system-made).
export const MANUAL_REASONS = MOVEMENT_REASONS.filter(
  (r) => r !== "opening_balance" && r !== "correction"
) as readonly MovementReason[];

// ---------------------------------------------------------------- helpers
const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional()
    .transform((s) => s ?? null);

// A positive decimal written as text ("12", "2.5"). Never a JS number.
export const quantityText = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Enter a positive number, e.g. 12 or 2.5")
  .refine((s) => Number(s) > 0 || /[1-9]/.test(s), "Quantity must be greater than zero");

export function decimalPlaces(q: string): number {
  const i = q.indexOf(".");
  return i === -1 ? 0 : q.length - i - 1;
}

// ---------------------------------------------------------------- locations
export const locationFields = z.object({
  designation: z.string().trim().min(1).max(200),
  kind: z.enum(LOCATION_KINDS),
  notes: text(2000),
  active: z.boolean().default(true),
});
export type LocationFields = z.infer<typeof locationFields>;

// ---------------------------------------------------------------- catalog
const barcode = z
  .string()
  .trim()
  .max(64)
  .regex(/^[0-9A-Za-z.\-_/]*$/, "Barcode may contain letters, digits and . - _ / only")
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional()
  .transform((s) => s ?? null);

export const itemFields = z
  .object({
    name: z.string().trim().min(1).max(300),
    internalReference: text(100),
    barcode,
    responsible: text(200),
    categoryPath: text(300),
    productType: z.enum(PRODUCT_TYPES),
    unit: z.string().trim().min(1).max(40),
    quantityDecimals: z.number().int().min(0).max(6),
    salesPrice: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, "Enter a price such as 125 or 125.50")
      .nullable()
      .optional()
      .transform((s) => (s ? s : null)),
    priceCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD")
      .nullable()
      .optional()
      .transform((s) => s ?? null),
    brand: text(100),
    model: text(100),
    baseLocationId: z.string().uuid().nullable().optional().transform((s) => s ?? null),
    notes: text(4000),
    active: z.boolean().default(true),
  })
  .superRefine((f, ctx) => {
    if ((f.salesPrice === null) !== (f.priceCurrency === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [f.salesPrice === null ? "salesPrice" : "priceCurrency"],
        message: "A price needs a currency, and a currency needs a price",
      });
    }
  });
export type ItemFields = z.infer<typeof itemFields>;

// Creating an item can also record what is already on hand (the workbook's
// "Cantidad inicial"), as an opening-balance movement, never as a total.
export const newItemFields = z.object({
  item: itemFields,
  initialQuantity: quantityText.nullable().optional().transform((s) => s ?? null),
  initialLocationId: z.string().uuid().nullable().optional().transform((s) => s ?? null),
});
export type NewItemFields = z.infer<typeof newItemFields>;

// ---------------------------------------------------------------- movements
export const movementFields = z
  .object({
    reason: z.enum(MOVEMENT_REASONS).refine((r) => r !== "correction" && r !== "opening_balance", {
      message: "Corrections and opening balances have their own commands",
    }),
    sourceLocationId: z.string().uuid().nullable().optional().transform((s) => s ?? null),
    destinationLocationId: z.string().uuid().nullable().optional().transform((s) => s ?? null),
    eventId: z.string().uuid().nullable().optional().transform((s) => s ?? null),
    note: text(2000),
    lines: z
      .array(z.object({ itemId: z.string().uuid(), quantity: quantityText }))
      .min(1, "Add at least one item")
      .max(200),
  })
  .superRefine((m, ctx) => {
    const needSource = !INBOUND_REASONS.includes(m.reason);
    const needDest = !OUTBOUND_REASONS.includes(m.reason);
    if (needSource && !m.sourceLocationId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceLocationId"], message: "Choose where the stock is now" });
    if (!needSource && m.sourceLocationId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceLocationId"], message: "Incoming stock has no source" });
    if (needDest && !m.destinationLocationId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationLocationId"], message: "Choose where the stock goes" });
    if (!needDest && m.destinationLocationId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationLocationId"], message: "Stock leaving inventory has no destination" });
    if (m.sourceLocationId && m.sourceLocationId === m.destinationLocationId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destinationLocationId"], message: "Source and destination must differ" });
    if (NOTE_REQUIRED.includes(m.reason) && !m.note)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Explain the reason for this movement" });
    const seen = new Set<string>();
    m.lines.forEach((l, i) => {
      if (seen.has(l.itemId))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", i, "itemId"], message: "Item listed twice" });
      seen.add(l.itemId);
    });
  });
export type MovementFields = z.infer<typeof movementFields>;

export const correctionFields = z.object({
  movementId: z.string().uuid(),
  note: z.string().trim().min(1, "Explain what was wrong").max(2000),
});
export type CorrectionFields = z.infer<typeof correctionFields>;
