import { useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ApiError, get } from "../api.js";
import { uuidv7 } from "@structura/domain";
import { addBaseLayers, addFullscreen, geoStatus } from "./basemap.js";
import { LocaleContext, useT } from "../i18n.js";

// The Event location as a point on a map (Walter, 2026-09-30): search a
// place or address, or click the map; the pin can be dragged. The name
// and the exact coordinates are both saved. Map pictures come from
// OpenStreetMap (allowed for normal viewing; offline tiles are a Phase 3
// decision, spec 12).

export interface MapPoint {
  name: string;
  lat: number | null;
  lng: number | null;
}

interface Place {
  name: string;
  lat?: number;
  lng?: number;
  // Google suggestions carry an ID; the exact point is fetched on choice.
  placeId?: string;
}

const DEFAULT_CENTER: L.LatLngTuple = [8.98, -79.52]; // Panama City, only as a starting view

export function LocationPicker({ value, onChange, disabled }: { value: MapPoint; onChange: (v: MapPoint) => void; disabled?: boolean }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searchOn, setSearchOn] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const session = useRef<string | null>(null);

  useEffect(() => {
    void geoStatus().then((s) => setSearchOn(s.search));
  }, []);

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(
      value.lat !== null && value.lng !== null ? [value.lat, value.lng] : DEFAULT_CENTER,
      value.lat !== null ? 15 : 11
    );
    void addBaseLayers(m, locale, { map: t("map.layerMap"), satellite: t("map.layerSatellite") });
    addFullscreen(m, box.current, { enter: t("map.fullscreen"), exit: t("map.exitFullscreen") });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking the map places the point (no search needed, no GPS needed).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      if (disabled) return;
      onChange({ ...latest.current, lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
    };
    m.on("click", onClick);
    return () => {
      m.off("click", onClick);
    };
  }, [disabled, onChange]);

  // Keep the pin in step with the value.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (value.lat === null || value.lng === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const pos: L.LatLngTuple = [value.lat, value.lng];
    if (!marker.current) {
      marker.current = L.marker(pos, { draggable: !disabled, icon: pinIcon }).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        onChange({ ...latest.current, lat: round(p.lat), lng: round(p.lng) });
      });
    } else {
      marker.current.setLatLng(pos);
    }
    if (marker.current.dragging) {
      if (disabled) marker.current.dragging.disable();
      else marker.current.dragging.enable();
    }
    if (!m.getBounds().contains(pos)) m.setView(pos, Math.max(m.getZoom(), 15));
  }, [value.lat, value.lng, disabled, onChange]);

  // One box: typing the place searches it (after a short pause), and the
  // suggestions appear right under it. Places near the map's current
  // view come first.
  useEffect(() => {
    if (disabled || !searchOn || !query || query.trim().length < 3) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setMessage(null);
      try {
        const b = map.current?.getBounds();
        const near = b ? `&near=${[b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map((v) => v.toFixed(4)).join(",")}` : "";
        // One session per search, so Google bills the typing + choice once.
        session.current ??= uuidv7();
        const r = await get<{ items: Place[] }>(`/api/geo/search?q=${encodeURIComponent(query.trim())}&lang=${locale}${near}&session=${session.current}`);
        setResults(r.items);
        if (r.items.length === 0) setMessage(t("map.noResults"));
      } catch (err) {
        const reason = err instanceof ApiError ? err.details?.reason : undefined;
        setMessage(t(reason === "not_configured" ? "map.searchOff" : "map.searchFailed"));
      } finally {
        setSearching(false);
      }
    }, 700);
    return () => clearTimeout(timer);
    // Only a new query starts a search (t changes every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, disabled, searchOn, locale]);

  async function choose(p: Place) {
    setResults(null);
    setQuery("");
    setMessage(null);
    let place = p;
    if (p.placeId && (p.lat === undefined || p.lng === undefined)) {
      try {
        place = await get<Place>(`/api/geo/place/${encodeURIComponent(p.placeId)}?lang=${locale}&session=${session.current ?? ""}`);
      } catch {
        setMessage(t("map.searchFailed"));
        return;
      } finally {
        session.current = null;
      }
    }
    if (place.lat === undefined || place.lng === undefined) return;
    onChange({ name: place.name || p.name, lat: round(place.lat), lng: round(place.lng) });
    map.current?.setView([place.lat, place.lng], 18);
  }

  return (
    <div className="location-picker">
      <div className="search-box">
        <input
          aria-label={t("event.location")}
          placeholder={searchOn ? t("map.searchPlaceholder") : t("map.namePlaceholder")}
          value={value.name}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => {
            onChange({ ...value, name: e.target.value });
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setResults(null);
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        {searching && <span className="small muted searching">🔍…</span>}
        {results && results.length > 0 && (
          <ul className="results" role="listbox">
            {results.map((p) => (
              <li key={p.placeId ?? `${p.lat},${p.lng}`}>
                <button type="button" onClick={() => void choose(p)}>
                  📍 {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!disabled && value.lat !== null && (
        <div className="row">
          <button type="button" onClick={() => onChange({ ...value, lat: null, lng: null })}>
            {t("map.clear")}
          </button>
        </div>
      )}
      {message && <p className="small bad">{message}</p>}
      <div ref={box} className="map-box" />
      <p className="small muted">
        {value.lat !== null && value.lng !== null
          ? `${t("map.point")}: ${value.lat}, ${value.lng}`
          : disabled
            ? t("map.noPoint")
            : t("map.clickHint")}
      </p>
    </div>
  );
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

// A plain CSS pin, so no image files are needed.
const pinIcon = L.divIcon({ className: "map-pin", iconSize: [18, 18], iconAnchor: [9, 9] });
