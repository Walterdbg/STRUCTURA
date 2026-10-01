import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError, haversine } from "@structura/domain";
import { requireAuth, requireCapability } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { tenantFeatures } from "./events/maps.js";
import { decodePolyline, encodePolyline } from "./polyline.js";

// Map services for Event locations and event maps. Browsers never call a
// provider directly: everything goes through this server, so the Google
// key stays here and only the typed words, map views and route points
// leave our environment (DEC-026).
//
//   With GOOGLE_MAPS_KEY: Google place search (Places API New), map
//   pictures for streets and satellite (Map Tiles API), street routing
//   (Routes API) and elevation (Elevation API).
//   Without it: OpenStreetMap pictures and, if GEOCODER=nominatim,
//   OpenStreetMap search (DEC-025); no routing or elevation.

export interface Place {
  name: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

const searchCache = new Map<string, { at: number; places: Place[] }>();
const CACHE_MS = 24 * 3600_000;
let lastNominatim = 0;

// ---------------------------------------------------------------- OpenStreetMap search
async function nominatim(q: string, locale: string, near: number[] | null): Promise<Place[]> {
  const wait = lastNominatim + 1100 - Date.now(); // usage policy: 1 request/second
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const viewbox = near ? `&viewbox=${near.join(",")}&bounded=0` : "";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${locale}${viewbox}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": "STRUCTURA/0.1 (event operations platform)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`search provider answered ${res.status}`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

// ---------------------------------------------------------------- Google
async function google<T>(url: string, key: string, init: { method?: string; body?: unknown; fieldMask?: string } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
      ...(init.fieldMask ? { "x-goog-fieldmask": init.fieldMask } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  return (await res.json()) as T;
}

async function googleAutocomplete(key: string, q: string, locale: string, near: number[] | null, session: string | null): Promise<Place[]> {
  const body: Record<string, unknown> = { input: q, languageCode: locale };
  if (session) body.sessionToken = session;
  if (near) {
    const [w, n, e, s] = near as [number, number, number, number];
    body.locationBias = { rectangle: { low: { latitude: s, longitude: w }, high: { latitude: n, longitude: e } } };
  }
  const r = await google<{ suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[] }>(
    "https://places.googleapis.com/v1/places:autocomplete",
    key,
    { body }
  );
  return (r.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId: string; text?: { text: string } } => Boolean(p))
    .map((p) => ({ name: p.text?.text ?? "", placeId: p.placeId }));
}

async function googlePlace(key: string, placeId: string, locale: string, session: string | null): Promise<Place> {
  const qs = new URLSearchParams({ languageCode: locale, ...(session ? { sessionToken: session } : {}) });
  const r = await google<{ displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${qs}`,
    key,
    { fieldMask: "id,displayName,formattedAddress,location" }
  );
  if (!r.location) throw new Error("place without a location");
  const name = [r.displayName?.text, r.formattedAddress].filter(Boolean).join(", ");
  return { name, lat: r.location.latitude, lng: r.location.longitude, placeId };
}

// Map Tiles API sessions, one per map type and language (valid ~2 weeks).
const tileSessions = new Map<string, { session: string; expiresAt: number }>();
async function tileSession(key: string, type: "roadmap" | "satellite", locale: string): Promise<string> {
  const k = `${type}|${locale}`;
  const s = tileSessions.get(k);
  if (s && s.expiresAt - Date.now() > 3600_000) return s.session;
  const r = await google<{ session: string; expiry: string }>(`https://tile.googleapis.com/v1/createSession?key=${key}`, key, {
    body: { mapType: type, language: locale === "es" ? "es-419" : "en-US", region: "PA" },
  });
  tileSessions.set(k, { session: r.session, expiresAt: Number(r.expiry) * 1000 });
  return r.session;
}

// ---------------------------------------------------------------- input rules
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number());
const routeBody = z.object({
  mode: z.enum(["drive", "walk", "bike"]),
  waypoints: z.array(position).min(2).max(25),
});
const elevationBody = z.object({ coordinates: z.array(position).min(2).max(5000) });

