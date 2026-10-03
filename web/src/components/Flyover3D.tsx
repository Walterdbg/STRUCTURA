import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { elevationProfile, markersAlong } from "@structura/domain";
import { LocaleContext, useT } from "../i18n.js";
import { ElevationChart } from "../pages/EventMap.js";
import { at, track } from "./CoursePlayer.js";
import { METERS, fmtDist, markerLabel, type Unit } from "./units.js";

// 🎬 3D replay (Walter, 2026-10-02: "a version of the player that plays like
// the ones on Strava"): the course seen from above at an angle, buildings in
// 3D and the ground's relief; the camera flies along behind the runner, the
// part already run turns yellow. Its own full-screen view, apart from the
// editing maps.
//
// Free sources, no key: MapLibre (open-source map engine), OpenFreeMap
// (OpenStreetMap streets and building heights) and the AWS open terrain
// heights (Mapzen). Credits are shown on the map.

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DURATIONS = [30, 60, 120, 300] as const;
const FOLLOW = { zoom: 16.4, pitch: 62 };
const LOOK_AHEAD_M = 150;

type Camera = "follow" | "overview";

const line = (coords: number[][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: coords.map((c) => [c[0]!, c[1]!]) },
});
const point = (lng: number, lat: number, properties: Record<string, string> = {}) => ({ type: "Feature" as const, properties, geometry: { type: "Point" as const, coordinates: [lng, lat] } });

