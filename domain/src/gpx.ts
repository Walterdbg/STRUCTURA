import { z } from "zod";
import { featurePropsSchema, geometrySchema } from "./maps.js";

// GPX files (DEC-023, DEC-033). Routes in the Maps repository are always
// saved as GPX; the same writer serves downloads from the Event map.
export function toGpx(name: string, coordinates: readonly (readonly number[])[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pts = coordinates
    .map((c) => `      <trkpt lat="${c[1]}" lon="${c[0]}">${c.length > 2 ? `<ele>${c[2]}</ele>` : ""}</trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="STRUCTURA" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

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
