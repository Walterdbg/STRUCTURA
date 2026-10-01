import { useContext, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { courseTotal, elevationProfile, haversine, markersAlong, projectOnLine } from "@structura/domain";
import { api, get, type EventRecord, type MapFeature } from "../api.js";
import { addBaseLayers } from "../components/basemap.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";
import { ElevationChart, ICON, ROUTE_COLOR } from "./EventMap.js";
import { METERS, fmtDist, markerLabel, useMarkerStep, useShowMarkers, useUnit } from "../components/units.js";

// Course sheet (DEC-027 item 5): one printable page per course with the
// map, distance (laps / out-and-back), elevation and the stations by km.
// "Imprimir / Guardar PDF" uses the browser's own print, so a PDF can be
// saved and sent to runners, permit offices or suppliers.

const NEAR_COURSE_M = 30;

// A course whose end comes back within 50 m of its start.
const isLoop = (c: number[][]) => c.length > 2 && haversine(c[0]!, c[c.length - 1]!) <= 50;

export function CourseSheet({ eventId, courseId }: { eventId: string; courseId: string }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  // Same units and distance markers as chosen on the Event map (DEC-032).
  const [unit] = useUnit();
  const [markerStep] = useMarkerStep();
  const [showMarkers] = useShowMarkers();
  const km = (m: number, _l?: string) => fmtDist(m, unit, locale);
  const box = useRef<HTMLDivElement>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [items, setItems] = useState<MapFeature[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([api.event(eventId), get<{ items: MapFeature[] }>(`/api/events/${eventId}/map`)]).then(
      ([e, m]) => (setEvent(e), setItems(m.items)),
      () => setFailed(true)
    );
  }, [eventId]);

  const course = items?.find((f) => f.id === courseId && f.category === "course");
  const coords = (course?.geometry.coordinates as number[][] | undefined) ?? [];

  // Stations: points placed on this course, plus points right next to it.
  const stations = (items ?? [])
    .filter((f) => f.kind === "point")
    .map((f) => {
      if (f.props?.courseId === courseId && f.props.distanceM !== undefined) return { f, meters: f.props.distanceM };
      if (coords.length < 2) return null;
      const p = projectOnLine(coords, f.geometry.coordinates as number[]);
      return p.offset <= NEAR_COURSE_M ? { f, meters: p.distance } : null;
    })
    .filter((s): s is { f: MapFeature; meters: number } => s !== null)
    .sort((a, b) => a.meters - b.meters);

  useEffect(() => {
    if (!box.current || !course || coords.length < 2) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false });
    void addBaseLayers(m, locale, { map: t("map.layerMap"), satellite: t("map.layerSatellite") });
    const line = L.polyline(coords.map((c) => [c[1]!, c[0]!] as L.LatLngTuple), { color: ROUTE_COLOR.course, weight: 5 }).addTo(m);
    for (const mk of showMarkers ? markersAlong(coords, markerStep * METERS[unit]) : []) {
      L.marker([mk.position[1], mk.position[0]], {
        icon: L.divIcon({ className: "km-marker", html: markerLabel(mk.distance, unit), iconSize: [24, 24], iconAnchor: [12, 12] }),
        interactive: false,
      }).addTo(m);
    }
    const first = coords[0]!;
    const last = course.props?.outAndBack ? first : coords[coords.length - 1]!;
    L.marker([first[1]!, first[0]!], { icon: L.divIcon({ className: "flag-marker", html: "▶", iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(m);
    L.marker([last[1]!, last[0]!], { icon: L.divIcon({ className: "flag-marker finish", html: "🏁", iconSize: [26, 26], iconAnchor: [4, 22] }) }).addTo(m);
    for (const s of stations) {
      const [lng, lat] = s.f.geometry.coordinates as number[];
      L.marker([lat!, lng!], { icon: L.divIcon({ className: "poi-icon", html: ICON[s.f.category] ?? "📍", iconSize: [28, 28], iconAnchor: [14, 14] }) })
        .bindTooltip(s.f.label, { permanent: true, direction: "right", className: "sheet-label" })
        .addTo(m);
    }
    m.fitBounds(line.getBounds().pad(0.08));
    return () => {
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, items]);

  if (failed) return <p className="bad">{t("err.internal")}</p>;
  if (!event || !items) return <p>{t("common.loading")}</p>;
  if (!course) return <p className="bad">{t("sheet.notFound")}</p>;

  const onePass = course.lengthMeters ?? 0;
  const total = courseTotal(onePass, course.props ?? {});
  const profile = elevationProfile(coords);
  const dateText = event.eventDate ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale === "es" ? "es-PA" : "en-US", { dateStyle: "long" }) : "";

  return (
    <section className="card sheet">
      <div className="row between no-print">
        <a className="button" href={`#/events/${eventId}`}>
          {t("common.back")}
        </a>
        <button type="button" className="primary" onClick={() => window.print()}>
          🖨 {t("sheet.print")}
        </button>
      </div>
      <header className="sheet-head">
        <h2>{course.label}</h2>
        <p>
          <strong>{event.designation}</strong>
          {dateText && ` · ${dateText}`}
          {event.location && ` · ${event.location}`}
        </p>
      </header>
      <div className="sheet-stats">
        <div>
          <span className="muted small">{t("sheet.distance")}</span>
          <strong>{km(total, locale)}</strong>
          {total !== onePass && (
            <span className="small muted">
              {course.props?.laps ?? 1} × {km(onePass, locale)} ({t("sheet.onePass")}){course.props?.outAndBack ? ` · ${t("map.outAndBack")}` : ""}
            </span>
          )}
        </div>
        {profile && (
          <div>
            <span className="muted small">{t("map.elevation")}</span>
            <strong>
              ↑ {Math.round(profile.gain)} m · ↓ {Math.round(profile.loss)} m
            </strong>
            {total !== onePass && <span className="small muted">({t("sheet.onePass")})</span>}
          </div>
        )}
        <div>
          <span className="muted small">
            ▶ {t("map.start")} · 🏁 {t("map.finishLine")}
          </span>
          <strong>{t(course.props?.outAndBack || isLoop(coords) ? "sheet.samePlace" : "sheet.differentPlaces")}</strong>
        </div>
      </div>
      <div ref={box} className="sheet-map" />
      {profile && <ElevationChart profile={profile} locale={locale} unit={unit} />}
      <h3>{t("sheet.stations")}</h3>
      {stations.length === 0 ? (
        <p className="muted">{t("sheet.noStations")}</p>
      ) : (
        <table>
          <tbody>
            {stations.map((s) => (
              <tr key={s.f.id}>
                <td className="num">{km(s.meters)}</td>
                <td>
                  {ICON[s.f.category]} {s.f.label}
                </td>
                <td className="small muted">{t(`map.cat.${s.f.category}` as TextKey)}</td>
                <td className="small">{s.f.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted sheet-foot">{t("sheet.generated")}</p>
    </section>
  );
}
