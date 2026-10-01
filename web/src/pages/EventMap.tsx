import { useCallback, useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { POINT_CATEGORIES, ROUTE_CATEGORIES, elevationProfile, lineLength, markersAlong } from "@structura/domain";
import { ApiError, get, newCommand, send, type EventRecord, type MapFeature } from "../api.js";
import { parseGpx, toGpx } from "../components/gpx.js";
import { describeFailure } from "../forms.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";

// Event map (UC-05, DEC-022): points, small areas and routes; running
// courses with km markers, elevation and GPX are the paid add-on (DEC-023).
// Drawing a shape never moves stock and never creates a location.

type Kind = MapFeature["kind"];
type Draft = {
  id: string | null;
  version: number | null;
  kind: Kind;
  category: string;
  label: string;
  notes: string;
  preferred: boolean;
  geometry: MapFeature["geometry"];
  source: string | null;
};

const ICON: Record<string, string> = {
  stage: "🎤",
  water: "💧",
  toilets: "🚻",
  bar_storage: "🍹",
  first_aid: "⛑️",
  entrance: "🚪",
  parking: "🅿️",
  other: "📍",
};
const ROUTE_COLOR: Record<string, string> = { delivery: "#d9480f", course: "#7048e8", other: "#1971c2" };
const AREA_COLOR = "#2b8a3e";
const DEFAULT_CENTER: L.LatLngTuple = [8.98, -79.52];

const km = (m: number, locale: string) =>
  m >= 1000 ? `${(m / 1000).toLocaleString(locale === "es" ? "es-PA" : "en-US", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`;

export function EventMap({ event, canEdit, features }: { event: EventRecord; canEdit: boolean; features: string[] }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.FeatureGroup | null>(null);
  const drawingLayer = useRef<L.Layer | null>(null);
  const [items, setItems] = useState<MapFeature[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingShape, setEditingShape] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [busy, setBusy] = useState(false);
  // What is being drawn right now, to show how to finish it.
  const [drawing, setDrawing] = useState<Kind | null>(null);
  const hasCourses = features.includes("courses");

  const load = useCallback(async () => {
    try {
      const r = await get<{ items: MapFeature[] }>(`/api/events/${event.id}/map`);
      setItems(r.items);
    } catch (err) {
      setError(describeFailure(err).message);
    }
  }, [event.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Map, once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const center: L.LatLngTuple = event.locationLat !== null && event.locationLng !== null ? [event.locationLat, event.locationLng] : DEFAULT_CENTER;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(center, event.locationLat !== null ? 16 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
    layerGroup.current = L.featureGroup().addTo(m);
    m.pm.setGlobalOptions({ snappable: true, continueDrawing: false });
    // The drawing tool's own hints in the screen's language.
    m.pm.setLang(locale === "es" ? "es" : "en");
    m.on("pm:create", (e: { layer: L.Layer; shape: string }) => {
      setDrawing(null);
      drawingLayer.current = e.layer;
      const gj = (e.layer as L.Marker | L.Polyline).toGeoJSON().geometry as MapFeature["geometry"];
      const kind: Kind = e.shape === "Marker" ? "point" : e.shape === "Polygon" ? "area" : "route";
      setDraft({
        id: null,
        version: null,
        kind,
        category: kind === "route" ? (pendingCategory.current ?? "delivery") : "stage",
        label: "",
        notes: "",
        preferred: false,
        geometry: roundGeometry(gj),
        source: null,
      });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCategory = useRef<string | null>(null);

  // Draw saved items.
  useEffect(() => {
    const g = layerGroup.current;
    const m = map.current;
    if (!g || !m || !items) return;
    g.clearLayers();
    for (const f of items) {
      if (draft?.id === f.id && editingShape) continue;
      const label = `${f.kind === "route" ? "" : `${ICON[f.category] ?? "📍"} `}${f.label}`;
      let layer: L.Layer;
      if (f.kind === "point") {
        const [lng, lat] = f.geometry.coordinates as number[];
        layer = L.marker([lat!, lng!], { icon: L.divIcon({ className: "poi-icon", html: ICON[f.category] ?? "📍", iconSize: [28, 28], iconAnchor: [14, 14] }) });
      } else if (f.kind === "area") {
        const ring = (f.geometry.coordinates as number[][][])[0]!.map((c) => [c[1]!, c[0]!] as L.LatLngTuple);
        layer = L.polygon(ring, { color: AREA_COLOR, weight: 2, fillOpacity: 0.25 });
      } else {
        const line = (f.geometry.coordinates as number[][]).map((c) => [c[1]!, c[0]!] as L.LatLngTuple);
        layer = L.polyline(line, { color: ROUTE_COLOR[f.category] ?? "#1971c2", weight: f.preferred ? 6 : 4, dashArray: f.preferred ? undefined : "8 6" });
        if (f.category === "course") {
          for (const mk of markersAlong(f.geometry.coordinates as number[][])) {
            L.marker([mk.position[1], mk.position[0]], {
              icon: L.divIcon({ className: "km-marker", html: String(Math.round(mk.distance / 1000)), iconSize: [22, 22], iconAnchor: [11, 11] }),
              interactive: false,
            }).addTo(g);
          }
        }
      }
      (layer as L.Path).bindTooltip?.(label, { direction: "top" });
      layer.on("click", () => {
        // While drawing, a click on an existing item is part of the drawing
        // (e.g. ending a route at the stage), not a request to open it.
        if (map.current?.pm.globalDrawModeEnabled()) return;
        setError(null);
        setDraft({
          id: f.id,
          version: f.version,
          kind: f.kind,
          category: f.category,
          label: f.label,
          notes: f.notes ?? "",
          preferred: f.preferred,
          geometry: f.geometry,
          source: f.source,
        });
      });
      layer.addTo(g);
    }
    if (items.length && !draft) {
      const b = g.getBounds();
      if (b.isValid()) m.fitBounds(b.pad(0.2), { maxZoom: 17 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, editingShape]);

  function startDraw(kind: Kind, category?: string) {
    const m = map.current;
    if (!m) return;
    cancelDraft();
    setError(null);
    setDrawing(kind);
    pendingCategory.current = category ?? null;
    m.pm.enableDraw(kind === "point" ? "Marker" : kind === "area" ? "Polygon" : "Line", {
      markerStyle: { icon: L.divIcon({ className: "poi-icon", html: "📍", iconSize: [28, 28], iconAnchor: [14, 14] }) },
      pathOptions: { color: kind === "area" ? AREA_COLOR : ROUTE_COLOR[category ?? "delivery"] },
    } as L.PM.DrawModeOptions);
  }

  // Finish a route or area with a button instead of the precise "click the
  // last point again", which fails when the point sits under another icon.
  function finishDrawing() {
    const draw = (map.current?.pm as unknown as { Draw: Record<string, { _finishShape?: () => void }> } | undefined)?.Draw;
    const shape = drawing === "area" ? "Polygon" : "Line";
    draw?.[shape]?._finishShape?.();
  }

  function cancelDraft() {
    map.current?.pm.disableDraw();
    setDrawing(null);
    if (drawingLayer.current) {
      map.current?.removeLayer(drawingLayer.current);
      drawingLayer.current = null;
    }
    if (editingShape) {
      setEditingShape(false);
    }
    setDraft(null);
  }

  // Edit the shape of a saved item: show it as an editable layer.
  function editShape() {
    if (!draft || !map.current) return;
    const g = draft.geometry;
    let layer: L.Layer;
    if (g.type === "Point") {
      const [lng, lat] = g.coordinates as number[];
      layer = L.marker([lat!, lng!], { draggable: true });
    } else if (g.type === "Polygon") {
      layer = L.polygon((g.coordinates as number[][][])[0]!.map((c) => [c[1]!, c[0]!] as L.LatLngTuple), { color: AREA_COLOR });
    } else {
      layer = L.polyline((g.coordinates as number[][]).map((c) => [c[1]!, c[0]!] as L.LatLngTuple), { color: ROUTE_COLOR[draft.category] });
    }
    layer.addTo(map.current);
    (layer as unknown as { pm: { enable: (o?: object) => void } }).pm.enable({ allowSelfIntersection: true });
    drawingLayer.current = layer;
    setEditingShape(true);
  }

  async function save() {
    if (!draft) return;
    if (!draft.label.trim()) {
      setError("map.labelRequired");
      return;
    }
    let geometry = draft.geometry;
    if (editingShape && drawingLayer.current) {
      geometry = roundGeometry((drawingLayer.current as L.Marker | L.Polyline).toGeoJSON().geometry as MapFeature["geometry"]);
    }
    const payload = {
      kind: draft.kind,
      category: draft.category,
      label: draft.label.trim(),
      notes: draft.notes.trim() || null,
      preferred: draft.kind === "route" ? draft.preferred : false,
      geometry,
      source: draft.source,
    };
    setBusy(true);
    setError(null);
    try {
      if (draft.id) await send("PUT", `/api/events/${event.id}/map/${draft.id}`, newCommand(payload, draft.version));
      else await send("POST", `/api/events/${event.id}/map`, newCommand(payload));
      cancelDraft();
      await load();
    } catch (err) {
      const kind = err instanceof ApiError ? err.kind : "internal";
      setError(kind === "license_restricted" ? "map.coursesLocked" : kind === "validation" ? "map.badShape" : describeFailure(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(t("map.removeConfirm"))) return;
    setBusy(true);
    try {
      await send("POST", `/api/events/${event.id}/map/${draft.id}/remove`, newCommand({}, draft.version));
      cancelDraft();
      await load();
    } catch (err) {
      setError(describeFailure(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function importGpx(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { name, coordinates } = parseGpx(await file.text());
      cancelDraft();
      setDraft({
        id: null,
        version: null,
        kind: "route",
        category: "course",
        label: name ?? file.name.replace(/\.gpx$/i, ""),
        notes: "",
        preferred: false,
        geometry: { type: "LineString", coordinates },
        source: file.name,
      });
      const b = L.latLngBounds(coordinates.map((c) => [c[1]!, c[0]!] as L.LatLngTuple));
      map.current?.fitBounds(b.pad(0.1));
      const preview = L.polyline(coordinates.map((c) => [c[1]!, c[0]!] as L.LatLngTuple), { color: ROUTE_COLOR.course, weight: 4 });
      preview.addTo(map.current!);
      drawingLayer.current = preview;
    } catch {
      setError("map.gpxInvalid");
    }
  }

  function exportGpx(f: MapFeature) {
    const blob = new Blob([toGpx(f.label, f.geometry.coordinates as number[][])], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${f.label.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "_")}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const categories = draft?.kind === "route" ? ROUTE_CATEGORIES.filter((c) => c !== "course" || hasCourses) : POINT_CATEGORIES;
  const draftLength = draft?.geometry.type === "LineString" ? lineLength(draft.geometry.coordinates as number[][]) : null;
  const profile = draft?.category === "course" && draft.geometry.type === "LineString" ? elevationProfile(draft.geometry.coordinates as number[][]) : null;

  return (
    <section className="card">
      <div className="row between">
        <h3 className="flush">{t("map.title")}</h3>
        {canEdit && (
          <div className="row">
            <button type="button" onClick={() => startDraw("point")}>
              📍 {t("map.addPoint")}
            </button>
            <button type="button" onClick={() => startDraw("area")}>
              ⬠ {t("map.addArea")}
            </button>
            <button type="button" onClick={() => startDraw("route", "delivery")}>
              〰 {t("map.addRoute")}
            </button>
            {hasCourses ? (
              <>
                <button type="button" onClick={() => startDraw("route", "course")}>
                  🏃 {t("map.addCourse")}
                </button>
                <label className="button file">
                  ⤒ GPX
                  <input type="file" accept=".gpx,application/gpx+xml" onChange={(e) => (void importGpx(e.target.files?.[0]), (e.target.value = ""))} />
                </label>
              </>
            ) : (
              <span className="tag" title={t("map.coursesLocked")}>
                🔒 {t("map.coursesAddOn")}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="muted small">{canEdit ? t("map.hint") : t("map.viewOnly")}</p>
      {drawing && (
        <p className="drawing-hint">
          {t(drawing === "point" ? "map.drawPoint" : drawing === "area" ? "map.drawArea" : "map.drawRoute")}
          {drawing !== "point" && (
            <button type="button" className="primary" onClick={finishDrawing}>
              ✓ {t("map.finish")}
            </button>
          )}
          <button type="button" onClick={cancelDraft}>
            {t("common.cancel")}
          </button>
        </p>
      )}
      <div ref={box} className="map-box tall" />

      {draft && (
        <div className="map-panel">
          <div className="form grid">
            <label>
              <span>{t("map.type")}</span>
              <select value={draft.category} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {draft.kind === "route" ? "" : `${ICON[c]} `}
                    {t(`map.cat.${c}` as TextKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("map.label")}</span>
              <input value={draft.label} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t("map.labelPlaceholder")} />
            </label>
            <label className="wide">
              <span>{t("item.notes")}</span>
              <input value={draft.notes} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            {draft.kind === "route" && (
              <label className="check">
                <input type="checkbox" checked={draft.preferred} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, preferred: e.target.checked })} />
                <span>{t("map.preferred")}</span>
              </label>
            )}
          </div>
          {draftLength !== null && (
            <p className="small">
              {t("map.length")}: <strong>{km(draftLength, locale)}</strong>
              {draft.source && <span className="muted"> · {draft.source}</span>}
            </p>
          )}
          {profile && <ElevationChart profile={profile} locale={locale} />}
          {draft.category === "course" && !profile && <p className="small muted">{t("map.noElevation")}</p>}
          {error && (
            <p className="bad" role="alert">
              {t(error)}
            </p>
          )}
          {canEdit && (
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
              {draft.id && !editingShape && !(draft.category === "course" && profile) && (
                <button type="button" onClick={editShape}>
                  ✎ {t("map.editShape")}
                </button>
              )}
              {draft.id && (
                <button type="button" onClick={() => void remove()}>
                  {t("map.remove")}
                </button>
              )}
              <button type="button" onClick={cancelDraft}>
                {t("common.cancel")}
              </button>
            </div>
          )}
          {!canEdit && (
            <button type="button" onClick={cancelDraft}>
              {t("common.back")}
            </button>
          )}
        </div>
      )}
      {!draft && error && (
        <p className="bad" role="alert">
          {t(error)}
        </p>
      )}

      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("map.label")}</th>
                <th>{t("map.type")}</th>
                <th className="num">{t("map.length")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id}>
                  <td>
                    <button type="button" className="link" onClick={() => setDraft({ id: f.id, version: f.version, kind: f.kind, category: f.category, label: f.label, notes: f.notes ?? "", preferred: f.preferred, geometry: f.geometry, source: f.source })}>
                      {f.kind === "route" ? "〰" : f.kind === "area" ? "⬠" : ICON[f.category]} {f.label}
                    </button>
                    {f.preferred && <span className="tag">{t("map.preferred")}</span>}
                  </td>
                  <td className="small">{t(`map.cat.${f.category}` as TextKey)}</td>
                  <td className="num small">{f.lengthMeters !== null ? km(f.lengthMeters, locale) : ""}</td>
                  <td>
                    {f.category === "course" && hasCourses && (
                      <button type="button" onClick={() => exportGpx(f)}>
                        ⤓ GPX
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items && items.length === 0 && !draft && <p className="muted small">{t("map.empty")}</p>}
    </section>
  );
}

function ElevationChart({ profile, locale }: { profile: NonNullable<ReturnType<typeof elevationProfile>>; locale: string }) {
  const t = useT();
  const w = 600;
  const h = 120;
  const pts = profile.points;
  const maxD = pts[pts.length - 1]!.distance || 1;
  const els = pts.map((p) => p.elevation);
  const lo = Math.min(...els);
  const hi = Math.max(...els);
  const span = hi - lo || 1;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${((p.distance / maxD) * w).toFixed(1)},${(h - ((p.elevation - lo) / span) * (h - 10) - 5).toFixed(1)}`).join(" ");
  return (
    <div className="elevation">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={t("map.elevation")}>
        <path d={`${path} L${w},${h} L0,${h} Z`} className="area" />
        <path d={path} className="line" />
      </svg>
      <p className="small">
        {t("map.elevation")}: {Math.round(lo)}–{Math.round(hi)} m · ↑ {Math.round(profile.gain)} m · ↓ {Math.round(profile.loss)} m · {km(maxD, locale)}
      </p>
    </div>
  );
}

function roundGeometry(g: MapFeature["geometry"]): MapFeature["geometry"] {
  const r = (c: number[]) => c.map((v, i) => (i < 2 ? Math.round(v * 1e6) / 1e6 : v));
  if (g.type === "Point") return { type: "Point", coordinates: r(g.coordinates as number[]) };
  if (g.type === "LineString") return { type: "LineString", coordinates: (g.coordinates as number[][]).map(r) };
  return { type: "Polygon", coordinates: (g.coordinates as number[][][]).map((ring) => ring.map(r)) };
}
