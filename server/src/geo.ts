import type { FastifyInstance } from "fastify";
import { DomainError } from "@structura/domain";
import { requireAuth } from "./auth.js";
import type { Config } from "./config.js";

// Place search for the Event location map. Browsers never call a search
// provider directly: the request goes through this server, so only the
// typed search words leave our environment, and only when a provider is
// switched on (GEOCODER). Which provider is a pending decision (P-016):
//   none       - search off; the map still works by clicking (default)
//   nominatim  - OpenStreetMap's public service (light use only)
// A self-hosted search inside our environment would be another value.

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, { at: number; places: Place[] }>();
const CACHE_MS = 24 * 3600_000;
let lastCall = 0;

async function nominatim(q: string, locale: string): Promise<Place[]> {
  // OpenStreetMap's usage policy: at most one request per second.
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${locale}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": "STRUCTURA/0.1 (event operations platform)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`search provider answered ${res.status}`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export function geoRoutes(app: FastifyInstance, config: Config): void {
  app.get("/api/geo/status", async (req) => {
    requireAuth(req);
    return { search: config.geocoder !== "none", provider: config.geocoder };
  });

  app.get("/api/geo/search", async (req) => {
    requireAuth(req);
    const q = String((req.query as Record<string, string | undefined>).q ?? "").trim();
    const locale = (req.query as Record<string, string | undefined>).lang === "en" ? "en" : "es";
    if (q.length < 3) return { items: [] };
    if (config.geocoder === "none") {
      throw new DomainError("provider_failure", "Place search is not switched on", { reason: "not_configured" });
    }
    const key = `${locale}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { items: hit.places };
    try {
      const places = await nominatim(q.slice(0, 200), locale);
      cache.set(key, { at: Date.now(), places });
      return { items: places };
    } catch {
      throw new DomainError("provider_failure", "Place search is not available right now", { reason: "unavailable" });
    }
  });
}