const parseNear = (raw: unknown): number[] | null => {
  const s = String(raw ?? "");
  return /^-?\d{1,3}(\.\d+)?(,-?\d{1,3}(\.\d+)?){3}$/.test(s) ? s.split(",").map(Number) : null;
};

const notConfigured = (what: string) => new DomainError("provider_failure", `${what} needs the Google maps key`, { reason: "not_configured" });
const unavailable = (what: string) => new DomainError("provider_failure", `${what} is not available right now`, { reason: "unavailable" });

export function geoRoutes(app: FastifyInstance, db: Db, config: Config): void {
  const key = config.googleMapsKey;

  app.get("/api/geo/status", async (req) => {
    requireAuth(req);
    const provider = key ? "google" : config.geocoder;
    return {
      provider,
      search: provider !== "none",
      tiles: key ? "google" : "osm",
      satellite: Boolean(key),
      routing: Boolean(key),
      elevation: Boolean(key),
    };
  });

  // Place search: one box, suggestions while typing; nearest to the map first.
  app.get("/api/geo/search", async (req) => {
    requireAuth(req);
    const qs = req.query as Record<string, string | undefined>;
    const q = String(qs.q ?? "").trim().slice(0, 200);
    const locale = qs.lang === "en" ? "en" : "es";
    const session = qs.session && /^[\w-]{8,64}$/.test(qs.session) ? qs.session : null;
    const near = parseNear(qs.near);
    if (q.length < 3) return { items: [] };
    if (!key && config.geocoder === "none") throw new DomainError("provider_failure", "Place search is not switched on", { reason: "not_configured" });
    const cacheKey = `${key ? "g" : "n"}|${locale}|${q.toLowerCase()}|${near?.join(",") ?? ""}`;
    const hit = !key ? searchCache.get(cacheKey) : undefined; // Google results aren't cached (terms)
    if (hit && Date.now() - hit.at < CACHE_MS) return { items: hit.places };
    try {
      let places = key ? await googleAutocomplete(key, q, locale, near, session) : await nominatim(q, locale, near);
      if (near && !key) {
        const [w, n, e, s] = near as [number, number, number, number];
        const center = [(w + e) / 2, (n + s) / 2];
        places = places.sort((a, b) => haversine(center, [a.lng!, a.lat!]) - haversine(center, [b.lng!, b.lat!]));
      }
      if (!key) searchCache.set(cacheKey, { at: Date.now(), places });
      return { items: places };
    } catch {
      throw unavailable("Place search");
    }
  });

  // The chosen Google suggestion's exact position.
  app.get("/api/geo/place/:placeId", async (req) => {
    requireAuth(req);
    if (!key) throw notConfigured("Place details");
    const placeId = String((req.params as { placeId: string }).placeId);
    if (!/^[\w-]{10,300}$/.test(placeId)) throw new DomainError("validation", "Invalid place");
    const qs = req.query as Record<string, string | undefined>;
    const session = qs.session && /^[\w-]{8,64}$/.test(qs.session) ? qs.session : null;
    try {
      return await googlePlace(key, placeId, qs.lang === "en" ? "en" : "es", session);
    } catch {
      throw unavailable("Place details");
    }
  });

  // Google map pictures through our server (the key stays here).
  app.get("/api/geo/tiles/:type/:z/:x/:y", async (req, reply) => {
    requireAuth(req);
    if (!key) throw notConfigured("Map pictures");
    const p = req.params as Record<string, string>;
    const type = p.type === "satellite" ? "satellite" : "roadmap";
    const [z, x, y] = [p.z, p.x, p.y].map((v) => Number(v));
    if (![z, x, y].every((v) => Number.isInteger(v) && v! >= 0) || z! > 22) throw new DomainError("validation", "Invalid tile");
    const locale = (req.query as Record<string, string | undefined>).lang === "en" ? "en" : "es";
    try {
      const session = await tileSession(key, type, locale);
      const res = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${session}&key=${key}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`tile ${res.status}`);
      return reply
        .header("content-type", res.headers.get("content-type") ?? "image/png")
        .header("cache-control", "private, max-age=3600")
        .send(Buffer.from(await res.arrayBuffer()));
    } catch {
      throw unavailable("Map pictures");
    }
  });

  // Google's copyright text for the area on screen (required by its terms).
  app.get("/api/geo/attribution", async (req) => {
    requireAuth(req);
    if (!key) return { copyright: "" };
    const qs = req.query as Record<string, string | undefined>;
    const type = qs.type === "satellite" ? "satellite" : "roadmap";
    const nums = ["zoom", "north", "south", "east", "west"].map((k) => Number(qs[k]));
    if (nums.some((n) => !Number.isFinite(n))) return { copyright: "" };
    try {
      const session = await tileSession(key, type, qs.lang === "en" ? "en" : "es");
      const [zoom, north, south, east, west] = nums;
      const r = await google<{ copyright?: string }>(
        `https://tile.googleapis.com/tile/v1/viewport?session=${session}&zoom=${zoom}&north=${north}&south=${south}&east=${east}&west=${west}&key=${key}`,
        key
      );
      return { copyright: r.copyright ?? "" };
    } catch {
      return { copyright: "" };
    }
  });

  // Follow the streets (DEC-027 item 1): the clicked points become a route
  // along real streets or paths. Any organization, for people who edit maps.
  app.post("/api/geo/route", async (req) => {
    requireCapability(req, "map.edit");
    if (!key) throw notConfigured("Street routing");
    const body = routeBody.safeParse(req.body);
    if (!body.success) throw new DomainError("validation", "Between 2 and 25 points are needed");
    const pts = body.data.waypoints;
    const ll = (p: number[]) => ({ location: { latLng: { latitude: p[1], longitude: p[0] } } });
    try {
      const r = await google<{ routes?: { distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] }>(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        key,
        {
          fieldMask: "routes.distanceMeters,routes.polyline.encodedPolyline",
          body: {
            origin: ll(pts[0]!),
            destination: ll(pts[pts.length - 1]!),
            intermediates: pts.slice(1, -1).map(ll),
            travelMode: ({ drive: "DRIVE", walk: "WALK", bike: "BICYCLE" } as const)[body.data.mode],
            polylineQuality: "HIGH_QUALITY",
          },
        }
      );
      const enc = r.routes?.[0]?.polyline?.encodedPolyline;
      if (!enc) throw new DomainError("validation", "No route was found between those points", { reason: "no_route" });
      return { coordinates: decodePolyline(enc).map(([lng, lat]) => [round6(lng), round6(lat)]), distanceMeters: r.routes?.[0]?.distanceMeters ?? null };
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw unavailable("Street routing");
    }
  });

  // Heights for a drawn course (DEC-027 item 2; courses add-on).
  app.post("/api/geo/elevation", async (req) => {
    const auth = requireCapability(req, "map.edit");
    if (!(await tenantFeatures(db, auth.tenantId)).includes("courses")) {
      throw new DomainError("license_restricted", "Elevation is part of the running courses add-on", { feature: "courses" });
    }
    if (!key) throw notConfigured("Elevation");
    const body = elevationBody.safeParse(req.body);
    if (!body.success) throw new DomainError("validation", "Between 2 and 5000 points are needed");
    const coords = body.data.coordinates;
    try {
      const out: number[][] = [];
      for (let i = 0; i < coords.length; i += 256) {
        const batch = coords.slice(i, i + 256);
        const r = await google<{ status: string; results?: { elevation: number }[] }>(
          `https://maps.googleapis.com/maps/api/elevation/json?locations=enc:${encodeURIComponent(encodePolyline(batch))}&key=${key}`,
          key
        );
        if (r.status !== "OK" || !r.results || r.results.length !== batch.length) throw new Error(`elevation ${r.status}`);
        batch.forEach((c, j) => out.push([c[0]!, c[1]!, Math.round(r.results![j]!.elevation * 10) / 10]));
      }
      return { coordinates: out };
    } catch {
      throw unavailable("Elevation");
    }
  });
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