// P-028: the runner's distance in both units, e.g. "3.20 km · 1.99 mi"
// (some courses have no distance markers).
const MILE = 1609.344;
function bothUnits(m: number, locale: string): string {
  const f = (v: number) => v.toLocaleString(locale === "es" ? "es-PA" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${f(m / 1000)} km · ${f(m / MILE)} mi`;
}

// Compass direction from a to b ([lng, lat]), degrees.
function bearing(a: number[], b: number[]): number {
  const r = Math.PI / 180;
  const y = Math.sin((b[0]! - a[0]!) * r) * Math.cos(b[1]! * r);
  const x = Math.cos(a[1]! * r) * Math.sin(b[1]! * r) - Math.sin(a[1]! * r) * Math.cos(b[1]! * r) * Math.cos((b[0]! - a[0]!) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;

export default function Flyover3D({ coords, name, unit, onClose }: { coords: number[][]; name: string; unit: Unit; onClose: () => void }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const tr = useMemo(() => track(coords), [coords]);
  const profile = useMemo(() => elevationProfile(coords), [coords]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number>(60);
  const [camera, setCamera] = useState<Camera>("follow");
  const [terrain, setTerrain] = useState(true);
  const progressRef = useRef(0);
  const heading = useRef(0);
  const frame = useRef<number | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = useRef({ duration, camera });
  settings.current = { duration, camera };

  const bounds = useMemo(() => {
    let w = 180, s = 90, e = -180, n = -90;
    for (const c of coords) {
      w = Math.min(w, c[0]!);
      e = Math.max(e, c[0]!);
      s = Math.min(s, c[1]!);
      n = Math.max(n, c[1]!);
    }
    return [[w, s], [e, n]] as [[number, number], [number, number]];
  }, [coords]);

  // The map, once.
  useEffect(() => {
    let live = true;
    let m: MlMap | null = null;
    void (async () => {
      try {
        const ml = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (!live || !box.current) return;
        m = new ml.Map({ container: box.current, style: STYLE, bounds, fitBoundsOptions: { padding: 60 }, maxPitch: 80, attributionControl: { compact: true } });
        map.current = m;
        m.on("error", () => {});
        m.on("load", () => {
          if (!m) return;
          // Buildings standing up, in the blue-grey of the picture.
          if (m.getLayer("building")) m.setLayoutProperty("building", "visibility", "none");
          m.addLayer({
            id: "buildings-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 13,
            paint: {
              "fill-extrusion-color": "#8f99b6",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.92,
            },
          });
          m.addSource("terrain", { type: "raster-dem", tiles: [TERRAIN], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "Terrain: Mapzen, AWS Open Data" });
          m.setTerrain({ source: "terrain", exaggeration: 1.3 });
          // The course: white with a glow; the part already run in yellow.
          m.addSource("course", { type: "geojson", data: line(coords) });
          m.addSource("done", { type: "geojson", data: line([]) });
          m.addSource("head", { type: "geojson", data: point(coords[0]![0]!, coords[0]![1]!, { label: bothUnits(0, locale) }) });
          const round = { "line-join": "round", "line-cap": "round" } as const;
          m.addLayer({ id: "course-edge", type: "line", source: "course", layout: round, paint: { "line-color": "#3d4a66", "line-width": 10, "line-opacity": 0.85 } });
          m.addLayer({ id: "course-glow", type: "line", source: "course", layout: round, paint: { "line-color": "#ffffff", "line-width": 16, "line-blur": 10, "line-opacity": 0.5 } });
          m.addLayer({ id: "course", type: "line", source: "course", layout: round, paint: { "line-color": "#ffffff", "line-width": 6 } });
          m.addLayer({ id: "done", type: "line", source: "done", layout: round, paint: { "line-color": "#ffcc00", "line-width": 9 } });
          m.addLayer({ id: "head", type: "circle", source: "head", paint: { "circle-radius": 8, "circle-color": "#fc4c02", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
          m.addLayer({
            id: "head-label",
            type: "symbol",
            source: "head",
            layout: {
              "text-field": ["get", "label"],
              "text-size": 14,
              "text-font": ["Noto Sans Bold"],
              "text-offset": [0, -1.8],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: { "text-color": "#ffffff", "text-halo-color": "#fc4c02", "text-halo-width": 8 },
          });
          // Distance markers along the course.
          const marks = markersAlong(coords, 1 * METERS[unit]);
          m.addSource("marks", {
            type: "geojson",
            data: { type: "FeatureCollection", features: marks.map((k) => ({ ...point(k.position[0], k.position[1]), properties: { label: `${markerLabel(k.distance, unit)} ${unit}` } })) },
          });
          m.addLayer({
            id: "marks",
            type: "symbol",
            source: "marks",
            layout: { "text-field": ["get", "label"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-offset": [0, -1.2] },
            paint: { "text-color": "#ffffff", "text-halo-color": "#212529", "text-halo-width": 6 },
          });
          // Measure the box again before the first view (it may have been laid out late).
          m.resize();
          m.fitBounds(bounds, { padding: 80, pitch: 45, duration: 0 });
          setReady(true);
        });
      } catch {
        if (live) setFailed(true);
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      live = false;
      document.removeEventListener("keydown", onKey);
      if (frame.current !== null) clearTimeout(frame.current);
      if (startTimer.current) clearTimeout(startTimer.current);
      m?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setTerrain(terrain ? { source: "terrain", exaggeration: 1.3 } : null);
  }, [terrain, ready]);

  // Draw the runner at a point of the course and place the camera.
  function show(p: number, dt: number) {
    const m = map.current;
    if (!m || tr.total <= 0) return;
    const d = p * tr.total;
    const here = at(tr, d);
    const [lat, lng] = here.ll;
    (m.getSource("head") as GeoJSONSource | undefined)?.setData(point(lng, lat, { label: bothUnits(d, locale) }));
    let i = 0;
    while (i < tr.cum.length - 1 && tr.cum[i + 1]! <= d) i++;
    (m.getSource("done") as GeoJSONSource | undefined)?.setData(line([...coords.slice(0, i + 1), [lng, lat]]));
    if (settings.current.camera === "follow") {
      const ahead = at(tr, Math.min(tr.total, d + LOOK_AHEAD_M)).ll;
      const target = bearing([lng, lat], [ahead[1], ahead[0]]);
      // The camera turns gently, like a drone following the runner.
      heading.current = (heading.current + turn(heading.current, target) * Math.min(1, dt * 1.5) + 360) % 360;
      m.jumpTo({ center: [lng, lat], bearing: heading.current, pitch: FOLLOW.pitch, zoom: FOLLOW.zoom });
    } else {
      m.jumpTo({ bearing: (m.getBearing() + dt * 6) % 360 });
    }
    setProgress(p);
  }

  // Driven by a plain timer (~60 per second), never by the browser's paint
  // signal, so nothing outside the replay can hold it up (D-026).
  function loop() {
    if (frame.current !== null) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      progressRef.current = Math.min(1, progressRef.current + dt / settings.current.duration);
      // One bad frame never stops the replay (D-026).
      try {
        show(progressRef.current, dt);
      } catch (err) {
        console.error("3D replay frame", err);
      }
      if (progressRef.current >= 1) {
        frame.current = null;
        setPlaying(false);
        // At the finish the camera pulls back to the whole course.
        map.current?.fitBounds(bounds, { padding: 80, pitch: 45, bearing: map.current.getBearing(), duration: 2500 });
        return;
      }
      frame.current = window.setTimeout(() => step(performance.now()), 16);
    };
    frame.current = window.setTimeout(() => step(performance.now()), 16);
  }

  function play() {
    const m = map.current;
    if (!m || !ready) return;
    if (progressRef.current >= 1) progressRef.current = 0;
    setPlaying(true);
    if (settings.current.camera === "follow") {
      // Fly in from above to behind the runner, then start.
      const d = progressRef.current * tr.total;
      const here = at(tr, d).ll;
      const ahead = at(tr, Math.min(tr.total, d + LOOK_AHEAD_M)).ll;
      heading.current = bearing([here[1], here[0]], [ahead[1], ahead[0]]);
      const ms = progressRef.current === 0 ? 2500 : 600;
      m.flyTo({ center: [here[1], here[0]], zoom: FOLLOW.zoom, pitch: FOLLOW.pitch, bearing: heading.current, duration: ms });
      startAfter(ms);
    } else {
      m.fitBounds(bounds, { padding: 80, pitch: 55, bearing: m.getBearing(), duration: 800 });
      startAfter(800);
    }
  }

  // D-026: the run starts when the fly-in is over, by the clock. Waiting for
  // the map's "move ended" signal froze the replay when the computer reduces
  // animations (the camera jumps and the signal comes before anyone listens).
  function startAfter(ms: number) {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = setTimeout(() => {
      startTimer.current = null;
      loop();
    }, ms + 50);
  }

  function pause() {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = null;
    if (frame.current !== null) clearTimeout(frame.current);
    frame.current = null;
    map.current?.stop();
    setPlaying(false);
  }

  function scrub(p: number) {
    pause();
    progressRef.current = p;
    show(p, 1);
  }

  function changeCamera(c: Camera) {
    const wasPlaying = playing;
    pause();
    setCamera(c);
    settings.current.camera = c;
    if (c === "overview") map.current?.fitBounds(bounds, { padding: 80, pitch: 55, duration: 800 });
    else show(progressRef.current, 1);
    if (wasPlaying) setTimeout(play, 850);
  }

  const here = at(tr, progress * tr.total);
  const host = document.fullscreenElement ?? document.body;
  return createPortal(
    <div className="flyover" role="dialog" aria-label={`${t("player.flyover")}: ${name}`}>
      <div ref={box} className="flyover-map" />
      <div className="flyover-top">
        <strong>🎬 {name}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")} title={`${t("common.close")} (Esc)`}>
          ✕
        </button>
      </div>
      {!ready && !failed && <p className="flyover-msg">{t("player.loading3d")}</p>}
      {failed && <p className="flyover-msg bad">{t("player.no3d")}</p>}
      <div className="flyover-bar">
        <div className="row">
          <button type="button" className="primary" disabled={!ready} onClick={() => (playing ? pause() : play())}>
            {playing ? `⏸ ${t("player.pause")}` : `▶ ${t(progress > 0 && progress < 1 ? "player.resume" : "player.play")}`}
          </button>
          <button type="button" disabled={!ready} onClick={() => scrub(0)} title={t("player.restart")} aria-label={t("player.restart")}>
            ⏮
          </button>
          <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} disabled={!ready} aria-label={t("player.position")} onChange={(e) => scrub(Number(e.target.value) / 1000)} />
          <select aria-label={t("player.duration")} title={t("player.duration")} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((s) => (
              <option key={s} value={s}>
                {s < 60 ? `${s} s` : `${s / 60} min`}
              </option>
            ))}
          </select>
          <select aria-label={t("player.camera")} title={t("player.camera")} value={camera} onChange={(e) => changeCamera(e.target.value as Camera)}>
            <option value="follow">🎥 {t("player.cameraFollow")}</option>
            <option value="overview">🛰 {t("player.cameraOverview")}</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={terrain} onChange={(e) => setTerrain(e.target.checked)} />
            <span>⛰ {t("player.terrain")}</span>
          </label>
          <strong className="small">
            {bothUnits(progress * tr.total, locale)} / {fmtDist(tr.total, unit, locale)}
            {here.ele !== null ? ` · ${Math.round(here.ele)} m` : ""}
          </strong>
        </div>
        {profile && <ElevationChart profile={profile} locale={locale} unit={unit} at={progress * tr.total} />}
      </div>
    </div>,
    host
  );
}
