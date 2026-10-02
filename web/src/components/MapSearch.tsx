import { useContext, useEffect, useRef, useState } from "react";
import { uuidv7 } from "@structura/domain";
import { get } from "../api.js";
import { LocaleContext, useT } from "../i18n.js";

// Address search on the Event map (DEC-032 item 9): jump the map to a place
// (a second start area, a parking lot). Nothing is saved; it only moves the
// view. Same search as the Event location, through our server.

interface Place {
  name: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

export function MapSearch({ onPick, near }: { onPick: (lat: number, lng: number) => void; near?: () => string }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const session = useRef<string | null>(null);
  // Showing the chosen place's name in the box must not search again.
  const chosen = useRef(false);

  useEffect(() => {
    if (chosen.current) {
      chosen.current = false;
      return;
    }
    if (q.trim().length < 3) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        session.current ??= uuidv7();
        const r = await get<{ items: Place[] }>(`/api/geo/search?q=${encodeURIComponent(q.trim())}&lang=${locale}${near ? near() : ""}&session=${session.current}`);
        setResults(r.items);
        setMsg(r.items.length ? null : t("map.noResults"));
      } catch {
        setMsg(t("map.searchFailed"));
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locale]);

  async function choose(p: Place) {
    setResults(null);
    let place = p;
    if (p.placeId && (p.lat === undefined || p.lng === undefined)) {
      try {
        place = await get<Place>(`/api/geo/place/${encodeURIComponent(p.placeId)}?lang=${locale}&session=${session.current ?? ""}`);
      } catch {
        setMsg(t("map.searchFailed"));
        return;
      } finally {
        session.current = null;
      }
    }
    if (place.lat !== undefined && place.lng !== undefined) {
      chosen.current = true;
      setQ(place.name || p.name);
      onPick(place.lat, place.lng);
    }
  }

  return (
    <div className="map-search search-box">
      <input
        type="search"
        placeholder={`🔍 ${t("map.goTo")}`}
        aria-label={t("map.goTo")}
        value={q}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setResults(null);
          if (e.key === "Enter") e.preventDefault();
        }}
      />
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
      {msg && <small className="muted">{msg}</small>}
    </div>
  );
}
