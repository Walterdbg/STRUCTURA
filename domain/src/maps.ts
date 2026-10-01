import { z } from "zod";

// Event maps (UC-05, DEC-022) and running courses (DEC-023).

export const POINT_CATEGORIES = ["stage", "water", "toilets", "bar_storage", "first_aid", "entrance", "parking", "other"] as const;
export const ROUTE_CATEGORIES = ["delivery", "course", "other"] as const;
export type PointCategory = (typeof POINT_CATEGORIES)[number];
export type RouteCategory = (typeof ROUTE_CATEGORIES)[number];

// Paid add-ons an organization can have (DEC-023).
export const FEATURES = ["courses"] as const;
export type Feature = (typeof FEATURES)[number];

const MAX_VERTICES = 20_000;

// [longitude, latitude] or [longitude, latitude, elevation] (GeoJSON order).
const position = z
  .array(z.number().finite())
  .min(2)
  .max(3)
  .refine((p) => p[0]! >= -180 && p[0]! <= 180 && p[1]! >= -90 && p[1]! <= 90, "Coordinates out of range");

export const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2, "A route needs at least 2 points").max(MAX_VERTICES) }),
  z.object({
    type: z.literal("Polygon"),
    coordinates: z
      .array(z.array(position).min(4, "An area needs at least 3 corners").max(MAX_VERTICES))
      .min(1)
      .max(1, "Areas with holes are not supported")
      .refine((rings) => {
        const r = rings[0]!;
        const a = r[0]!;
        const b = r[r.length - 1]!;
        return a[0] === b[0] && a[1] === b[1];
      }, "An area's outline must be closed"),
  }),
]);
export type Geometry = z.infer<typeof geometrySchema>;

const KIND_GEOMETRY = { point: "Point", area: "Polygon", route: "LineString" } as const;

// Extra settings (DEC-027). Routes: laps and out-and-back (courses only),
// and whether the line follows the streets. Points: placed at a distance
// along a course (e.g. water at km 5).
export const featurePropsSchema = z
  .object({
    laps: z.number().int().min(1).max(50).optional(),
    outAndBack: z.boolean().optional(),
    snapped: z.boolean().optional(),
    courseId: z.string().uuid().optional(),
    distanceM: z.number().min(0).max(1_000_000).optional(),
  })
  .strict()
  .default({});
export type FeatureProps = z.infer<typeof featurePropsSchema>;

export const mapFeatureFields = z
  .object({
    kind: z.enum(["point", "area", "route"]),
    category: z.string(),
    label: z.string().trim().min(1, "A label is required").max(200),
    notes: z
      .string()
      .max(2000)
      .transform((s) => s.trim() || null)
      .nullable()
      .optional()
      .transform((s) => s ?? null),
    geometry: geometrySchema,
    preferred: z.boolean().default(false),
    source: z.string().max(300).nullable().optional().transform((s) => s ?? null),
    props: featurePropsSchema,
  })
  .superRefine((f, ctx) => {
    const p = f.props;
    const isCourse = f.kind === "route" && f.category === "course";
    if ((p.laps !== undefined || p.outAndBack !== undefined) && !isCourse) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Laps and out-and-back apply to courses only" });
    }
    if (p.snapped !== undefined && f.kind !== "route") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Only routes follow streets" });
    }
    if ((p.courseId === undefined) !== (p.distanceM === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "A course position needs both the course and the distance" });
    }
    if (p.courseId !== undefined && f.kind !== "point") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Only points can be placed on a course" });
    }
    if (f.geometry.type !== KIND_GEOMETRY[f.kind]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["geometry"], message: `A ${f.kind} needs ${KIND_GEOMETRY[f.kind]} geometry` });
    }
    const allowed: readonly string[] = f.kind === "route" ? ROUTE_CATEGORIES : POINT_CATEGORIES;
    if (!allowed.includes(f.category)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "Unknown type" });
    }
    if (f.preferred && f.kind !== "route") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["preferred"], message: "Only a route can be preferred" });
    }
  });
export type MapFeatureFields = z.infer<typeof mapFeatureFields>;

// ---------------------------------------------------------------- geometry helpers
const R = 6_371_008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance between two [lng, lat] positions, in metres.
export function haversine(a: readonly number[], b: readonly number[]): number {
  const dLat = rad(b[1]! - a[1]!);
  const dLng = rad(b[0]! - a[0]!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1]!)) * Math.cos(rad(b[1]!)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: readonly (readonly number[])[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1]!, coords[i]!);
  return total;
}

// Positions every `step` metres along a line (km markers on a course).
export function markersAlong(coords: readonly (readonly number[])[], step = 1000): { distance: number; position: [number, number] }[] {
  const out: { distance: number; position: [number, number] }[] = [];
  let walked = 0;
  let next = step;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = haversine(a, b);
    while (seg > 0 && walked + seg >= next) {
      const f = (next - walked) / seg;
      out.push({ distance: next, position: [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f] });
      next += step;
    }
    walked += seg;
  }
  return out;
}

// The [lng, lat] position `distance` metres along a line (clamped to its ends).
export function positionAt(coords: readonly (readonly number[])[], distance: number): [number, number] {
  if (coords.length === 0) throw new Error("empty line");
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = haversine(a, b);
    if (seg > 0 && walked + seg >= distance) {
      const f = Math.max(0, (distance - walked) / seg);
      return [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f];
    }
    walked += seg;
  }
  const last = coords[coords.length - 1]!;
  return [last[0]!, last[1]!];
}

// Where a point lies along a line: the distance from the start of the
// nearest spot on the line, and how far the point is from it (metres).
// Local flat approximation per segment; fine at event scale.
export function projectOnLine(coords: readonly (readonly number[])[], p: readonly number[]): { distance: number; offset: number } {
  let best = { distance: 0, offset: Infinity };
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const kx = Math.cos(rad((a[1]! + b[1]!) / 2)) * 111_320;
    const ky = 110_540;
    const ax = a[0]! * kx, ay = a[1]! * ky, bx = b[0]! * kx, by = b[1]! * ky, px = p[0]! * kx, py = p[1]! * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const tt = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const cx = ax + tt * dx, cy = ay + tt * dy;
    const offset = Math.hypot(px - cx, py - cy);
    const seg = haversine(a, b);
    if (offset < best.offset) best = { distance: walked + tt * seg, offset };
    walked += seg;
  }
  return best;
}

// A course's full distance: one pass (doubled when out-and-back) times laps.
export function courseTotal(lengthM: number, props: { laps?: number; outAndBack?: boolean }): number {
  return lengthM * (props.outAndBack ? 2 : 1) * (props.laps ?? 1);
}

// Elevation profile and total climb, when the line carries heights
// (a GPX track with <ele>). No outside elevation service is used.
export function elevationProfile(coords: readonly (readonly number[])[]): { points: { distance: number; elevation: number }[]; gain: number; loss: number } | null {
  if (coords.length < 2 || coords.some((c) => c.length < 3)) return null;
  const points: { distance: number; elevation: number }[] = [];
  let d = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      d += haversine(coords[i - 1]!, coords[i]!);
      const diff = coords[i]![2]! - coords[i - 1]![2]!;
      if (diff > 0) gain += diff;
      else loss -= diff;
    }
    points.push({ distance: d, elevation: coords[i]![2]! });
  }
  return { points, gain, loss };
}
