import L from "leaflet";
import { get } from "../api.js";

// The map pictures under every STRUCTURA map (DEC-026). With the Google
// key: Google streets and satellite, through our server, with a
// "Mapa / Satélite" switch and Google's copyright for the area on screen
// (required by Google's terms). Without it: OpenStreetMap streets.

export interface GeoStatus {
  provider: "google" | "nominatim" | "none";
  search: boolean;
  tiles: "google" | "osm";
  satellite: boolean;
  routing: boolean;
  elevation: boolean;
}

let statusPromise: Promise<GeoStatus> | null = null;
export function geoStatus(): Promise<GeoStatus> {
  statusPromise ??= get<GeoStatus>("/api/geo/status").catch(() => ({
    provider: "none" as const,
    search: false,
    tiles: "osm" as const,
    satellite: false,
    routing: false,
    elevation: false,
  }));
  return statusPromise;
}

const GOOGLE_LOGO = '<span class="google-logo">Google</span>';

export async function addBaseLayers(map: L.Map, locale: string, labels: { map: string; satellite: string }): Promise<GeoStatus> {
  const status = await geoStatus();
  if (status.tiles !== "google") {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    return status;
  }
  const lang = locale === "en" ? "en" : "es";
  const roadmap = L.tileLayer(`/api/geo/tiles/roadmap/{z}/{x}/{y}?lang=${lang}`, { maxZoom: 22, attribution: GOOGLE_LOGO });
  const satellite = L.tileLayer(`/api/geo/tiles/satellite/{z}/{x}/{y}?lang=${lang}`, { maxZoom: 21, attribution: GOOGLE_LOGO });
  roadmap.addTo(map);
  L.control.layers({ [`🗺 ${labels.map}`]: roadmap, [`🛰 ${labels.satellite}`]: satellite }, undefined, { position: "topright", collapsed: false }).addTo(map);

  // Copyright text for what is on screen, refreshed as the map moves.
  let current: "roadmap" | "satellite" = "roadmap";
  let pending: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(async () => {
      const b = map.getBounds();
      try {
        const r = await get<{ copyright: string }>(
          `/api/geo/attribution?type=${current}&zoom=${map.getZoom()}&north=${b.getNorth()}&south=${b.getSouth()}&east=${b.getEast()}&west=${b.getWest()}&lang=${lang}`
        );
        map.attributionControl.setPrefix(r.copyright ? `<span class="small">${escapeHtml(r.copyright)}</span>` : "");
      } catch {
        /* keep the previous text */
      }
    }, 400);
  };
  map.on("moveend", refresh);
  map.on("baselayerchange", (e: L.LayersControlEvent) => {
    current = e.layer === satellite ? "satellite" : "roadmap";
    refresh();
  });
  refresh();
  return status;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
