import { useCallback, useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  POINT_CATEGORIES,
  ROUTE_CATEGORIES,
  courseTotal,
  elevationProfile,
  lineLength,
  markersAlong,
  positionAt,
  projectOnLine,
  type FeatureProps,
} from "@structura/domain";
import { ApiError, get, newCommand, send, type EventRecord, type MapFeature } from "../api.js";
import { addBaseLayers, addFullscreen, type GeoStatus } from "../components/basemap.js";
import { parseGpx, toGpx } from "../components/gpx.js";
import { RouteEditor, anchorIndexes, joinSegments, shapeFromLine, type RouteShape, type SegMode } from "../components/routeEditor.js";
import { describeFailure } from "../forms.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";

// Event map (UC-05, DEC-022): points, small areas and routes. Course tools
// (DEC-023/027, paid "courses" add-on): km markers, elevation, GPX, points
// placed at a distance, laps / out-and-back, start and finish, course sheet.
// Routes can follow the streets (Google routing, every organization).
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
  props: FeatureProps;
};

export const ICON: Record<string, string> = {
  stage: "🎤",
  water: "💧",
  toilets: "🚻",
  bar_storage: "🍹",
  first_aid: "⛑️",
  entrance: "🚪",
  parking: "🅿️",
  other: "📍",
};
export const ROUTE_COLOR: Record<string, string> = { delivery: "#d9480f", course: "#7048e8", other: "#1971c2" };
const AREA_COLOR = "#2b8a3e";
const DEFAULT_CENTER: L.LatLngTuple = [8.98, -79.52];
const NEAR_COURSE_M = 30;

export const km = (m: number, locale: string) =>
  m >= 1000 ? `${(m / 1000).toLocaleString(locale === "es" ? "es-PA" : "en-US", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`;

const toDraft = (f: MapFeature): Draft => ({
  id: f.id,
  version: f.version,
  kind: f.kind,
  category: f.category,
  label: f.label,
  notes: f.notes ?? "",
  preferred: f.preferred,
  geometry: f.geometry,
  source: f.source,
  props: f.props ?? {},
});

const TOOL_ICON: Record<SegMode, string> = { w: "👣", b: "🚲", d: "🚗", l: "✏️" };
const TOOL_LABEL: Record<SegMode, TextKey> = { w: "map.toolFoot", b: "map.toolBike", d: "map.toolCar", l: "map.toolDraw" };
const TOOL_HINT: Record<SegMode, TextKey> = { w: "map.toolFootHint", b: "map.toolBikeHint", d: "map.toolCarHint", l: "map.toolDrawHint" };

// The tool a new route starts with: on foot for courses, by car for deliveries.
const defaultTool = (category: string, routing: boolean): SegMode => (!routing ? "l" : category === "delivery" ? "d" : "w");

// One street piece from Google, through our server.
async function routeBetween(from: number[], to: number[], mode: "walk" | "bike" | "drive"): Promise<number[][]> {
  const res = await fetch("/api/geo/route", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, waypoints: [from, to] }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "internal", body?.message ?? "", body?.details);
  return body.coordinates as number[][];
}

// The pieces of a route kept with it (DEC-030), so it can be edited later.
function pieceProps(props: FeatureProps, shape: RouteShape | null): FeatureProps {
  const out: FeatureProps = { ...props };
  delete out.anchorIdx;
  delete out.segModes;
  if (shape && shape.segments.length > 0) {
    out.anchorIdx = anchorIndexes(shape);
    out.segModes = shape.segments.map((s) => s.mode);
    out.snapped = shape.segments.some((s) => s.mode !== "l");
  }
  return out;
}

