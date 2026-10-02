// GPX import/export for courses and routes (DEC-023, DEC-033). Reads tracks
// or routes from Strava, Garmin, plotaroute, RunningAhead, Racemap,
// RaceResult; keeps point order, the file's own elevations (<ele>) and its
// waypoints (start, finish, mile markers, water stations...). Nothing is
// sent anywhere.
import type { Waypoint } from "@structura/domain";

export interface ParsedGpx {
  name: string | null;
  coordinates: number[][];
  waypoints: Waypoint[];
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

// Some programs (Racemap) add their own fields, e.g. <rmx:length>, without
// declaring them as XML requires; other sites ignore that. Declare any such
// prefix so the file can be read (Walter's files, 2026-10-01).
function declarePrefixes(text: string): string {
  const used = new Set([...text.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)].map((m) => m[1]!));
  const declared = new Set([...text.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=/g)].map((m) => m[1]!));
  const missing = [...used].filter((p) => p !== "xml" && p !== "xmlns" && !declared.has(p));
  if (!missing.length) return text;
  return text.replace(/<gpx\b/, `<gpx ${missing.map((p) => `xmlns:${p}="urn:structura:undeclared:${p}"`).join(" ")}`);
}

const point = (lat: string | null, lon: string | null, ele: string | null | undefined): number[] | null => {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || lat === null || lon === null) return null;
  const e = ele !== undefined && ele !== null && ele.trim() !== "" ? Number(ele) : NaN;
  return Number.isFinite(e) ? [round(lo), round(la), Math.round(e * 10) / 10] : [round(lo), round(la)];
};

// A point's label. plotaroute cuts <name> to 10 letters ("WATER STAT",
// "BIB PICK U") and keeps the full text in <cmt>/<desc> ("WATER STATION",
// "BIB PICK UP"), so the full text is used when it is the same label.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function pointLabel(name: string | null, cmt: string | null, desc: string | null): string | null {
  for (const full of [cmt, desc]) {
    if (name && full && full.length > name.length && squash(full).startsWith(squash(name))) return full;
  }
  return name ?? desc ?? cmt;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// The text of an element's own child (not of a prefixed extra like rmx:name).
const childText = (el: Element, tag: string) => {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c.textContent?.trim() || null;
  return null;
};

function fromDocument(doc: Document): ParsedGpx {
  const pts = [...Array.from(doc.getElementsByTagName("trkpt")), ...Array.from(doc.getElementsByTagName("rtept"))];
  const coordinates = pts.map((p) => point(p.getAttribute("lat"), p.getAttribute("lon"), childText(p, "ele"))).filter((c): c is number[] => c !== null);
  const waypoints: Waypoint[] = [];
  for (const w of Array.from(doc.getElementsByTagName("wpt"))) {
    // Only the points the course's map shows: Racemap marks its internal
    // timing points as hidden (Walter: "POI = those visible via Racemap").
    if (childText(w, "rmx:hidden") === "true") continue;
    const c = point(w.getAttribute("lat"), w.getAttribute("lon"), childText(w, "ele"));
    const name = pointLabel(childText(w, "name"), childText(w, "cmt"), childText(w, "desc"));
    const symbol = childText(w, "sym") ?? childText(w, "rmx:icon") ?? childText(w, "rmx:racemaptype");
    if (c && name) waypoints.push({ name: name.slice(0, 200), coordinates: c, symbol: symbol?.slice(0, 100) ?? null });
  }
  // The track's own name (waypoint names come first in some files).
  const trk = doc.getElementsByTagName("trk")[0] ?? doc.getElementsByTagName("rte")[0];
  const meta = doc.getElementsByTagName("metadata")[0];
  const name = (trk && childText(trk, "name")) || (meta && childText(meta, "name")) || null;
  return { name, coordinates, waypoints };
}

// Last resort for files an XML reader refuses: read the points directly.
function fromText(text: string): ParsedGpx {
  const attr = (tag: string, a: string) => tag.match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']+)["']`))?.[1] ?? null;
  const coordinates: number[][] = [];
  for (const m of text.matchAll(/<(?:\w+:)?(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?\1>)/g)) {
    const c = point(attr(m[2]!, "lat"), attr(m[2]!, "lon"), m[3]?.match(/<ele>([^<]*)<\/ele>/)?.[1]);
    if (c) coordinates.push(c);
  }
  const waypoints: Waypoint[] = [];
  for (const m of text.matchAll(/<(?:\w+:)?wpt\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?wpt>/g)) {
    if (/<rmx:hidden>\s*true\s*</.test(m[2]!)) continue;
    const c = point(attr(m[1]!, "lat"), attr(m[1]!, "lon"), m[2]!.match(/<ele>([^<]*)<\/ele>/)?.[1]);
    const tag = (n: string) => {
      const v = m[2]!.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1]?.trim();
      return v ? decode(v) : null;
    };
    const name = pointLabel(tag("name"), tag("cmt"), tag("desc"));
    if (c && name) waypoints.push({ name: name.slice(0, 200), coordinates: c, symbol: m[2]!.match(/<sym>([^<]*)<\/sym>/)?.[1] ?? null });
  }
  const trk = text.match(/<trk\b[\s\S]*?<name>([^<]*)<\/name>/);
  return { name: trk?.[1] ? decode(trk[1].trim()) || null : null, coordinates, waypoints };
}

export function parseGpx(text: string): ParsedGpx {
  let parsed: ParsedGpx;
  const doc = new DOMParser().parseFromString(declarePrefixes(text), "application/xml");
  parsed = doc.getElementsByTagName("parsererror").length ? fromText(text) : fromDocument(doc);
  if (parsed.coordinates.length < 2) throw new Error("the GPX file has no track");
  // Elevation only if every point has it (a profile with gaps would mislead).
  const allEle = parsed.coordinates.every((c) => c.length === 3);
  if (!allEle) parsed = { ...parsed, coordinates: parsed.coordinates.map((c) => [c[0]!, c[1]!]) };
  return parsed;
}

// The writer is shared with the server (Maps repository, DEC-033).
export { toGpx } from "@structura/domain";

// What kind of Event point a waypoint is, from its name or symbol.
export function guessPointCategory(w: { name: string; symbol?: string | null }): string {
  const s = `${w.name} ${w.symbol ?? ""}`.toLowerCase();
  if (/water|agua|aid station|hydrat|gatorade/.test(s)) return "water";
  if (/toilet|porta|potty|potties|portpot|restroom|baño|bano|wc/.test(s)) return "toilets";
  if (/first aid|medic|medical|ems|ambulan|primeros auxilios/.test(s)) return "first_aid";
  if (/parking|estacionamiento/.test(s)) return "parking";
  if (/stage|tarima|escenario/.test(s)) return "stage";
  if (/entrance|entrada|gate/.test(s)) return "entrance";
  if (/bar\b|beer|cerveza|bebidas/.test(s)) return "bar_storage";
  return "other";
}
