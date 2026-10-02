import { z } from "zod";
import { featurePropsSchema, geometrySchema } from "./maps.js";

// GPX waypoints (Walter's course files, 2026-10-01): the course's marked
// points - start, finish, mile markers, water stations, staff positions,
// turns. Kept with the route and written back into its GPX.
export const waypointSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // [longitude, latitude] or [longitude, latitude, elevation]
  coordinates: z
    .array(z.number().finite())
    .min(2)
    .max(3)
    .refine((p) => p[0]! >= -180 && p[0]! <= 180 && p[1]! >= -90 && p[1]! <= 90, "Coordinates out of range"),
  symbol: z.string().max(100).nullable().optional().transform((s) => s ?? null),
});
export type Waypoint = z.infer<typeof waypointSchema>;

// GPX files (DEC-023, DEC-033). Routes in the Maps repository are always
// saved as GPX; the same writer serves downloads from the Event map.
export function toGpx(name: string, coordinates: readonly (readonly number[])[], waypoints: readonly Waypoint[] = []): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const wpts = waypoints
    .map((w) => `  <wpt lat="${w.coordinates[1]}" lon="${w.coordinates[0]}">${w.coordinates.length > 2 ? `<ele>${w.coordinates[2]}</ele>` : ""}<name>${esc(w.name)}</name>${w.symbol ? `<sym>${esc(w.symbol)}</sym>` : ""}</wpt>`)
    .join("\n");
  const pts = coordinates
    .map((c) => `      <trkpt lat="${c[1]}" lon="${c[0]}">${c.length > 2 ? `<ele>${c[2]}</ele>` : ""}</trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="STRUCTURA" xmlns="http://www.topografix.com/GPX/1/1">
${wpts ? `${wpts}\n` : ""}  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// General location of a repository route, for grouping (Walter, 2026-10-01).
const locText = z
  .string()
  .max(120)
  .transform((s) => s.trim() || null)
  .nullable()
  .optional()
  .transform((s) => s ?? null);
export const routeLocationFields = z.object({ country: locText, area: locText, place: locText });
export type RouteLocation = z.infer<typeof routeLocationFields>;

// A route in the Maps repository (DEC-033).
export const REPOSITORY_CATEGORIES = ["course", "delivery", "pickup", "other"] as const;

export const repositoryRouteFields = z
  .object({
    name: z.string().trim().min(1, "A name is required").max(200),
    category: z.enum(REPOSITORY_CATEGORIES),
    notes: z
      .string()
      .max(2000)
      .transform((s) => s.trim() || null)
      .nullable()
      .optional()
      .transform((s) => s ?? null),
    geometry: geometrySchema,
    props: featurePropsSchema,
    source: z.string().max(300).nullable().optional().transform((s) => s ?? null),
    waypoints: z.array(waypointSchema).max(1000).default([]),
    country: locText,
    area: locText,
    place: locText,
  })
  .superRefine((r, ctx) => {
    if (r.geometry.type !== "LineString") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["geometry"], message: "A route needs a line" });
    }
    if ((r.props.laps !== undefined || r.props.outAndBack !== undefined || r.props.locked !== undefined) && r.category !== "course") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Laps, out-and-back and lock apply to courses only" });
    }
    if (r.props.courseId !== undefined || r.props.distanceM !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Only Event points can be placed on a course" });
    }
  });
export type RepositoryRouteFields = z.infer<typeof repositoryRouteFields>;