export function EventMap({ event, canEdit, features }: { event: EventRecord; canEdit: boolean; features: string[] }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const box = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const map = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.FeatureGroup | null>(null);
  const drawingLayer = useRef<L.Layer | null>(null);
  const pendingCategory = useRef<string | null>(null);
  const [items, setItems] = useState<MapFeature[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const [editingShape, setEditingShape] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [busy, setBusy] = useState<TextKey | null>(null);
  const [drawing, setDrawing] = useState<Kind | null>(null);
  const [status, setStatus] = useState<GeoStatus | null>(null);
  // Route drawing (DEC-030): the tool for the next piece, and the editor.
  const [tool, setTool] = useState<SegMode>("w");
  const toolRef = useRef<SegMode>("w");
  toolRef.current = tool;
  const editor = useRef<RouteEditor | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const statusRef = useRef<GeoStatus | null>(null);
  statusRef.current = status;
  const hasCourses = features.includes("courses");
  const courses = (items ?? []).filter((f) => f.category === "course" && f.geometry.type === "LineString");

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

  // Show a route draft on the map while it is being prepared.
  const showPreview = useCallback((coords: number[][], category: string) => {
    if (drawingLayer.current) map.current?.removeLayer(drawingLayer.current);
    const preview = L.polyline(
      coords.map((c) => [c[1]!, c[0]!] as L.LatLngTuple),
      { color: ROUTE_COLOR[category] ?? "#1971c2", weight: 5 }
    );
    preview.addTo(map.current!);
    drawingLayer.current = preview;
  }, []);

  // Heights for courses (DEC-027 item 2), once the line is drawn or changed.
  const snapAndElevate = useCallback(
    async (d: Draft, _opts: { snap: boolean }) => {
      if (d.geometry.type !== "LineString") return d;
      let coords = d.geometry.coordinates as number[][];
      const props = d.props;
      const st = statusRef.current;
      if (coords.length >= 2 && d.category === "course" && hasCourses && st?.elevation && !coords.every((c) => c.length > 2)) {
        setBusy("map.gettingElevation");
        try {
          const res = await fetch("/api/geo/elevation", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ coordinates: coords.map((c) => [c[0], c[1]]) }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.message);
          coords = body.coordinates as number[][];
        } catch {
          setError("map.elevationFailed");
        }
      }
      setBusy(null);
      return { ...d, props, geometry: { type: "LineString" as const, coordinates: coords } };
    },
    [hasCourses]
  );

  // Map, once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const center: L.LatLngTuple = event.locationLat !== null && event.locationLng !== null ? [event.locationLat, event.locationLng] : DEFAULT_CENTER;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(center, event.locationLat !== null ? 16 : 11);
    void addBaseLayers(m, locale, { map: t("map.layerMap"), satellite: t("map.layerSatellite") }).then((s) => setStatus(s));
    if (sectionRef.current) addFullscreen(m, sectionRef.current, { enter: t("map.fullscreen"), exit: t("map.exitFullscreen") });
    layerGroup.current = L.featureGroup().addTo(m);
    m.pm.setGlobalOptions({ snappable: true, continueDrawing: false });
    m.pm.setLang(locale === "es" ? "es" : "en");
    m.on("pm:create", (e: { layer: L.Layer; shape: string }) => {
      setDrawing(null);
      drawingLayer.current = e.layer;
      const gj = (e.layer as L.Marker | L.Polyline).toGeoJSON().geometry as MapFeature["geometry"];
      const kind: Kind = e.shape === "Marker" ? "point" : e.shape === "Polygon" ? "area" : "route";
      const draft: Draft = {
        id: null,
        version: null,
        kind,
        category: kind === "route" ? (pendingCategory.current ?? "delivery") : "stage",
        label: "",
        notes: "",
        preferred: false,
        geometry: roundGeometry(gj),
        source: null,
        props: {},
      };
      setDraft(draft);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw saved items.
  // While drawing or reshaping, the mouse wheel zooms the map (Walter,
  // 2026-10-01); otherwise it scrolls the page.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const active = Boolean(drawing) || editingShape;
    m.getContainer().dataset.drawing = active ? "1" : "";
    if (active) m.scrollWheelZoom.enable();
    else if (!document.fullscreenElement) m.scrollWheelZoom.disable();
  }, [drawing, editingShape]);

  // Ctrl+Z (Cmd+Z) undoes the last step while a route is being drawn.
  useEffect(() => {
    if (drawing !== "route") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        editor.current?.undo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawing]);

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
        const coords = f.geometry.coordinates as number[][];
        const line = coords.map((c) => [c[1]!, c[0]!] as L.LatLngTuple);
        layer = L.polyline(line, { color: ROUTE_COLOR[f.category] ?? "#1971c2", weight: f.preferred ? 6 : 4, dashArray: f.preferred ? undefined : "8 6" });
        if (f.category === "course") {
          for (const mk of markersAlong(coords)) {
            L.marker([mk.position[1], mk.position[0]], {
              icon: L.divIcon({ className: "km-marker", html: String(Math.round(mk.distance / 1000)), iconSize: [22, 22], iconAnchor: [11, 11] }),
              interactive: false,
            }).addTo(g);
          }
          // (4) Start and finish (the finish is back at the start when out-and-back).
          const first = coords[0]!;
          const last = f.props?.outAndBack ? first : coords[coords.length - 1]!;
          L.marker([first[1]!, first[0]!], { icon: L.divIcon({ className: "flag-marker", html: "▶", iconSize: [26, 26], iconAnchor: [13, 13] }), title: t("map.start") }).addTo(g);
          L.marker([last[1]!, last[0]!], { icon: L.divIcon({ className: "flag-marker finish", html: "🏁", iconSize: [26, 26], iconAnchor: [4, 22] }), title: t("map.finishLine") }).addTo(g);
        }
      }
      (layer as L.Path).bindTooltip?.(label, { direction: "top" });
      layer.on("click", () => {
        // While drawing, a click on an existing item is part of the drawing.
        if (map.current?.pm.globalDrawModeEnabled() || editor.current) return;
        openItem(f);
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
    // Never throw away an unsaved drawing without asking.
    if (draft && !draft.id && !window.confirm(t("map.discardDraft"))) return;
    cancelDraft();
    setError(null);
    setDrawing(kind);
    pendingCategory.current = category ?? null;
    if (kind === "route") {
      // Routes are drawn piece by piece with the route editor (DEC-030).
      const cat = category ?? "delivery";
      setTool(defaultTool(cat, Boolean(statusRef.current?.routing)));
      setDraft({ id: null, version: null, kind: "route", category: cat, label: "", notes: "", preferred: false, geometry: { type: "LineString", coordinates: [] }, source: null, props: {} });
      openEditor(cat, undefined);
      return;
    }
    m.pm.enableDraw(kind === "point" ? "Marker" : kind === "area" ? "Polygon" : "Line", {
      markerStyle: { icon: L.divIcon({ className: "poi-icon", html: "📍", iconSize: [28, 28], iconAnchor: [14, 14] }) },
      pathOptions: { color: kind === "area" ? AREA_COLOR : ROUTE_COLOR[category ?? "delivery"] },
    } as L.PM.DrawModeOptions);
  }

  // Finish a route or area with a button (re-clicking the last point fails
  // when it sits under another icon).
  // Open an item to edit it; an unsaved new drawing is kept unless the person agrees to drop it.
  function openItem(f: MapFeature) {
    const d = draftRef.current;
    if (d && !d.id && !window.confirm(t("map.discardDraft"))) return;
    if (d && !d.id) cancelDraft();
    setError(null);
    setDraft(toDraft(f));
  }

  // The route editor on the map: new route (no shape) or a saved one.
  function openEditor(category: string, shape: RouteShape | undefined) {
    const m = map.current;
    if (!m) return;
    editor.current?.stop();
    const ed = new RouteEditor(m, {
      color: ROUTE_COLOR[category] ?? "#1971c2",
      route: statusRef.current?.routing ? routeBetween : null,
      mode: () => toolRef.current,
      onBusy: (b) => setRouteBusy(b),
      onRouteFailed: () => setError("map.noRoute"),
      onChange: (s) => {
        setCanUndo(ed.canUndo);
        setDraft((cur) => (cur ? { ...cur, geometry: { type: "LineString", coordinates: joinSegments(s) }, props: pieceProps(cur.props, s) } : cur));
      },
    });
    ed.start(shape);
    editor.current = ed;
    setCanUndo(false);
    setDrawing("route");
  }

  function closeEditor() {
    editor.current?.stop();
    editor.current = null;
    setCanUndo(false);
    setRouteBusy(false);
  }

  // "Done": stop drawing, keep the route on screen with its panel; a course
  // gets its heights.
  async function finishDrawing() {
    if (drawing !== "route") {
      const draw = (map.current?.pm as unknown as { Draw: Record<string, { _finishShape?: () => void }> } | undefined)?.Draw;
      draw?.[drawing === "area" ? "Polygon" : "Line"]?._finishShape?.();
      return;
    }
    const ed = editor.current;
    const d = draftRef.current;
    if (!ed || !d) return;
    const shape = ed.value;
    closeEditor();
    setDrawing(null);
    setEditingShape(false);
    const coords = joinSegments(shape);
    const next: Draft = { ...d, geometry: { type: "LineString", coordinates: coords }, props: pieceProps(d.props, shape) };
    setDraft(next);
    if (coords.length >= 2) {
      showPreview(coords, next.category);
      const withHeights = await snapAndElevate(next, { snap: false });
      setDraft((cur) => (cur && cur.id === next.id ? { ...cur, geometry: withHeights.geometry } : cur));
      showPreview(withHeights.geometry.coordinates as number[][], next.category);
    }
  }

  function cancelDraft() {
    map.current?.pm.disableDraw();
    closeEditor();
    setDrawing(null);
    if (drawingLayer.current) {
      map.current?.removeLayer(drawingLayer.current);
      drawingLayer.current = null;
    }
    if (editingShape) setEditingShape(false);
    setDraft(null);
  }

  function editShape() {
    if (!draft || !map.current) return;
    const g = draft.geometry;
    if (g.type === "LineString") {
      // Routes: the pieces come back, each with its tool (DEC-030).
      if (drawingLayer.current) {
        map.current.removeLayer(drawingLayer.current);
        drawingLayer.current = null;
      }
      setTool(defaultTool(draft.category, Boolean(status?.routing)));
      setEditingShape(true);
      openEditor(draft.category, shapeFromLine(g.coordinates as number[][], draft.props.anchorIdx, draft.props.segModes));
      return;
    }
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

  // Current shape of the draft (taking an open shape edit into account).
  function currentGeometry(): MapFeature["geometry"] | null {
    if (!draft) return null;
    if (editor.current) return { type: "LineString", coordinates: joinSegments(editor.current.value) };
    if (editingShape && drawingLayer.current) {
      return roundGeometry((drawingLayer.current as L.Marker | L.Polyline).toGeoJSON().geometry as MapFeature["geometry"]);
    }
    return draft.geometry;
  }

  // "Fit to streets": every piece remade along the streets (on foot, or by
  // car for deliveries), then the route stays open to adjust details.
  function refit() {
    if (!draft || draft.geometry.type !== "LineString") return;
    setError(null);
    if (!editor.current) editShape();
    const streets: SegMode = draft.category === "delivery" ? "d" : "w";
    setTool(streets);
    toolRef.current = streets;
    editor.current?.remakeAll();
  }

  async function addElevation() {
    if (!draft) return;
    const d = await snapAndElevate({ ...draft, geometry: currentGeometry() ?? draft.geometry }, { snap: false });
    setDraft(d);
  }

  async function save() {
    if (!draft) return;
    // No name typed: STRUCTURA names it, e.g. "Recorrido (carrera) 2"; a
    // missing name never blocks saving (Walter lost a course, 2026-10-01).
    const sameType = (items ?? []).filter((f) => f.category === draft.category && f.id !== draft.id).length;
    const label = draft.label.trim() || `${t(`map.cat.${draft.category}` as TextKey)} ${sameType + 1}`;
    let geometry = currentGeometry() ?? draft.geometry;
    let props: FeatureProps = { ...draft.props };
    if (editor.current) props = pieceProps(props, editor.current.value);
    if (geometry.type === "LineString" && geometry.coordinates.length < 2) {
      setError("map.needTwoPoints");
      return;
    }
    // A course keeps its heights: pieces changed since the last fetch get them now.
    if (geometry.type === "LineString" && draft.category === "course" && !(geometry.coordinates as number[][]).every((c) => c.length > 2)) {
      geometry = (await snapAndElevate({ ...draft, geometry }, { snap: false })).geometry;
    }
    if (!(draft.kind === "route" && draft.category === "course")) {
      delete props.laps;
      delete props.outAndBack;
    }
    if (draft.kind !== "route") delete props.snapped;
    if (draft.kind !== "point") {
      delete props.courseId;
      delete props.distanceM;
    }
    const payload = {
      kind: draft.kind,
      category: draft.category,
      label,
      notes: draft.notes.trim() || null,
      preferred: draft.kind === "route" ? draft.preferred : false,
      geometry,
      source: draft.source,
      props,
    };
    setBusy("common.saving");
    setError(null);
    try {
      if (draft.id) await send("PUT", `/api/events/${event.id}/map/${draft.id}`, newCommand(payload, draft.version));
      else await send("POST", `/api/events/${event.id}/map`, newCommand(payload));
      cancelDraft();
      await load();
    } catch (err) {
      const kind = err instanceof ApiError ? err.kind : "internal";
      const tooFar = err instanceof ApiError && typeof err.details?.lengthMeters === "number";
      setError(kind === "license_restricted" ? "map.coursesLocked" : tooFar ? "map.beyondEnd" : kind === "validation" ? "map.badShape" : describeFailure(err).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(t("map.removeConfirm"))) return;
    setBusy("common.saving");
    try {
      await send("POST", `/api/events/${event.id}/map/${draft.id}/remove`, newCommand({}, draft.version));
      cancelDraft();
      await load();
    } catch (err) {
      setError(describeFailure(err).message);
    } finally {
      setBusy(null);
    }
  }

  async function importGpx(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { name, coordinates } = parseGpx(await file.text());
      cancelDraft();
      let d: Draft = {
        id: null,
        version: null,
        kind: "route",
        category: "course",
        label: name ?? file.name.replace(/\.gpx$/i, ""),
        notes: "",
        preferred: false,
        geometry: { type: "LineString", coordinates },
        source: file.name,
        props: {},
      };
      const b = L.latLngBounds(coordinates.map((c) => [c[1]!, c[0]!] as L.LatLngTuple));
      map.current?.fitBounds(b.pad(0.1));
      showPreview(coordinates, "course");
      setDraft(d);
      // A GPX without heights gets them from the elevation service.
      if (!coordinates.every((c) => c.length > 2)) {
        d = await snapAndElevate(d, { snap: false });
        setDraft(d);
      }
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

  // (3) Preview a point placed on a course before saving.
  function placeOnCourse(courseId: string, kmText: string) {
    if (!draft) return;
    if (!courseId) {
      const props = { ...draft.props };
      delete props.courseId;
      delete props.distanceM;
      setDraft({ ...draft, props });
      return;
    }
    const c = courses.find((x) => x.id === courseId);
    const meters = Math.max(0, Number(kmText.replace(",", ".")) * 1000 || 0);
    if (!c) return;
    const [lng, lat] = positionAt(c.geometry.coordinates as number[][], meters);
    const geometry = { type: "Point" as const, coordinates: [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6] };
    if (drawingLayer.current instanceof L.Marker) drawingLayer.current.setLatLng([lat, lng]);
    setDraft({ ...draft, geometry, props: { ...draft.props, courseId, distanceM: meters } });
  }

  // Where a point is along the nearest course (km), linked or close by.
  function kmOf(f: MapFeature): { meters: number; exact: boolean } | null {
    if (f.kind !== "point") return null;
    if (f.props?.courseId && f.props.distanceM !== undefined) return { meters: f.props.distanceM, exact: true };
    let best: { meters: number; offset: number } | null = null;
    for (const c of courses) {
      const p = projectOnLine(c.geometry.coordinates as number[][], f.geometry.coordinates as number[]);
      if (p.offset <= NEAR_COURSE_M && (!best || p.offset < best.offset)) best = { meters: p.distance, offset: p.offset };
    }
    return best ? { meters: best.meters, exact: false } : null;
  }

  const categories = draft?.kind === "route" ? ROUTE_CATEGORIES.filter((c) => c !== "course" || hasCourses) : POINT_CATEGORIES;
  const draftCoords = draft?.geometry.type === "LineString" ? (draft.geometry.coordinates as number[][]) : null;
  const draftLength = draftCoords ? lineLength(draftCoords) : null;
  const isCourse = draft?.kind === "route" && draft.category === "course";
  const profile = isCourse && draftCoords ? elevationProfile(draftCoords) : null;
  const draftTotal = isCourse && draftLength !== null ? courseTotal(draftLength, draft!.props) : null;

  return (
    <section className="card map-full-target" ref={sectionRef}>
      <div className="row between">
        <h3 className="flush">{t("map.title")}</h3>
        {canEdit && (
          <div className="row">
            <button type="button" onClick={() => startDraw("point")}>
              📍 {t("map.addPoint")}
            </button>
            {/* No Area button: a stage or bar storage is a point (Walter, 2026-10-01). */}
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
        <div className="drawing-hint">
          <span>{t(drawing === "point" ? "map.drawPoint" : drawing === "area" ? "map.drawArea" : "map.drawRouteSeg")}</span>
          {drawing === "route" && (
            <>
              {/* The tool for the next piece (DEC-030), like RunningAhead. */}
              <span className="seg-tools" role="group" aria-label={t("map.tool")}>
                {status?.routing &&
                  (["w", "b", "d"] as SegMode[]).map((m) => (
                    <button key={m} type="button" className={tool === m ? "primary" : ""} aria-pressed={tool === m} title={t(TOOL_HINT[m])} onClick={() => setTool(m)}>
                      {TOOL_ICON[m]} {t(TOOL_LABEL[m])}
                    </button>
                  ))}
                <button type="button" className={tool === "l" ? "primary" : ""} aria-pressed={tool === "l"} title={t(TOOL_HINT.l)} onClick={() => setTool("l")}>
                  {TOOL_ICON.l} {t(TOOL_LABEL.l)}
                </button>
              </span>
              <button type="button" disabled={!canUndo} onClick={() => editor.current?.undo()} title="Ctrl+Z">
                ↶ {t("map.undo")}
              </button>
              <button type="button" disabled={!draft || (draft.geometry.coordinates as number[][]).length === 0} onClick={() => window.confirm(t("map.clearConfirm")) && editor.current?.clear()}>
                🧽 {t("map.clearRoute")}
              </button>
              {routeBusy && <span className="small muted">{t("map.snapping")}</span>}
            </>
          )}
          {drawing !== "point" && (
            <button type="button" className="primary" onClick={() => void finishDrawing()}>
              ✓ {t(drawing === "route" ? "map.done" : "map.finish")}
            </button>
          )}
          <button type="button" onClick={cancelDraft}>
            {t("common.cancel")}
          </button>
        </div>
      )}
      <div ref={box} className="map-box tall" />
      {busy && <p className="small muted">{t(busy)}</p>}

      {draft && (
        <div className="map-panel">
          <div className="form grid">
            <label>
              <span>{t("map.type")}</span>
              <select
                value={draft.category}
                disabled={!canEdit}
                onChange={(e) => {
                  const d = { ...draft, category: e.target.value };
                  setDraft(d);
                  // A line turned into a course gets its heights right away
                  // (Walter, 2026-10-01: no Save + "Fit to streets" needed).
                  if (d.category === "course" && d.geometry.type === "LineString") {
                    void snapAndElevate(d, { snap: false }).then((x) => {
                      setDraft((cur) => (cur && cur.category === "course" ? { ...cur, geometry: x.geometry } : cur));
                      if (!editingShape) showPreview(x.geometry.coordinates as number[][], x.category);
                    });
                  }
                }}
              >
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
            {isCourse && (
              <>
                <label>
                  <span>{t("map.laps")}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={draft.props.laps ?? 1}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, props: { ...draft.props, laps: Math.min(50, Math.max(1, Number(e.target.value) || 1)) } })}
                  />
                </label>
                <label className="check">
                  <input type="checkbox" checked={draft.props.outAndBack ?? false} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, props: { ...draft.props, outAndBack: e.target.checked } })} />
                  <span>{t("map.outAndBack")}</span>
                </label>
              </>
            )}
            {draft.kind === "point" && hasCourses && courses.length > 0 && (
              <div className="wide row">
                <label>
                  <span>{t("map.onCourse")}</span>
                  <select value={draft.props.courseId ?? ""} disabled={!canEdit} onChange={(e) => placeOnCourse(e.target.value, String((draft.props.distanceM ?? 0) / 1000))}>
                    <option value="">{t("map.onCourseNone")}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.props.courseId && (
                  <label>
                    <span>{t("map.atKm")}</span>
                    <input
                      inputMode="decimal"
                      defaultValue={String((draft.props.distanceM ?? 0) / 1000)}
                      disabled={!canEdit}
                      onChange={(e) => placeOnCourse(draft.props.courseId!, e.target.value)}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
          {draftLength !== null && (
            <p className="small">
              {t("map.length")}: <strong>{km(draftLength, locale)}</strong>
              {draftTotal !== null && draftTotal !== draftLength && (
                <>
                  {" "}
                  · {t("map.total")}: <strong>{km(draftTotal, locale)}</strong>
                </>
              )}
              {draft.source && <span className="muted"> · {draft.source}</span>}
            </p>
          )}
          {profile && <ElevationChart profile={profile} locale={locale} />}
          {isCourse && !profile && !drawing && <p className="small muted">{t("map.noElevation")}</p>}
          {error && (
            <p className="bad" role="alert">
              {t(error)}
            </p>
          )}
          {canEdit && (
            <div className="row">
              <button type="button" className="primary" disabled={busy !== null || routeBusy} onClick={() => void save()}>
                {busy === "common.saving" ? t("common.saving") : t("common.save")}
              </button>
              {draft.kind === "route" && status?.routing && (
                <button type="button" disabled={busy !== null} onClick={() => void refit()}>
                  🛣 {t("map.snapAgain")}
                </button>
              )}
              {isCourse && !profile && !drawing && status?.elevation && (
                <button type="button" disabled={busy !== null} onClick={() => void addElevation()}>
                  ⛰ {t("map.getElevation")}
                </button>
              )}
              {(draft.id || draft.kind === "route") && !editingShape && !drawing && !draft.props.courseId && (
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
                <th className="num">{t("map.length")} / km</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((f) => {
                const at = kmOf(f);
                return (
                  <tr key={f.id}>
                    <td>
                      <button type="button" className="link" onClick={() => openItem(f)}>
                        {f.kind === "route" ? "〰" : f.kind === "area" ? "⬠" : ICON[f.category]} {f.label}
                      </button>
                      {f.preferred && <span className="tag">{t("map.preferred")}</span>}
                    </td>
                    <td className="small">{t(`map.cat.${f.category}` as TextKey)}</td>
                    <td className="num small">
                      {f.totalMeters !== null && f.totalMeters !== f.lengthMeters
                        ? `${km(f.totalMeters, locale)} (${f.props?.laps ?? 1} × ${km(f.lengthMeters ?? 0, locale)}${f.props?.outAndBack ? " ↔" : ""})`
                        : f.lengthMeters !== null
                          ? km(f.lengthMeters, locale)
                          : at
                            ? `${at.exact ? "km" : t("map.nearKm")} ${(at.meters / 1000).toFixed(2)}`
                            : ""}
                    </td>
                    <td className="row">
                      {f.category === "course" && hasCourses && (
                        <>
                          <button type="button" onClick={() => exportGpx(f)}>
                            ⤓ GPX
                          </button>
                          <a className="button" href={`#/events/${event.id}/course/${f.id}`}>
                            📄 {t("map.sheet")}
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items && items.length === 0 && !draft && <p className="muted small">{t("map.empty")}</p>}
    </section>
  );
}

export function ElevationChart({ profile, locale }: { profile: NonNullable<ReturnType<typeof elevationProfile>>; locale: string }) {
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

export function roundGeometry(g: MapFeature["geometry"]): MapFeature["geometry"] {
  const r = (c: number[]) => c.map((v, i) => (i < 2 ? Math.round(v * 1e6) / 1e6 : v));
  if (g.type === "Point") return { type: "Point", coordinates: r(g.coordinates as number[]) };
  if (g.type === "LineString") return { type: "LineString", coordinates: (g.coordinates as number[][]).map(r) };
  return { type: "Polygon", coordinates: (g.coordinates as number[][][]).map((ring) => ring.map(r)) };
}
