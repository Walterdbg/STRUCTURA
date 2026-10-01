import { useState } from "react";

// Distances in kilometres or miles (DEC-032 item 1), and how often the
// distance markers appear (item 2). Both are the viewer's own preference,
// remembered in this browser only.

export type Unit = "km" | "mi";
export const METERS: Record<Unit, number> = { km: 1000, mi: 1609.344 };
export const MARKER_STEPS = [0.5, 1, 5] as const;

function load<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw) as unknown;
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePref<T>(key: string, fallback: T, ok: (v: unknown) => boolean): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback, ok));
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private window: keep it for this visit only */
    }
  };
  return [value, set];
}

export const useUnit = () => usePref<Unit>("structura.unit", "km", (v) => v === "km" || v === "mi");
export const useMarkerStep = () => usePref<number>("structura.markerStep", 1, (v) => (MARKER_STEPS as readonly unknown[]).includes(v));
export const useShowMarkers = () => usePref<boolean>("structura.showMarkers", true, (v) => typeof v === "boolean");

const nf = (locale: string, digits: number) =>
  new Intl.NumberFormat(locale === "es" ? "es-PA" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

// "8.36 km", "640 m", "5.20 mi".
export function fmtDist(meters: number, unit: Unit, locale: string): string {
  if (unit === "km" && meters < 1000) return `${Math.round(meters)} m`;
  return `${nf(locale, 2).format(meters / METERS[unit])} ${unit}`;
}

// The number written on a distance marker: "1", "2.5", "10".
export function markerLabel(meters: number, unit: Unit): string {
  const v = Math.round((meters / METERS[unit]) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
