import { useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { elevationProfile, lineLength, markersAlong, type FeatureProps, type Waypoint } from "@structura/domain";
import { ApiError, get, newCommand, send } from "../api.js";
import { addBaseLayers, addFullscreen, geoStatus, type GeoStatus } from "../components/basemap.js";
import { guessPointCategory, parseGpx } from "../components/gpx.js";
import { MapSearch } from "../components/MapSearch.js";
import { addDirectionArrows } from "../components/arrows.js";
import { RouteEditor, anchorIndexes, joinSegments, shapeFromLine, type RouteShape, type SegMode } from "../components/routeEditor.js";
import { MARKER_STEPS, METERS, fmtDist, markerLabel, useMarkerStep, useShowMarkers, usePref, useUnit, type Unit } from "../components/units.js";
import { describeFailure } from "../forms.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";
import { go } from "../router.js";
import { ElevationChart, ICON, ROUTE_COLOR } from "./EventMap.js";

// Maps section (DEC-033): a repository of routes made ahead of time - race
// courses, delivery and pickup routes - outside any Event. Every save is a
// new version kept as a GPX file. Events take a route as their own copy.

export interface RepoRoute {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  currentVersion: number;
  version: number;
  lengthMeters: number;
  geometry?: { type: "LineString"; coordinates: number[][] };
  props: FeatureProps;
  // The course's points of interest (from its GPX; Racemap's visible ones).
  waypoints?: Waypoint[];
  waypointCount?: number;
  // General location, to group the library (country > area > place).
  country?: string | null;
  area?: string | null;
  place?: string | null;
  // Platform view (DEC-039): which organization the course belongs to.
  organization?: string;
  updatedAt: string;
  versions?: { version: number; lengthMeters: number; source: string | null; createdAt: string; createdBy: string | null }[];
}

const CATS = ["course", "delivery", "pickup", "other"] as const;
const CAT_ICON: Record<string, string> = { course: "🏃", delivery: "🚚", pickup: "↩", other: "〰" };
const byCar = (c: string) => c === "delivery" || c === "pickup";
const TOOL_ICON: Record<SegMode, string> = { w: "👣", b: "🚲", d: "🚗", m: "🏍", l: "✏️" };
const TOOL_LABEL: Record<SegMode, TextKey> = { w: "map.toolFoot", b: "map.toolBike", d: "map.toolCar", m: "map.toolMoto", l: "map.toolDraw" };

// Dates the way each language writes them: dd/mm/aaaa, mm/dd/yyyy (D-006).
const showDate = (iso: string, locale: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return locale === "es" ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` : `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
};

// ------------------------------------------------------------------ list
// platform: the platform administrator's read-only view of every
// organization's courses (DEC-039).
export function RepositoryList({ canEdit, features, platform = false }: { canEdit: boolean; features: string[]; platform?: boolean }) {
  const apiBase = platform ? "/api/platform/routes" : "/api/repository/routes";
  const linkBase = platform ? "#/platform" : "#/maps";
  const t = useT();
  const locale = useContext(LocaleContext);
  const [unit] = useUnit();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<RepoRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCourses = features.includes("courses");
  const [uploading, setUploading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  // Compact list (Walter, 2026-10-01): groups fold and unfold; remembered.
  const [folded, setFolded] = usePref<string[]>(platform ? "structura.platformFolded" : "structura.repoFolded", [], (v) => Array.isArray(v));

  // Upload a GPX straight into the repository (version 1) and open it. Only
  // the line and its place are loaded: it starts as a plain route and its
  // type is chosen afterwards, so a race map can be reused for deliveries,
  // water stations or course signs (Walter, 2026-10-01).
  async function uploadGpx(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const g = parseGpx(await file.text());
      // Heights come later, when it is made a course and saved.
      const payload = { name: g.name ?? file.name.replace(/\.gpx$/i, ""), category: "other", notes: null, geometry: { type: "LineString", coordinates: g.coordinates }, props: {}, source: file.name, waypoints: g.waypoints };
      const r = await send<RepoRoute>("POST", "/api/repository/routes", newCommand(payload));
      go(`/maps/${r.result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? describeFailure(err).message : t("map.gpxInvalid"));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      get<{ items: RepoRoute[] }>(`${apiBase}?search=${encodeURIComponent(search)}`).then(
        (r) => (setItems(r.items), setError(null)),
        (err) => setError(describeFailure(err).message)
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <section className="card">
      <div className="row between">
        <h2>{t(platform ? "platform.title" : "repo.title")}</h2>
        {canEdit && !platform && (
          <div className="row">
            <label className="button file primary" title={t("repo.importHint")}>
              ⤒ {uploading ? t("common.saving") : t("repo.importGpx")}
              <input type="file" accept=".gpx,application/gpx+xml" disabled={uploading} onChange={(e) => (void uploadGpx(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
            {hasCourses && (
              <a className="button" href="#/maps/new?cat=course">
                🏃 {t("repo.newCourse")}
              </a>
            )}
            <a className="button" href="#/maps/new?cat=delivery">
              🚚 {t("repo.newDelivery")}
            </a>
            <a className="button" href="#/maps/new?cat=pickup">
              ↩ {t("repo.newPickup")}
            </a>
          </div>
        )}
      </div>
      <p className="muted small">{t(platform ? "platform.hint" : "repo.hint")}</p>
      <div className="row">
        <input type="search" className="search" placeholder={t("repo.search")} aria-label={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t("map.type")} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">{t("repo.allTypes")}</option>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {CAT_ICON[c]} {t(`map.cat.${c}` as TextKey)}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="bad">{error}</p>}
      {items === null && !error && <p>{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{search ? t("common.noResults") : t("repo.empty")}</p>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          {(() => {
            const all = [...new Set(items.map(whereOf))];
            return (
              <div className="row compact-tools">
                <button type="button" onClick={() => setFolded(all)}>
                  ▸ {t("repo.foldAll")}
                </button>
                <button type="button" onClick={() => setFolded([])}>
                  ▾ {t("repo.unfoldAll")}
                </button>
              </div>
            );
          })()}
          <table className="compact">
            <thead>
              <tr>
                <th>{t("map.label")}</th>
                <th>{t("map.type")}</th>
                <th className="num">{t("map.length")}</th>
                <th>{t("repo.version")}</th>
                <th>{t("repo.updated")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items
                .filter((r) => !typeFilter || r.category === typeFilter)
                .flatMap((r, i, list) => {
                  // A heading row when the general location changes (country > area > place);
                  // a click folds or unfolds that group.
                  const where = whereOf(r);
                  const prev = i > 0 ? whereOf(list[i - 1]!) : null;
                  const isFolded = folded.includes(where);
                  const rows = [];
                  if (where !== prev) {
                    const count = list.filter((x) => whereOf(x) === where).length;
                    rows.push(
                      <tr key={`h-${r.id}`} className="group-row" onClick={() => setFolded(isFolded ? folded.filter((w) => w !== where) : [...folded, where])}>
                        <td colSpan={6}>
                          {isFolded ? "▸" : "▾"} 📍 {where} <span className="muted">({count})</span>
                        </td>
                      </tr>
                    );
                  }
                  if (!isFolded) rows.push(row(r));
                  return rows;
                })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  function whereOf(r: RepoRoute) {
    return [r.country, r.area, r.place].filter(Boolean).join(" › ") || t("repo.noLocation");
  }

  function row(r: RepoRoute) {
    return (
                <tr key={r.id}>
                  <td>
                    <a href={`${linkBase}/${r.id}`}>
                      {CAT_ICON[r.category]} {r.name}
                    </a>
                    {r.props?.locked && <span className="tag">🔒</span>}
                    {platform && r.organization && <span className="tag">🏢 {r.organization}</span>}
                  </td>
                  <td className="small">{t(`map.cat.${r.category}` as TextKey)}</td>
                  <td className="num">{fmtDist(r.lengthMeters, unit, locale)}</td>
                  <td>v{r.currentVersion}</td>
                  <td className="small">{showDate(r.updatedAt, locale)}</td>
                  <td>
                    <a className="icon-link" href={`${apiBase}/${r.id}/gpx`} download title={t("repo.downloadGpx")} aria-label={t("repo.downloadGpx")}>
                      ⤓
                    </a>
                  </td>
                </tr>
    );
  }
}

// ------------------------------------------------------------------ editor
export function RepositoryRouteEditor({
  routeId,
  newCategory,
  canEdit: canEditProp,
  features,
  platform = false,
}: {
  routeId?: string;
  newCategory?: string;
  canEdit: boolean;
  features: string[];
  platform?: boolean;
}) {
  // The platform view is read-only: the course belongs to its organization.
  const canEdit = canEditProp && !platform;
  const apiBase = platform ? "/api/platform/routes" : "/api/repository/routes";
  const t = useT();
  const locale = useContext(LocaleContext);
  const [unit, setUnit] = useUnit();
  const [markerStep, setMarkerStep] = useMarkerStep();
  const [showMarkers, setShowMarkers] = useShowMarkers();
  const unitRef = useRef<Unit>(unit);
  unitRef.current = unit;
  const box = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const map = useRef<L.Map | null>(null);
  const viewLayer = useRef<L.LayerGroup | null>(null);
  const hover = useRef<L.CircleMarker | null>(null);
  const editor = useRef<RouteEditor | null>(null);
  const [status, setStatus] = useState<GeoStatus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [record, setRecord] = useState<RepoRoute | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(newCategory && (CATS as readonly string[]).includes(newCategory) ? newCategory : "course");
  const [notes, setNotes] = useState("");
  const [props, setProps] = useState<FeatureProps>({});
  const [coords, setCoords] = useState<number[][]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [loc, setLoc] = useState<{ country: string; area: string; place: string }>({ country: "", area: "", place: "" });
  const [known, setKnown] = useState<{ country: string[]; area: string[]; place: string[] }>({ country: [], area: [], place: [] });
  const poiLayer = useRef<L.LayerGroup | null>(null);
  const [drawing, setDrawing] = useState(!routeId);
  const [tool, setTool] = useState<SegMode>("l");
  const toolRef = useRef<SegMode>("l");
  toolRef.current = tool;
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guides, setGuides] = useState<RepoRoute[]>([]);
  const [guideId, setGuideId] = useState("");
  const guideLayer = useRef<L.Polyline | null>(null);
  const isCourse = category === "course";
  const dist = (m: number) => fmtDist(m, unit, locale);
  const tools: SegMode[] = status?.routing && byCar(category) ? ["d", "m", "l"] : ["l"];

  // Load an existing route.
  useEffect(() => {
    if (!routeId) return;
    get<RepoRoute>(`${apiBase}/${routeId}`).then(
      (r) => {
        setRecord(r);
        setName(r.name);
        setCategory(r.category);
        setNotes(r.notes ?? "");
        setProps(r.props ?? {});
        setCoords(r.geometry?.coordinates ?? []);
        setWaypoints(r.waypoints ?? []);
        setLoc({ country: r.country ?? "", area: r.area ?? "", place: r.place ?? "" });
      },
      (err) => setMsg({ ok: false, text: describeFailure(err).message })
    );
  }, [routeId]);

  // The map, once its type is known (ArcGIS pictures only for courses).
  const typeKnown = !routeId || record !== null;
  useEffect(() => {
    if (!box.current || map.current || !typeKnown) return;
    const m = L.map(box.current, { scrollWheelZoom: true }).setView([8.98, -79.52], 13);
    void addBaseLayers(m, locale, { map: t("map.layerMap"), satellite: t("map.layerSatellite") }, { races: category === "course" }).then((s) => setStatus(s));
    if (sectionRef.current) addFullscreen(m, sectionRef.current, { enter: t("map.fullscreen"), exit: t("map.exitFullscreen") });
    viewLayer.current = L.layerGroup().addTo(m);
    void get<{ items: RepoRoute[] }>(apiBase).then((r) => {
      setGuides(r.items);
      const uniq = (k: "country" | "area" | "place") => [...new Set(r.items.map((i) => i[k]).filter((v): v is string => Boolean(v)))].sort();
      setKnown({ country: uniq("country"), area: uniq("area"), place: uniq("place") });
    }, () => {});
    map.current = m;
    map.current = m;
    setMapReady(true);
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeKnown]);

  // A new route starts in drawing mode, with the tool its type offers.
  useEffect(() => {
    void geoStatus().then((s) => {
      setTool(s.routing && byCar(category) ? "d" : "l");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (drawing && map.current && !editor.current) startEditor(routeId ? shapeFromLine(coords, props.anchorIdx, props.segModes) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, status, mapReady]);

  // The saved line (not editing): line, distance markers, start and finish.
  useEffect(() => {
    const g = viewLayer.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    if (drawing || coords.length < 2) return;
    const line = L.polyline(coords.map((c) => [c[1]!, c[0]!] as L.LatLngTuple), { color: ROUTE_COLOR[category] ?? "#1971c2", weight: 5 }).addTo(g);
    addDirectionArrows(g, coords, ROUTE_COLOR[category] ?? "#1971c2");
    if (isCourse && showMarkers) {
      for (const mk of markersAlong(coords, markerStep * METERS[unit])) {
        L.marker([mk.position[1], mk.position[0]], { icon: L.divIcon({ className: "km-marker", html: markerLabel(mk.distance, unit), iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false }).addTo(g);
      }
    }
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    L.marker([first[1]!, first[0]!], { icon: L.divIcon({ className: "flag-marker", html: "▶", iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(g);
    L.marker([last[1]!, last[0]!], { icon: L.divIcon({ className: "flag-marker finish", html: "🏁", iconSize: [26, 26], iconAnchor: [4, 22] }) }).addTo(g);
    // Fit the course once the map has its real size (a map laid out while
    // hidden measures 0 and would show the whole world).
    let fitted = false;
    const fit = () => {
      m.invalidateSize();
      if (m.getSize().x > 0 && m.getSize().y > 0) {
        m.fitBounds(line.getBounds().pad(0.15), { animate: false });
        fitted = true;
      }
    };
    fit();
    const ro = new ResizeObserver(() => {
      if (!fitted) fit();
    });
    ro.observe(m.getContainer());
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, drawing, unit, markerStep, showMarkers, category, mapReady]);

  // Points of interest (water stations, restrooms, start, finish...), also
  // while drawing.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    poiLayer.current ??= L.layerGroup().addTo(m);
    poiLayer.current.clearLayers();
    for (const w of waypoints) {
      L.marker([w.coordinates[1]!, w.coordinates[0]!], {
        icon: L.divIcon({ className: "poi-icon", html: ICON[guessPointCategory(w)] ?? "📍", iconSize: [26, 26], iconAnchor: [13, 13] }),
        keyboard: false,
      })
        .bindTooltip(w.name, { direction: "top" })
        .addTo(poiLayer.current);
    }
  }, [waypoints, mapReady]);

  // The guide line: faint, dashed, not clickable; only to trace along.
  useEffect(() => {
    const m = map.current;
    guideLayer.current?.remove();
    guideLayer.current = null;
    if (!m || !guideId) return;
    void get<RepoRoute>(`${apiBase}/${guideId}`).then((g) => {
      const c = g.geometry?.coordinates ?? [];
      if (c.length < 2 || !map.current) return;
      guideLayer.current = L.polyline(c.map((x) => [x[1]!, x[0]!] as L.LatLngTuple), { color: "#868e96", weight: 7, opacity: 0.55, dashArray: "6 8", interactive: false }).addTo(map.current);
      guideLayer.current.bringToBack();
      if (coords.length < 2) map.current.fitBounds(guideLayer.current.getBounds().pad(0.15), { animate: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId, mapReady]);

  function startEditor(shape?: RouteShape) {
    const m = map.current;
    if (!m) return;
    editor.current?.stop();
    const ed = new RouteEditor(m, {
      color: ROUTE_COLOR[category] ?? "#1971c2",
      route: status?.routing
        ? async (from, to, mode) => {
            const res = await fetch("/api/geo/route", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, waypoints: [from, to] }) });
            const body = await res.json();
            if (!res.ok) throw new ApiError(res.status, body?.error ?? "internal", body?.message ?? "", body?.details);
            if (body.fallback === "drive") setNotice(t("map.motoFallback"));
            return body.coordinates as number[][];
          }
        : null,
      mode: () => toolRef.current,
      onBusy: (b) => setBusy(b ? "map.snapping" : null),
      onRouteFailed: () => setNotice(t("map.noRoute")),
      onDetour: (r, d) => setNotice(t("map.detour").replace("{routed}", fmtDist(r, unitRef.current, locale)).replace("{direct}", fmtDist(d, unitRef.current, locale))),
      onChange: (s) => {
        setCanUndo(ed.canUndo);
        setCoords(joinSegments(s));
        setProps((p) => withPieces(p, s));
      },
    });
    ed.start(shape);
    editor.current = ed;
    if (shape && shape.anchors.length) m.fitBounds(L.latLngBounds(shape.anchors.map((a) => [a[1]!, a[0]!] as L.LatLngTuple)).pad(0.15), { animate: false });
  }

  function withPieces(p: FeatureProps, s: RouteShape): FeatureProps {
    const out: FeatureProps = { ...p };
    delete out.anchorIdx;
    delete out.segModes;
    if (s.segments.length) {
      out.anchorIdx = anchorIndexes(s);
      out.segModes = s.segments.map((g) => g.mode);
      out.snapped = s.segments.some((g) => g.mode !== "l");
    }
    return out;
  }

  // Heights for a course whose line has none of its own. Native heights
  // (open public data, DEC-040) become part of the course and its GPX;
  // Google heights could only be shown (P-023).
  const [liveCoords, setLiveCoords] = useState<number[][] | null>(null);
  useEffect(() => {
    setLiveCoords(null);
    if (!isCourse || drawing || coords.length < 2 || coords.every((x) => x.length > 2) || !status?.elevation) return;
    let live = true;
    void fetch("/api/geo/elevation", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ coordinates: coords.map((x) => [x[0], x[1]]) }) })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!live || !body) return;
        if (body.storable) setCoords(body.coordinates as number[][]);
        else setLiveCoords(body.coordinates as number[][]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [coords, isCourse, drawing, status?.elevation]);

  async function done() {
    editor.current?.stop();
    editor.current = null;
    setDrawing(false);
    setNotice(null);
  }

  async function importGpx(file: File | undefined) {
    if (!file) return;
    try {
      const g = parseGpx(await file.text());
      editor.current?.stop();
      editor.current = null;
      setDrawing(false);
      if (!name) setName(g.name ?? file.name.replace(/\.gpx$/i, ""));
      setSource(file.name);
      setWaypoints(g.waypoints);
      setProps((p) => {
        const out = { ...p };
        delete out.anchorIdx;
        delete out.segModes;
        return out;
      });
      setCoords(g.coordinates);
    } catch {
      setMsg({ ok: false, text: t("map.gpxInvalid") });
    }
  }

  async function save(asNew = false) {
    if (coords.length < 2) return setMsg({ ok: false, text: t("map.needTwoPoints") });
    let c = coords;
    // A course is saved with native heights when it has none of its own.
    if (isCourse && c.length >= 2 && !c.every((x) => x.length > 2) && status?.elevation) {
      try {
        const res = await fetch("/api/geo/elevation", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ coordinates: c.map((x) => [x[0], x[1]]) }) });
        const body = res.ok ? await res.json() : null;
        if (body?.storable) c = body.coordinates as number[][];
      } catch {
        /* saved without heights; the chart fetches them when shown */
      }
    }
    const p: FeatureProps = { ...props };
    if (!isCourse) {
      delete p.laps;
      delete p.outAndBack;
      delete p.locked;
    }
    const payload = {
      name: (asNew ? `${name.trim() || t(`map.cat.${category}` as TextKey)} (${t("repo.copy")})` : name.trim()) || t(`map.cat.${category}` as TextKey),
      category,
      notes: notes.trim() || null,
      geometry: { type: "LineString", coordinates: c },
      props: asNew ? { ...p, locked: undefined } : p,
      source: asNew && record ? `${record.name} v${record.currentVersion}` : source,
      waypoints,
      country: loc.country.trim() || null,
      area: loc.area.trim() || null,
      place: loc.place.trim() || null,
    };
    setBusy("common.saving");
    try {
      const res =
        record && !asNew
          ? await send<RepoRoute>("PUT", `/api/repository/routes/${record.id}`, newCommand(payload, record.version))
          : await send<RepoRoute>("POST", "/api/repository/routes", newCommand(payload));
      editor.current?.stop();
      editor.current = null;
      setDrawing(false);
      setMsg({ ok: true, text: `${t("common.saved")} · v${res.result.currentVersion}` });
      go(`/maps/${res.result.id}`);
      const fresh = await get<RepoRoute>(`/api/repository/routes/${res.result.id}`);
      setRecord(fresh);
      setCoords(fresh.geometry?.coordinates ?? c);
      setProps(fresh.props ?? {});
    } catch (err) {
      const kind = err instanceof ApiError ? err.kind : "internal";
      setMsg({ ok: false, text: kind === "license_restricted" ? t("map.coursesLocked") : err instanceof ApiError && err.details?.reason === "locked" ? t("map.locked") : describeFailure(err).message });
    } finally {
      setBusy(null);
    }
  }

  // The general location alone: recorded, but no new GPX version.
  async function saveLocation() {
    if (!record) return;
    try {
      const res = await send<RepoRoute>("PUT", `/api/repository/routes/${record.id}/location`, newCommand({ country: loc.country, area: loc.area, place: loc.place }, record.version));
      setRecord({ ...record, ...res.result, versions: record.versions });
      setMsg({ ok: true, text: t("common.saved") });
    } catch (err) {
      setMsg({ ok: false, text: describeFailure(err).message });
    }
  }
  const locChanged = record !== null && (loc.country !== (record.country ?? "") || loc.area !== (record.area ?? "") || loc.place !== (record.place ?? ""));

  async function remove() {
    if (!record || !window.confirm(t("repo.removeConfirm"))) return;
    try {
      await send("POST", `/api/repository/routes/${record.id}/remove`, newCommand({}, record.version));
      go("/maps");
    } catch (err) {
      setMsg({ ok: false, text: describeFailure(err).message });
    }
  }

  function showHover(at: { distance: number; elevation: number } | null) {
    const m = map.current;
    if (!m) return;
    if (!at || coords.length < 2) {
      hover.current?.remove();
      hover.current = null;
      return;
    }
    let walked = 0;
    let pos = coords[0]!;
    for (let i = 1; i < coords.length; i++) {
      const seg = lineLength([coords[i - 1]!, coords[i]!]);
      if (walked + seg >= at.distance) {
        const f = seg > 0 ? (at.distance - walked) / seg : 0;
        pos = [coords[i - 1]![0]! + (coords[i]![0]! - coords[i - 1]![0]!) * f, coords[i - 1]![1]! + (coords[i]![1]! - coords[i - 1]![1]!) * f];
        break;
      }
      walked += seg;
    }
    const text = `${dist(at.distance)} · ${Math.round(at.elevation)} m`;
    if (!hover.current) {
      hover.current = L.circleMarker([pos[1]!, pos[0]!], { radius: 7, color: "#fff", weight: 3, fillColor: "#e8590c", fillOpacity: 1, interactive: false }).addTo(m);
      hover.current.bindTooltip(text, { permanent: true, direction: "top", offset: [0, -8] });
    } else {
      hover.current.setLatLng([pos[1]!, pos[0]!]);
      hover.current.setTooltipContent(text);
    }
  }

  const length = lineLength(coords);
  const profile = isCourse && !drawing ? elevationProfile(coords.every((x) => x.length > 2) ? coords : (liveCoords ?? coords)) : null;
  const locked = Boolean(props.locked);

  return (
    <section className="card map-full-target" ref={sectionRef}>
      <div className="row between">
        <h2>{record ? `${CAT_ICON[record.category]} ${record.name}${platform && record.organization ? ` · 🏢 ${record.organization}` : ""}` : t(isCourse ? "repo.newCourse" : category === "pickup" ? "repo.newPickup" : "repo.newDelivery")}</h2>
        <div className="row">
          <a className="button" href={platform ? "#/platform" : "#/maps"}>
            {t("common.back")}
          </a>
          {canEdit && (
            <label className="button file primary" title={t("repo.importHint")}>
              ⤒ {t("repo.importGpx")}
              <input type="file" accept=".gpx,application/gpx+xml" onChange={(e) => (void importGpx(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
          )}
          {record && (
            <a className="button" href={`${apiBase}/${record.id}/gpx`} download>
              ⤓ GPX v{record.currentVersion}
            </a>
          )}
        </div>
      </div>

      <div className="form grid">
        <label>
          <span>{t("map.label")}</span>
          <input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} placeholder={t("repo.namePlaceholder")} />
        </label>
        <label>
          <span>{t("map.type")}</span>
          <select value={category} disabled={!canEdit || drawing} onChange={(e) => setCategory(e.target.value)} title={t("repo.typeHint")}>
            {CATS.filter((c) => c !== "course" || features.includes("courses") || category === "course").map((c) => (
              <option key={c} value={c}>
                {t(`map.cat.${c}` as TextKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>{t("item.notes")}</span>
          <input value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {(["country", "area", "place"] as const).map((k) => (
          <label key={k}>
            <span>{t(`repo.${k}` as TextKey)}</span>
            <input list={`repo-${k}`} value={loc[k]} disabled={!canEdit} placeholder={t(`repo.${k}Hint` as TextKey)} onChange={(e) => setLoc({ ...loc, [k]: e.target.value })} />
            <datalist id={`repo-${k}`}>
              {known[k].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        ))}
        {canEdit && locChanged && (
          <div className="row">
            <button type="button" onClick={() => void saveLocation()} title={t("repo.saveLocationHint")}>
              📍 {t("repo.saveLocation")}
            </button>
          </div>
        )}
        {isCourse && (
          <>
            <label>
              <span>{t("map.laps")}</span>
              <input type="number" min={1} max={50} value={props.laps ?? 1} disabled={!canEdit} onChange={(e) => setProps({ ...props, laps: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} />
            </label>
            {record && (
              <label className="check">
                <input type="checkbox" checked={locked} disabled={!canEdit || drawing} onChange={(e) => setProps({ ...props, locked: e.target.checked })} />
                <span>🔒 {t("map.locked")}</span>
              </label>
            )}
          </>
        )}
      </div>

      <div className="row between map-tools">
        <div className="row">
          <MapSearch onPick={(lat, lng) => map.current?.setView([lat, lng], 17)} />
          <select aria-label={t("repo.guide")} title={t("repo.guideHint")} value={guideId} onChange={(e) => setGuideId(e.target.value)}>
            <option value="">{t("repo.guideNone")}</option>
            {guides
              .filter((g) => g.id !== record?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {CAT_ICON[g.category]} {g.name}
                </option>
              ))}
          </select>
        </div>
        <div className="row">
          <select aria-label={t("map.unit")} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
          {isCourse && (
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

      {drawing && canEdit && (
        <div className="drawing-hint">
          <span>{t("map.drawRouteSeg")}</span>
          <span className="seg-tools" role="group" aria-label={t("map.tool")}>
            {tools.map((m) => (
              <button key={m} type="button" className={tool === m ? "primary" : ""} aria-pressed={tool === m} onClick={() => setTool(m)}>
                {TOOL_ICON[m]} {t(TOOL_LABEL[m])}
              </button>
            ))}
          </span>
          <button type="button" disabled={!canUndo} onClick={() => editor.current?.undo()}>
            ↶ {t("map.undo")}
          </button>
          <button type="button" disabled={coords.length === 0} onClick={() => window.confirm(t("map.clearConfirm")) && editor.current?.clear()}>
            🧽 {t("map.clearRoute")}
          </button>
          {isCourse && (
            <>
              <button type="button" disabled={coords.length < 2} onClick={() => editor.current?.closeLoop()}>
                ↻ {t("map.backToStart")}
              </button>
              <button type="button" disabled={coords.length < 2} onClick={() => editor.current?.outAndBack()}>
                ⇆ {t("map.outAndBackDraw")}
              </button>
              <button type="button" disabled={coords.length < 2} onClick={() => editor.current?.reverse()}>
                ⇄ {t("map.reverse")}
              </button>
            </>
          )}
          <strong className="live-dist">{dist(length)}</strong>
          {busy === "map.snapping" && <span className="small muted">{t("map.snapping")}</span>}
          <button type="button" className="primary" onClick={() => void done()}>
            ✓ {t("map.done")}
          </button>
        </div>
      )}
      {notice && drawing && (
        <p className="alert warn small" role="status">
          ⚠️ {notice}
        </p>
      )}
      <div ref={box} className="map-box tall" />

      <p className="small">
        {t("map.length")}: <strong>{dist(length)}</strong>
        {isCourse && (props.laps ?? 1) > 1 && (
          <>
            {" "}
            · {t("map.total")}: <strong>{dist(length * (props.laps ?? 1))}</strong>
          </>
        )}
        {source && <span className="muted"> · {source}</span>}
        {waypoints.length > 0 && (
          <span className="muted">
            {" "}
            · 📍 {waypoints.length} {t("repo.pois")}
          </span>
        )}
      </p>
      {profile && <ElevationChart profile={profile} locale={locale} unit={unit} onHover={showHover} />}

      {msg && <p className={msg.ok ? "good" : "bad"}>{msg.text}</p>}
      {canEdit && (
        // Floats over the map in full screen (the Save button stays at hand).
        <div className="row map-panel repo-actions">
          <button type="button" className="primary" disabled={busy !== null || coords.length < 2} onClick={() => void save()}>
            {busy === "common.saving" ? t("common.saving") : record ? t("repo.saveVersion") : t("common.save")}
          </button>
          {!drawing && !locked && (
            <button type="button" onClick={() => setDrawing(true)}>
              ✎ {t("map.editShape")}
            </button>
          )}
          {/* Importing a GPX is always possible, also while drawing (Walter, 2026-10-01). */}
          <label className="button file" title={t("repo.importHint")}>
            ⤒ {t("repo.importGpx")}
            <input type="file" accept=".gpx,application/gpx+xml" onChange={(e) => (void importGpx(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
          {record && (
            <button type="button" onClick={() => void save(true)} title={t("repo.duplicateHint")}>
              ⧉ {t("repo.duplicate")}
            </button>
          )}
          {record && (
            <button type="button" onClick={() => void remove()}>
              {t("map.remove")}
            </button>
          )}
        </div>
      )}

      {record?.versions && record.versions.length > 0 && (
        <>
          <h3>{t("repo.versions")}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {record.versions.map((v) => (
                  <tr key={v.version}>
                    <td>v{v.version}</td>
                    <td className="num">{dist(v.lengthMeters)}</td>
                    <td className="small">{showDate(v.createdAt, locale)}</td>
                    <td className="small">{v.createdBy ?? ""}</td>
                    <td className="small muted">{v.source ?? ""}</td>
                    <td>
                      <a className="button" href={`/api/repository/routes/${record.id}/gpx?version=${v.version}`} download>
                        ⤓ GPX
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
