// GPX import/export for running courses (DEC-023). Reads tracks or
// routes from Strava, Garmin, plotaroute; keeps point order and the
// file's own elevations (<ele>). Nothing is sent anywhere.

export function parseGpx(text: string): { name: string | null; coordinates: number[][] } {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not a valid GPX file");
  const pts = [...Array.from(doc.getElementsByTagName("trkpt")), ...Array.from(doc.getElementsByTagName("rtept"))];
  const coordinates = pts
    .map((p) => {
      const lat = Number(p.getAttribute("lat"));
      const lon = Number(p.getAttribute("lon"));
      const eleText = p.getElementsByTagName("ele")[0]?.textContent;
      const ele = eleText !== undefined && eleText !== null && eleText.trim() !== "" ? Number(eleText) : NaN;
      return Number.isFinite(ele) ? [round(lon), round(lat), Math.round(ele * 10) / 10] : [round(lon), round(lat)];
    })
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (coordinates.length < 2) throw new Error("the GPX file has no track");
  // Elevation only if every point has it (a profile with gaps would mislead).
  const allEle = coordinates.every((c) => c.length === 3);
  const name = doc.getElementsByTagName("name")[0]?.textContent?.trim() || null;
  return { name, coordinates: allEle ? coordinates : coordinates.map((c) => [c[0]!, c[1]!]) };
}

export function toGpx(name: string, coordinates: number[][]): string {
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

const round = (v: number) => Math.round(v * 1e6) / 1e6;
