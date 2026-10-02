import L from "leaflet";
import { get } from "../api.js";

// The map pictures under every STRUCTURA map (DEC-026, B-005). With the
// Google key: Google streets and satellite; with the ArcGIS key: ArcGIS
// Topo, Streets and Imagery (US imagery is often leaf-off, so paths under
// trees show); OpenStreetMap always. All keyed pictures come through our
// server. Google's copyright for the area on screen is shown while a Google
// picture is chosen (Google's terms). The last choice is remembered in this
// browser.

export interface GeoStatus {
  provider: "google" | "nominatim" | "none";
  search: boolean;
  tiles: "google" | "osm";
  satellite: boolean;
  routing: boolean;
  elevation: boolean;
  arcgis?: boolean;
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
    arcgis: false,
  }));
  return statusPromise;
}

const GOOGLE_LOGO = '<span class="google-logo">Google</span>';
const ESRI = "Powered by Esri | Esri, TomTom, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, GIS User Community";
const PREF = "structura.basemap";

// ArcGIS pictures are offered only where race courses are worked on (Walter,
// 2026-10-01): race Event maps, course routes in Maps, the course sheet.
export async function addBaseLayers(map: L.Map, locale: string, labels: { map: string; satellite: string }, opts: { races?: boolean } = {}): Promise<GeoStatus> {
  const status = await geoStatus();
  const lang = locale === "en" ? "en" : "es";
  const es = lang === "es";
  const layers: Record<string, L.TileLayer> = {};
  const google = new Set<L.Layer>();
  if (status.tiles === "google") {
    const roadmap = L.tileLayer(`/api/geo/tiles/roadmap/{z}/{x}/{y}?lang=${lang}`, { maxZoom: 22, attribution: GOOGLE_LOGO });
    const satellite = L.tileLayer(`/api/geo/tiles/satellite/{z}/{x}/{y}?lang=${lang}`, { maxZoom: 21, attribution: GOOGLE_LOGO });
    layers[`🗺 ${labels.map}`] = roadmap;
    layers[`🛰 ${labels.satellite}`] = satellite;
    google.add(roadmap).add(satellite);
  }
  if (status.arcgis && opts.races) {
    // Topo and Streets come as 512 px pictures (one zoom level less for the
    // same detail); Imagery as 256 px.
    const esri = (style: string) => L.tileLayer(`/api/geo/arcgis/${style}/{z}/{y}/{x}?lang=${lang}`, { maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: ESRI });
    layers["⛰ ArcGIS Topo"] = esri("topo");
    layers[`🛣 ArcGIS ${es ? "Calles" : "Streets"}`] = esri("streets");
    layers[`🌳 ArcGIS ${es ? "Imágenes" : "Imagery"}`] = L.tileLayer(`/api/geo/arcgis/imagery/{z}/{y}/{x}`, {
      maxZoom: 21,
      attribution: "Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    });
  }
  layers["🌍 OSM"] = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" });

  const names = Object.keys(layers);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(PREF);
  } catch {
    /* private window */
  }
  const first = saved && layers[saved] ? saved : names[0]!;
  layers[first]!.addTo(map);
  if (names.length > 1) L.control.layers(layers, undefined, { position: "topright", collapsed: names.length > 3 }).addTo(map);

  // Google copyright text for what is on screen, refreshed as the map moves.
  let current: L.Layer = layers[first]!;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (pending) clearTimeout(pending);
    if (!google.has(current)) {
      map.attributionControl.setPrefix("");
      return;
    }
    const type = current === layers[`🛰 ${labels.satellite}`] ? "satellite" : "roadmap";
    pending = setTimeout(async () => {
      const b = map.getBounds();
      try {
        const r = await get<{ copyright: string }>(
          `/api/geo/attribution?type=${type}&zoom=${map.getZoom()}&north=${b.getNorth()}&south=${b.getSouth()}&east=${b.getEast()}&west=${b.getWest()}&lang=${lang}`
        );
        if (google.has(current)) map.attributionControl.setPrefix(r.copyright ? `<span class="small">${escapeHtml(r.copyright)}</span>` : "");
      } catch {
        /* keep the previous text */
      }
    }, 400);
  };
  map.on("moveend", refresh);
  map.on("baselayerchange", (e: L.LayersControlEvent) => {
    current = e.layer;
    try {
      localStorage.setItem(PREF, e.name);
    } catch {
      /* private window */
    }
    refresh();
  });
  refresh();
  return status;
}
// ⛶ button (Walter, 2026-10-01): the map, or the section holding it with its
// tools, fills the screen; the same button or Esc brings it back.
export function addFullscreen(map: L.Map, target: HTMLElement, labels: { enter: string; exit: string }): void {
  if (!target.requestFullscreen) return;
  const Ctl = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const a = L.DomUtil.create("a", "map-fullscreen", bar) as HTMLAnchorElement;
      a.href = "#";
      a.setAttribute("role", "button");
      const sync = () => {
        const on = document.fullscreenElement === target;
        a.textContent = on ? "✕" : "⛶";
        a.title = on ? labels.exit : labels.enter;
        a.setAttribute("aria-label", a.title);
        // Full screen: the mouse wheel zooms (no page to scroll behind it).
        if (on) map.scrollWheelZoom.enable();
        else if (map.getContainer().dataset.drawing !== "1") map.scrollWheelZoom.disable();
        setTimeout(() => map.invalidateSize(), 50);
      };
      sync();
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(a, "click", (e) => {
        L.DomEvent.preventDefault(e);
        if (document.fullscreenElement === target) void document.exitFullscreen();
        else void target.requestFullscreen();
      });
      document.addEventListener("fullscreenchange", sync);
      map.on("unload", () => document.removeEventListener("fullscreenchange", sync));
      return bar;
    },
  });
  new Ctl({ position: "topleft" }).addTo(map);
}

const escapeHtml =(s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
