import L from "leaflet";
import { haversine, lineLength } from "@structura/domain";

// Direction arrows along a course (Walter, 2026-10-01: "those are races,
// they include directions; be sure we can read the directions"). The point
// order of the line is the running direction; small arrows along it show
// which way the runners go, about 40 along a course, at least every 250 m.
export function addDirectionArrows(layer: L.LayerGroup, coords: number[][], color: string): void {
  if (coords.length < 2) return;
  const total = lineLength(coords);
  const step = Math.max(250, total / 40);
  let next = step / 2;
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = haversine(a, b);
    while (seg > 0 && walked + seg >= next) {
      const f = (next - walked) / seg;
      const lng = a[0]! + (b[0]! - a[0]!) * f;
      const lat = a[1]! + (b[1]! - a[1]!) * f;
      // Compass bearing of this piece (0 = north, clockwise).
      const y = Math.sin(((b[0]! - a[0]!) * Math.PI) / 180) * Math.cos((b[1]! * Math.PI) / 180);
      const x =
        Math.cos((a[1]! * Math.PI) / 180) * Math.sin((b[1]! * Math.PI) / 180) -
        Math.sin((a[1]! * Math.PI) / 180) * Math.cos((b[1]! * Math.PI) / 180) * Math.cos(((b[0]! - a[0]!) * Math.PI) / 180);
      const bearing = (Math.atan2(y, x) * 180) / Math.PI;
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "dir-arrow",
          html: `<span style="transform: rotate(${bearing}deg); border-bottom-color: ${color}"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
      next += step;
    }
    walked += seg;
  }
}
