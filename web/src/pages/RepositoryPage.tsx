import { useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { elevationProfile, lineLength, markersAlong, type FeatureProps } from "@structura/domain";
import { ApiError, get, newCommand, send } from "../api.js";
import { addBaseLayers, addFullscreen, geoStatus, type GeoStatus } from "../components/basemap.js";
import { parseGpx } from "../components/gpx.js";
import { MapSearch } from "../components/MapSearch.js";
import { RouteEditor, anchorIndexes, joinSegments, shapeFromLine, type RouteShape, type SegMode } from "../components/routeEditor.js";
import { MARKER_STEPS, METERS, fmtDist, markerLabel, useMarkerStep, useShowMarkers, useUnit, type Unit } from "../components/units.js";
import { describeFailure } from "../forms.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";
import { go } from "../router.js";
import { ElevationChart, ROUTE_COLOR } from "./EventMap.js";

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
export function RepositoryList({ canEdit, features }: { canEdit: boolean; features: string[] }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const [unit] = useUnit();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<RepoRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCourses = features.includes("courses");

  useEffect(() => {
    const timer = setTimeout(() => {
      get<{ items: RepoRoute[] }>(`/api/repository/routes?search=${encodeURIComponent(search)}`).then(
        (r) => (setItems(r.items), setError(null)),
        (err) => setError(describeFailure(err).message)
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <section className="card">
      <div className="row between">
        <h2>{t("repo.title")}</h2>
        {canEdit && (
          <div className="row">
            {hasCourses && (
              <a className="button primary" href="#/maps/new?cat=course">
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
      <p className="muted small">{t("repo.hint")}</p>
      <input type="search" className="search" placeholder={t("repo.search")} aria-label={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="bad">{error}</p>}
      {items === null && !error && <p>{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{search ? t("common.noResults") : t("repo.empty")}</p>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
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
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`#/maps/${r.id}`}>
                      {CAT_ICON[r.category]} {r.name}
                    </a>
                    {r.props?.locked && <span className="tag">🔒</span>}
                  </td>
                  <td className="small">{t(`map.cat.${r.category}` as TextKey)}</td>
                  <td className="num">{fmtDist(r.lengthMeters, unit, locale)}</td>
                  <td>v{r.currentVersion}</td>
                  <td className="small">{showDate(r.updatedAt, locale)}</td>
                  <td>
                    <a className="button" href={`/api/repository/routes/${r.id}/gpx`} download>
                      ⤓ GPX
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ editor
export function RepositoryRouteEditor({ routeId, newCategory, canEdit, features }: { routeId?: string; newCategory?: string; canEdit: boolean; features: string[] }) {
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
  const [drawing, setDrawing] = useState(!routeId);
  const [tool, setTool] = useState<SegMode>("l");
  const toolRef = useRef<SegMode>("l");
  toolRef.current = tool;
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isCourse = category === "course";
  const dist = (m: number) => fmtDist(m, unit, locale);
  const tools: SegMode[] = status?.routing && byCar(category) ? ["d", "m", "l"] : ["l"];

  // Load an existing route.
  useEffect(() => {
    if (!routeId) return;
    get<RepoRoute>(`/api/repository/routes/${routeId}`).then(
      (r) => {
        setRecord(r);
        setName(r.name);
        setCategory(r.category);
        setNotes(r.notes ?? "");
        setProps(r.props ?? {});
        setCoords(r.geometry?.coordinates ?? []);
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
    if (isCourse && showMarkers) {
      for (const mk of markersAlong(coords, markerStep * METERS[unit])) {
        L.marker([mk.position[1], mk.position[0]], { icon: L.divIcon({ className: "km-marker", html: markerLabel(mk.distance, unit), iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false }).addTo(g);
      }
    }
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    L.marker([first[1]!, first[0]!], { icon: L.divIcon({ className: "flag-marker", html: "▶", iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(g);
    L.marker([last[1]!, last[0]!], { icon: L.divIcon({ className: "flag-marker finish", html: "🏁", iconSize: [26, 26], iconAnchor: [4, 22] }) }).addTo(g);
    m.fitBounds(line.getBounds().pad(0.15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, drawing, unit, markerStep, showMarkers, category, mapReady]);

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
    if (shape && shape.anchors.length) m.fitBounds(L.latLngBounds(shape.anchors.map((a) => [a[1]!, a[0]!] as L.LatLngTuple)).pad(0.15));
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

  // Heights for a course whose line changed.
  async function withHeights(c: number[][]): Promise<number[][]> {
    if (!isCourse || c.length < 2 || c.every((x) => x.length > 2) || !status?.elevation) return c;
    try {
      const res = await fetch("/api/geo/elevation", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ coordinates: c.map((x) => [x[0], x[1]]) }) });
      const body = await res.json();
      return res.ok ? (body.coordinates as number[][]) : c;
    } catch {
      return c;
    }
  }

  async function done() {
    editor.current?.stop();
    editor.current = null;
    setDrawing(false);
    setNotice(null);
    setCoords(await withHeights(coords));
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
      setProps((p) => {
        const out = { ...p };
        delete out.anchorIdx;
        delete out.segModes;
        return out;
      });
      setCoords(await withHeights(g.coordinates));
    } catch {
      setMsg({ ok: false, text: t("map.gpxInvalid") });
    }
  }

  async function save(asNew = false) {
    if (coords.length < 2) return setMsg({ ok: false, text: t("map.needTwoPoints") });
    const c = await withHeights(coords);
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
  const profile = isCourse && !drawing ? elevationProfile(coords) : null;
  const locked = Boolean(props.locked);

  return (
    <section className="card map-full-target" ref={sectionRef}>
      <div className="row between">
        <h2>{record ? `${CAT_ICON[record.category]} ${record.name}` : t(isCourse ? "repo.newCourse" : category === "pickup" ? "repo.newPickup" : "repo.newDelivery")}</h2>
        <div className="row">
          <a className="button" href="#/maps">
            {t("common.back")}
          </a>
          {record && (
            <a className="button" href={`/api/repository/routes/${record.id}/gpx`} download>
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
          <select value={category} disabled={!canEdit || Boolean(record)} onChange={(e) => setCategory(e.target.value)}>
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
        <MapSearch onPick={(lat, lng) => map.current?.setView([lat, lng], 17)} />
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
      </p>
      {profile && <ElevationChart profile={profile} locale={locale} unit={unit} onHover={showHover} />}

      {msg && <p className={msg.ok ? "good" : "bad"}>{msg.text}</p>}
      {canEdit && (
        <div className="row">
          <button type="button" className="primary" disabled={busy !== null || coords.length < 2} onClick={() => void save()}>
            {busy === "common.saving" ? t("common.saving") : record ? t("repo.saveVersion") : t("common.save")}
          </button>
          {!drawing && !locked && (
            <button type="button" onClick={() => setDrawing(true)}>
              ✎ {t("map.editShape")}
            </button>
          )}
          {!drawing && (
            <label className="button file">
              ⤒ GPX
              <input type="file" accept=".gpx,application/gpx+xml" onChange={(e) => (void importGpx(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
          )}
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
