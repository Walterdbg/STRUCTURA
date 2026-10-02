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
  type Waypoint,
} from "@structura/domain";
import { ApiError, get, newCommand, send, type EventRecord, type MapFeature } from "../api.js";
import { addBaseLayers, addFullscreen, type GeoStatus } from "../components/basemap.js";
import { guessPointCategory, parseGpx, toGpx } from "../components/gpx.js";
import { RouteEditor, anchorIndexes, joinSegments, shapeFromLine, type RouteShape, type SegMode } from "../components/routeEditor.js";
import { MapSearch } from "../components/MapSearch.js";
import { addDirectionArrows } from "../components/arrows.js";
import { MARKER_STEPS, METERS, fmtDist, markerLabel, useMarkerStep, useShowMarkers, useUnit, type Unit } from "../components/units.js";
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
export const ROUTE_COLOR: Record<string, string> = { delivery: "#d9480f", pickup: "#0c8599", course: "#7048e8", other: "#1971c2" };
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

const TOOL_ICON: Record<SegMode, string> = { w: "👣", b: "🚲", d: "🚗", m: "🏍", l: "✏️" };
const TOOL_LABEL: Record<SegMode, TextKey> = { w: "map.toolFoot", b: "map.toolBike", d: "map.toolCar", m: "map.toolMoto", l: "map.toolDraw" };
const TOOL_HINT: Record<SegMode, TextKey> = { w: "map.toolFootHint", b: "map.toolBikeHint", d: "map.toolCarHint", m: "map.toolMotoHint", l: "map.toolDrawHint" };

// Walter draws the route himself ("you don't need to find the route, I'm
// creating it"): every route starts with Draw; the street tools are a help
// he switches on to bend a piece onto the street between two of his clicks.
const byCar = (category: string) => category === "delivery" || category === "pickup";
// Google paths are for cars and deliveries (Walter, 2026-10-01): delivery and
// pickup routes offer car and motorcycle and start by car; courses are drawn.
const streetTools = (category: string, routing: boolean): SegMode[] => (routing && byCar(category) ? ["d", "m"] : []);
const defaultTool = (category: string, routing: boolean): SegMode => (routing && byCar(category) ? "d" : "l");

// One street piece from Google, through our server.
async function routeBetween(from: number[], to: number[], mode: "walk" | "bike" | "drive" | "motorcycle"): Promise<{ coordinates: number[][]; fallback?: string }> {
  const res = await fetch("/api/geo/route", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, waypoints: [from, to] }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "internal", body?.message ?? "", body?.details);
  return body as { coordinates: number[][]; fallback?: string };
}

interface RepoItem {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  currentVersion: number;
  lengthMeters: number;
  props: FeatureProps;
  geometry?: { type: "LineString"; coordinates: number[][] };
  waypoints?: Waypoint[];
}

