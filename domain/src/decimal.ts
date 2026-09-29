import { Decimal } from "decimal.js";
import { DomainError } from "./errors.js";

// Money and quantities are exact decimals, never JavaScript numbers
// (spec 8.3, AT-16). Values enter as strings - the same text PostgreSQL
// NUMERIC returns - so nothing passes through binary floating point.
const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

export function dec(value: string | Dec): Dec {
  if (typeof value === "string") {
    const text = value.trim();
    if (!DECIMAL_TEXT.test(text)) {
      throw new DomainError("validation", `Not a decimal number: "${value}"`, { value });
    }
    return new Dec(text);
  }
  if (Decimal.isDecimal(value)) return new Dec(value);
  // A plain JS number reaching here is a bug: it may already be inexact.
  throw new DomainError("validation", "Decimal values must be passed as text, not as a JS number");
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(v), new Dec(0));
}

// The rounding policy must be explicit and versioned (spec 8.3), so there is
// deliberately no default mode: every caller names the one its policy uses.
export type RoundingMode = "half_up" | "half_even";

const MODES: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
};

export function roundTo(value: Dec, places: number, mode: RoundingMode): Dec {
  if (!Number.isInteger(places) || places < 0) {
    throw new DomainError("validation", `Invalid number of decimal places: ${places}`);
  }
  return value.toDecimalPlaces(places, MODES[mode]);
}

// Fixed text form for storage, printing and CSV, identical on every engine.
export function toText(value: Dec, places: number, mode: RoundingMode): string {
  return roundTo(value, places, mode).toFixed(places);
}
