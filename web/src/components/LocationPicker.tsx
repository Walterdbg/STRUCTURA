import { useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ApiError, get } from "../api.js";
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
  lat: number;
  lng: number;
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

  useEffect(() => {
    get<{ search: boolean }>("/api/geo/status").then((s) => setSearchOn(s.search), () => setSearchOn(false));
  }, []);

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(
      value.lat !== null && value.lng !== null ? [value.lat, value.lng] : DEFAULT_CENTER,
      value.lat !== null ? 15 : 11
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);
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

  async function search() {
    setMessage(null);
    if (query.trim().length < 3) {
      setMessage(t("map.typeMore"));
      return;
    }
    try {
      const r = await get<{ items: Place[] }>(`/api/geo/search?q=${encodeURIComponent(query.trim())}&lang=${locale}`);
      setResults(r.items);
      if (r.items.length === 0) setMessage(t("map.noResults"));
    } catch (err) {
      const reason = err instanceof ApiError ? err.details?.reason : undefined;
      setMessage(t(reason === "not_configured" ? "map.searchOff" : "map.searchFailed"));
    }
  }

  function choose(p: Place) {
    setResults(null);
    setQuery("");
    onChange({ name: p.name, lat: round(p.lat), lng: round(p.lng) });
    map.current?.setView([p.lat, p.lng], 16);
  }

  return (
    <div className="location-picker">
      <input
        aria-label={t("event.location")}
        placeholder={t("map.namePlaceholder")}
        value={value.name}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      {!disabled && (
        <div className="row search-row">
          <input
            type="search"
            aria-label={t("map.search")}
            placeholder={searchOn === false ? t("map.searchOff") : t("map.searchPlaceholder")}
            value={query}
            disabled={searchOn === false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
          <button type="button" onClick={() => void search()} disabled={searchOn === false}>
            🔍 {t("map.search")}
          </button>
          {value.lat !== null && (
            <button type="button" onClick={() => onChange({ ...value, lat: null, lng: null })}>
              {t("map.clear")}
            </button>
          )}
        </div>
      )}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button type="button" className="link" onClick={() => choose(p)}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
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
