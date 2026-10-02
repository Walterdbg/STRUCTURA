import { Suspense, lazy, useContext, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { haversine } from "@structura/domain";
import { LocaleContext, useT } from "../i18n.js";
import { fmtDist, type Unit } from "./units.js";

// ▶ Course player (Walter, 2026-10-02: "a Strava-style play button"): a
// marker runs along the course while the map follows it; the distance and
// height go with it, and the height chart shows the same spot. The drop-down
// sets how long the whole course takes to play.

const DURATIONS = [30, 60, 120, 300] as const;
// The 3D replay loads its map engine only when it is opened.
const Flyover3D = lazy(() => import("./Flyover3D.js"));

export interface Track {
  coords: number[][];
  cum: number[];
  total: number;
}

export function track(coords: number[][]): Track {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + haversine(coords[i - 1]!, coords[i]!));
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
}

// Position and height at a distance along the course.
export function at(tr: Track, d: number): { ll: L.LatLngTuple; ele: number | null } {
  const { coords, cum } = tr;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = coords[lo]!;
  const b = coords[hi] ?? a;
  const seg = cum[hi]! - cum[lo]!;
  const f = seg > 0 ? Math.min(1, Math.max(0, (d - cum[lo]!) / seg)) : 0;
  const ele = a.length > 2 && b.length > 2 ? a[2]! + (b[2]! - a[2]!) * f : null;
  return { ll: [a[1]! + (b[1]! - a[1]!) * f, a[0]! + (b[0]! - a[0]!) * f], ele };
}

export function CoursePlayer({
  map,
  coords,
  name = "",
  unit,
  onPosition,
}: {
  map: () => L.Map | null;
  coords: number[][];
  name?: string;
  unit: Unit;
  // The distance being shown (null when stopped), for the height chart.
  onPosition?: (meters: number | null) => void;
}) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const tr = useMemo(() => track(coords), [coords]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number>(60);
  const [follow, setFollow] = useState(true);
  const [flyover, setFlyover] = useState(false);
  const marker = useRef<L.CircleMarker | null>(null);
  const progressRef = useRef(0);
  const frame = useRef<number | null>(null);
  // Read at every frame, so a change of km/mi or length applies at once (D-024).
  const settings = useRef({ duration, follow, unit, locale });
  settings.current = { duration, follow, unit, locale };

  const here = at(tr, progress * tr.total);
  const label = `${fmtDist(progress * tr.total, unit, locale)} / ${fmtDist(tr.total, unit, locale)}${here.ele !== null ? ` · ${Math.round(here.ele)} m` : ""}`;

  // Put the marker at a point of the course (and the map on it when following).
  function show(p: number, pan: boolean) {
    const m = map();
    if (!m || tr.total <= 0) return;
    const pos = at(tr, p * tr.total);
    const { unit: u, locale: loc } = settings.current;
    const text = `${fmtDist(p * tr.total, u, loc)}${pos.ele !== null ? ` · ${Math.round(pos.ele)} m` : ""}`;
    if (!marker.current) {
      marker.current = L.circleMarker(pos.ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#fc4c02", fillOpacity: 1, interactive: false }).addTo(m);
      marker.current.bindTooltip(text, { permanent: true, direction: "top", offset: [0, -10], className: "player-tip" });
    } else {
      marker.current.setLatLng(pos.ll);
      marker.current.setTooltipContent(text);
    }
    if (pan) {
      // Small shifts each frame keep the marker in the middle without redrawing the map.
      const pt = m.latLngToContainerPoint(pos.ll);
      const size = m.getSize();
      const off = L.point(pt.x - size.x / 2, pt.y - size.y / 2);
      if (Math.abs(off.x) > 1 || Math.abs(off.y) > 1) m.panBy(off, { animate: false });
    }
    onPosition?.(p * tr.total);
  }

  function stopFrame() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  function play() {
    const m = map();
    if (!m || tr.total <= 0) return;
    if (progressRef.current >= 1) progressRef.current = 0;
    // Strava-like: close enough to see the streets.
    if (settings.current.follow && m.getZoom() < 15) m.setView(at(tr, progressRef.current * tr.total).ll, 15, { animate: false });
    setPlaying(true);
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      progressRef.current = Math.min(1, progressRef.current + dt / settings.current.duration);
      setProgress(progressRef.current);
      show(progressRef.current, settings.current.follow);
      if (progressRef.current >= 1) {
        setPlaying(false);
        frame.current = null;
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }

  function pause() {
    stopFrame();
    setPlaying(false);
  }

  function restart() {
    progressRef.current = 0;
    setProgress(0);
    show(0, settings.current.follow);
  }

  function scrub(p: number) {
    progressRef.current = p;
    setProgress(p);
    show(p, settings.current.follow);
  }

  function close() {
    stopFrame();
    setPlaying(false);
    progressRef.current = 0;
    setProgress(0);
    marker.current?.remove();
    marker.current = null;
    onPosition?.(null);
  }

  // km / mi changed: the runner's label follows straight away.
  useEffect(() => {
    if (marker.current) show(progressRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, locale]);

  // A different course, or leaving the page, ends the replay.
  useEffect(() => close, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  if (coords.length < 2) return null;
  const started = playing || progress > 0;
  return (
    <div className="player row" role="group" aria-label={t("player.title")}>
      <button type="button" className="primary" onClick={() => (playing ? pause() : play())} title={t("player.title")}>
        {playing ? `⏸ ${t("player.pause")}` : `▶ ${t(progress > 0 && progress < 1 ? "player.resume" : "player.play")}`}
      </button>
      <button type="button" onClick={restart} disabled={!started} title={t("player.restart")} aria-label={t("player.restart")}>
        ⏮
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        aria-label={t("player.position")}
        onChange={(e) => scrub(Number(e.target.value) / 1000)}
      />
      <select aria-label={t("player.duration")} title={t("player.duration")} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
        {DURATIONS.map((s) => (
          <option key={s} value={s}>
            {s < 60 ? `${s} s` : `${s / 60} min`}
          </option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        <span>{t("player.follow")}</span>
      </label>
      <button type="button" title={t("player.flyoverHint")} onClick={() => (pause(), setFlyover(true))}>
        🎬 {t("player.flyover")}
      </button>
      <span className="small">{started ? <strong>{label}</strong> : <span className="muted">{t("player.hint")}</span>}</span>
      {started && (
        <button type="button" onClick={close} aria-label={t("common.close")} title={t("common.close")}>
          ✕
        </button>
      )}
      {flyover && (
        <Suspense fallback={null}>
          <Flyover3D coords={coords} name={name} unit={unit} onClose={() => setFlyover(false)} />
        </Suspense>
      )}
    </div>
  );
}