// Laps, out-and-back and the lock belong to courses only.
function routeProps(category: string, props: FeatureProps): FeatureProps {
  const out: FeatureProps = { ...props };
  delete out.courseId;
  delete out.distanceM;
  if (category !== "course") {
    delete out.laps;
    delete out.outAndBack;
    delete out.locked;
  }
  return out;
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
  // A piece drawn straight because the street route went the long way round.
  const [notice, setNotice] = useState<string | null>(null);
  // Maps repository (DEC-033): routes made ahead of time, taken as copies.
  const [repoList, setRepoList] = useState<RepoItem[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // POIs of a GPX loaded into this Event, added as points once its route is saved.
  const pendingPois = useRef<Waypoint[]>([]);
  const statusRef = useRef<GeoStatus | null>(null);
  statusRef.current = status;
  // DEC-031: running courses only on races (and with the courses add-on).
  const isRace = event.eventType === "race";
  const hasCourses = isRace && features.includes("courses");
  // DEC-032 items 1-2: km or miles, and distance markers (viewer's choice).
  const [unit, setUnit] = useUnit();
  const [markerStep, setMarkerStep] = useMarkerStep();
  const [showMarkers, setShowMarkers] = useShowMarkers();
  const hoverMarker = useRef<L.CircleMarker | null>(null);
  const dist = (m: number) => fmtDist(m, unit, locale);
  const unitRef = useRef<Unit>(unit);
  unitRef.current = unit;
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
    void addBaseLayers(m, locale, { map: t("map.layerMap"), satellite: t("map.layerSatellite") }, { races: event.eventType === "race" }).then((s) => setStatus(s));
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

  // A route whose type changes keeps only the tools that type offers.
  useEffect(() => {
    if (drawing !== "route" || !draft) return;
    if (tool !== "l" && !streetTools(draft.category, Boolean(status?.routing)).includes(tool)) setTool(defaultTool(draft.category, Boolean(status?.routing)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.category, drawing]);

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
          addDirectionArrows(g, coords, ROUTE_COLOR.course!);
          for (const mk of showMarkers ? markersAlong(coords, markerStep * METERS[unit]) : []) {
            L.marker([mk.position[1], mk.position[0]], {
              icon: L.divIcon({ className: "km-marker", html: markerLabel(mk.distance, unit), iconSize: [24, 24], iconAnchor: [12, 12] }),
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
      if (b.isValid()) m.fitBounds(b.pad(0.2), { maxZoom: 17, animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, editingShape, unit, markerStep, showMarkers]);

  // DEC-032 item 7: zoom the map to a route or course.
  function centreOn(geom: MapFeature["geometry"]) {
    if (geom.type !== "LineString" || (geom.coordinates as number[][]).length < 2) return;
    const b = L.latLngBounds((geom.coordinates as number[][]).map((c) => [c[1]!, c[0]!] as L.LatLngTuple));
    map.current?.fitBounds(b.pad(0.1), { animate: false });
  }

  // DEC-032 item 8: the spot on the course under the mouse in the elevation chart.
  function showHover(coords: number[][] | null, at: { distance: number; elevation: number } | null) {
    const m = map.current;
    if (!m) return;
    if (!coords || !at) {
      hoverMarker.current?.remove();
      hoverMarker.current = null;
      return;
    }
    const [lng, lat] = positionAt(coords, at.distance);
    const text = `${dist(at.distance)} · ${Math.round(at.elevation)} m`;
    if (!hoverMarker.current) {
      hoverMarker.current = L.circleMarker([lat, lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#e8590c", fillOpacity: 1, interactive: false }).addTo(m);
      hoverMarker.current.bindTooltip(text, { permanent: true, direction: "top", offset: [0, -8] });
    } else {
      hoverMarker.current.setLatLng([lat, lng]);
      hoverMarker.current.setTooltipContent(text);
    }
  }

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
    // Every item opens zoomed onto itself (Walter, 2026-10-01).
    const m = map.current;
    if (!m) return;
    if (f.geometry.type === "Point") {
      const [lng, lat] = f.geometry.coordinates as number[];
      m.setView([lat!, lng!], Math.max(m.getZoom(), 17), { animate: false });
    } else {
      const pts = f.geometry.type === "Polygon" ? (f.geometry.coordinates as number[][][])[0]! : (f.geometry.coordinates as number[][]);
      if (pts.length) m.fitBounds(L.latLngBounds(pts.map((c) => [c[1]!, c[0]!] as L.LatLngTuple)).pad(0.15), { animate: false });
    }
  }

  // The route editor on the map: new route (no shape) or a saved one.
  function openEditor(category: string, shape: RouteShape | undefined) {
    const m = map.current;
    if (!m) return;
    editor.current?.stop();
    const ed = new RouteEditor(m, {
      color: ROUTE_COLOR[category] ?? "#1971c2",
      route: statusRef.current?.routing
        ? async (from, to, mode) => {
            const r = await routeBetween(from, to, mode);
            if (r.fallback === "drive") setNotice(t("map.motoFallback"));
            return r.coordinates;
          }
        : null,
      mode: () => toolRef.current,
      onBusy: (b) => setRouteBusy(b),
      onRouteFailed: () => setNotice(t("map.noRoute")),
      onDetour: (routed, direct) =>
        setNotice(t("map.detour").replace("{routed}", fmtDist(routed, unitRef.current, locale)).replace("{direct}", fmtDist(direct, unitRef.current, locale))),
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
    setNotice(null);
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
    const streets: SegMode = "d";
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
      // A GPX's points of interest arrive with its route.
      if (!draft.id && pendingPois.current.length) {
        const n = await addPois(pendingPois.current);
        if (n) setInfo(t("repo.addedPois").replace("{n}", String(n)));
      }
      pendingPois.current = [];
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

  // DEC-033: the repository's routes this Event can use (courses only on races).
  async function openRepository() {
    setInfo(null);
    try {
      const r = await get<{ items: RepoItem[] }>("/api/repository/routes");
      setRepoList(r.items.filter((x) => x.category !== "course" || hasCourses));
    } catch (err) {
      setError(describeFailure(err).message);
    }
  }

  // A route's points of interest become Event points (water stations,
  // restrooms, start, finish...), typed from their names.
  async function addPois(pois: Waypoint[]): Promise<number> {
    let n = 0;
    for (const w of pois) {
      const payload = {
        kind: "point",
        category: guessPointCategory(w),
        label: w.name,
        notes: null,
        preferred: false,
        geometry: { type: "Point", coordinates: [w.coordinates[0], w.coordinates[1]] },
        source: null,
        props: {},
      };
      try {
        await send("POST", `/api/events/${event.id}/map`, newCommand(payload));
        n++;
      } catch {
        /* a point that can't be saved doesn't stop the others */
      }
    }
    return n;
  }

  // Take a repository route into this Event as its own copy.
  async function useFromRepository(item: RepoItem) {
    try {
      const full = await get<RepoItem>(`/api/repository/routes/${item.id}`);
      const payload = {
        kind: "route",
        category: full.category,
        label: full.name,
        notes: full.notes,
        preferred: false,
        geometry: full.geometry,
        source: `${t("repo.fromRepo")}: ${full.name} v${full.currentVersion}`.slice(0, 300),
        props: routeProps(full.category, full.props ?? {}),
      };
      await send("POST", `/api/events/${event.id}/map`, newCommand(payload));
      setRepoList(null);
      const n = full.waypoints?.length ? await addPois(full.waypoints) : 0;
      setInfo(n ? t("repo.addedPois").replace("{n}", String(n)) : t("repo.added"));
      await load();
      if (full.geometry) centreOn(full.geometry);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === "license_restricted" ? "map.coursesLocked" : describeFailure(err).message);
    }
  }

  // Keep an Event route in the repository for other Events (a new route there).
  async function saveToRepository() {
    if (!draft || draft.kind !== "route") return;
    const geometry = currentGeometry() ?? draft.geometry;
    if (geometry.type !== "LineString" || geometry.coordinates.length < 2) return setError("map.needTwoPoints");
    const payload = {
      name: draft.label.trim() || t(`map.cat.${draft.category}` as TextKey),
      category: draft.category,
      notes: draft.notes.trim() || null,
      geometry,
      props: routeProps(draft.category, draft.props),
      source: `${t("nav.events")}: ${event.designation}`.slice(0, 300),
    };
    try {
      await send("POST", "/api/repository/routes", newCommand(payload));
      setInfo(t("repo.savedToRepo"));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === "license_restricted" ? "map.coursesLocked" : describeFailure(err).message);
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
      const { name, coordinates, waypoints } = parseGpx(await file.text());
      cancelDraft();
      pendingPois.current = waypoints;
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
      map.current?.fitBounds(b.pad(0.1), { animate: false });
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
              🚚 {t("map.addRoute")}
            </button>
            <button type="button" onClick={() => startDraw("route", "pickup")}>
              ↩ {t("map.addPickup")}
            </button>
            <button type="button" title={t("repo.pick")} onClick={() => void openRepository()}>
              📚 {t("repo.fromRepo")}
            </button>
            {/* DEC-031: no course tools on a rental Event. */}
            {!isRace ? null : hasCourses ? (
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
      {info && (
        <p className="good small" role="status">
          {info}
        </p>
      )}
      {repoList && (
        <div className="map-panel">
          <div className="row between">
            <strong>{t("repo.pick")}</strong>
            <button type="button" onClick={() => setRepoList(null)}>
              {t("common.cancel")}
            </button>
          </div>
          {repoList.length === 0 ? (
            <p className="muted small">{t("repo.noneFit")}</p>
          ) : (
            <table>
              <tbody>
                {repoList.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.category === "course" ? "🏃" : r.category === "pickup" ? "↩" : "🚚"} {r.name}
                    </td>
                    <td className="small">{t(`map.cat.${r.category}` as TextKey)}</td>
                    <td className="num small">{dist(r.lengthMeters)}</td>
                    <td className="small">v{r.currentVersion}</td>
                    <td>
                      <button type="button" className="primary" onClick={() => void useFromRepository(r)}>
                        ➕ {t("common.add")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="row between map-tools">
        <p className="muted small flush">{canEdit ? t(isRace ? "map.hint" : "map.hintRental") : t("map.viewOnly")}</p>
        <div className="row">
          <MapSearch onPick={(lat, lng) => map.current?.setView([lat, lng], 17)} />
          {/* DEC-032 items 1-2: units and distance markers. */}
          <select aria-label={t("map.unit")} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
          {hasCourses && (
            <>
              <label className="check">
                <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
                <span>{t("map.markers")}</span>
              </label>
              <select aria-label={t("map.markerEvery")} value={markerStep} onChange={(e) => setMarkerStep(Number(e.target.value))} disabled={!showMarkers}>
                {MARKER_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {t("map.every")} {s} {unit}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      {drawing && (
        <div className="drawing-hint">
          <span>{t(drawing === "point" ? "map.drawPoint" : drawing === "area" ? "map.drawArea" : "map.drawRouteSeg")}</span>
          {drawing === "route" && (
            <>
              {/* The tool for the next piece (DEC-030), like RunningAhead. */}
              <span className="seg-tools" role="group" aria-label={t("map.tool")}>
                {streetTools(draft?.category ?? "", Boolean(status?.routing)).map((m) => (
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
              {/* DEC-032 items 3-5, for courses. */}
              {draft?.category === "course" && (
                <>
                  <button type="button" title={t("map.backToStartHint")} disabled={(draft.geometry.coordinates as number[][]).length < 2} onClick={() => editor.current?.closeLoop()}>
                    ↻ {t("map.backToStart")}
                  </button>
                  <button type="button" title={t("map.outAndBackHint")} disabled={(draft.geometry.coordinates as number[][]).length < 2} onClick={() => editor.current?.outAndBack()}>
                    ⇆ {t("map.outAndBackDraw")}
                  </button>
                  <button type="button" title={t("map.reverseHint")} disabled={(draft.geometry.coordinates as number[][]).length < 2} onClick={() => editor.current?.reverse()}>
                    ⇄ {t("map.reverse")}
                  </button>
                </>
              )}
              {/* DEC-032 item 1: the distance, always in view while drawing. */}
              <strong className="live-dist">{dist(lineLength((draft?.geometry.coordinates as number[][]) ?? []))}</strong>
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
      {notice && drawing === "route" && (
        <p className="alert warn small" role="status">
          ⚠️ {notice}{" "}
          <button type="button" className="link" onClick={() => setNotice(null)} aria-label="OK">
            ✕
          </button>
        </p>
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
                {/* Older courses only: out-and-back is now drawn on the map (DEC-032 item 4). */}
                {draft.props.outAndBack && (
                  <label className="check">
                    <input type="checkbox" checked disabled={!canEdit} onChange={() => setDraft({ ...draft, props: { ...draft.props, outAndBack: false } })} />
                    <span>{t("map.outAndBack")}</span>
                  </label>
                )}
                {/* DEC-032 item 6: a final course is locked against changes. */}
                {draft.id && (
                  <label className="check">
                    <input type="checkbox" checked={draft.props.locked ?? false} disabled={!canEdit || Boolean(drawing)} onChange={(e) => setDraft({ ...draft, props: { ...draft.props, locked: e.target.checked } })} />
                    <span>🔒 {t("map.locked")}</span>
                  </label>
                )}
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
              {t("map.length")}: <strong>{dist(draftLength)}</strong>
              {draftTotal !== null && draftTotal !== draftLength && (
                <>
                  {" "}
                  · {t("map.total")}: <strong>{dist(draftTotal)}</strong>
                </>
              )}
              {draft.source && <span className="muted"> · {draft.source}</span>}
            </p>
          )}
          {profile && <ElevationChart profile={profile} locale={locale} unit={unit} onHover={(at) => showHover(draftCoords, at)} />}
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
              {draft.kind === "route" && (draftCoords?.length ?? 0) >= 2 && (
                <button type="button" title={t("map.centreHint")} onClick={() => draft && centreOn(draft.geometry)}>
                  ⊙ {t("map.centre")}
                </button>
              )}
              {draft.kind === "route" && byCar(draft.category) && status?.routing && !draft.props.locked && (
                <button type="button" disabled={busy !== null} onClick={() => void refit()}>
                  🛣 {t("map.snapAgain")}
                </button>
              )}
              {isCourse && !profile && !drawing && status?.elevation && (
                <button type="button" disabled={busy !== null} onClick={() => void addElevation()}>
                  ⛰ {t("map.getElevation")}
                </button>
              )}
              {(draft.id || draft.kind === "route") && !editingShape && !drawing && !draft.props.courseId && !draft.props.locked && (
                <button type="button" onClick={editShape}>
                  ✎ {t("map.editShape")}
                </button>
              )}
              {draft.id && draft.kind === "route" && !drawing && (
                <button type="button" title={t("repo.toRepo")} onClick={() => void saveToRepository()}>
                  📚 {t("repo.toRepo")}
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
              {items.map((f) => {
                const at = kmOf(f);
                return (
                  <tr key={f.id}>
                    <td>
                      <button type="button" className="link" onClick={() => openItem(f)}>
                        {f.kind === "route" ? "〰" : f.kind === "area" ? "⬠" : ICON[f.category]} {f.label}
                      </button>
                      {f.preferred && <span className="tag">{t("map.preferred")}</span>}
                      {f.props?.locked && <span className="tag" title={t("map.locked")}>🔒</span>}
                    </td>
                    <td className="small">{t(`map.cat.${f.category}` as TextKey)}</td>
                    <td className="num small">
                      {f.totalMeters !== null && f.totalMeters !== f.lengthMeters
                        ? `${dist(f.totalMeters)} (${f.props?.laps ?? 1} × ${dist(f.lengthMeters ?? 0)}${f.props?.outAndBack ? " ↔" : ""})`
                        : f.lengthMeters !== null
                          ? dist(f.lengthMeters)
                          : at
                            ? `${at.exact ? "" : `${t("map.nearKm")} `}${dist(at.meters)}`
                            : ""}
                    </td>
                    <td className="row">
                      {f.kind === "route" && (
                        <button type="button" title={t("map.centreHint")} onClick={() => centreOn(f.geometry)}>
                          ⊙
                        </button>
                      )}
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

export function ElevationChart({
  profile,
  locale,
  unit = "km",
  onHover,
}: {
  profile: NonNullable<ReturnType<typeof elevationProfile>>;
  locale: string;
  unit?: Unit;
  // DEC-032 item 8: where the mouse is along the course (null when it leaves).
  onHover?: (at: { distance: number; elevation: number } | null) => void;
}) {
  const t = useT();
  const [hover, setHover] = useState<{ x: number; distance: number; elevation: number } | null>(null);
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
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("map.elevation")}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const d = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * maxD;
          // The nearest measured point at that distance.
          let best = pts[0]!;
          for (const p of pts) if (Math.abs(p.distance - d) < Math.abs(best.distance - d)) best = p;
          setHover({ x: (best.distance / maxD) * w, distance: best.distance, elevation: best.elevation });
          onHover?.({ distance: best.distance, elevation: best.elevation });
        }}
        onMouseLeave={() => {
          setHover(null);
          onHover?.(null);
        }}
      >
        <path d={`${path} L${w},${h} L0,${h} Z`} className="area" />
        <path d={path} className="line" />
        {hover && <line x1={hover.x} x2={hover.x} y1={0} y2={h} className="cursor" />}
      </svg>
      <p className="small">
        {hover ? (
          <strong>
            {fmtDist(hover.distance, unit, locale)} · {Math.round(hover.elevation)} m
          </strong>
        ) : (
          <>
            {t("map.elevation")}: {Math.round(lo)}–{Math.round(hi)} m · ↑ {Math.round(profile.gain)} m · ↓ {Math.round(profile.loss)} m · {fmtDist(maxD, unit, locale)}
          </>
        )}
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
