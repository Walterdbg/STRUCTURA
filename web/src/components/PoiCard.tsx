import { useState } from "react";
import type L from "leaflet";
import { uuidv7 } from "@structura/domain";
import { ApiError, newCommand, send, type MapFeature } from "../api.js";
import { describeFailure } from "../forms.js";
import { useT } from "../i18n.js";
import { captureMap, shrinkPhoto } from "./capture.js";

// Work card of a point of interest on an Event map (DEC-044). Pictures:
// up to three - photos of the place, or captures of the map zoomed in on it.
// Checklist: what to deliver there (from the inventory or not) and what to do
// there - announced only; it comes with the inventory's phase 1.

export const MAX_POI_PHOTOS = 3;
export const photoUrl = (id: string) => `/api/attachments/${id}/content`;

async function uploadPicture(eventId: string, featureId: string, blob: Blob, role: "photo" | "capture", filename: string) {
  const res = await fetch(`/api/events/${eventId}/map/${featureId}/photos`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "content-type": blob.type || "image/jpeg",
      "x-command-id": uuidv7(),
      "x-occurred-at": new Date().toISOString(),
      "x-filename": encodeURIComponent(filename),
      "x-photo-role": role,
    },
    body: blob,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? "internal", body?.message ?? res.statusText, body?.details);
  }
}

export function PoiCard({
  eventId,
  feature,
  canEdit,
  map,
  onChanged,
  onClose,
}: {
  eventId: string;
  feature: MapFeature;
  canEdit: boolean;
  map: () => L.Map | null;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"pictures" | "checklist">("pictures");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photos = feature.photos ?? [];
  const full = photos.length >= MAX_POI_PHOTOS;

  async function run(label: string, job: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await job();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.details?.reason === "limit" ? t("poi.full") : err instanceof ApiError ? t(describeFailure(err).message) : t("poi.failed"));
    } finally {
      setBusy(null);
    }
  }

  const addFile = (file: File | undefined) =>
    file && run(t("poi.uploading"), async () => uploadPicture(eventId, feature.id, await shrinkPhoto(file), "photo", file.name));

  const capture = () =>
    run(t("poi.capturing"), async () => {
      const m = map();
      if (!m) return;
      const blob = await captureMap(m);
      await uploadPicture(eventId, feature.id, blob, "capture", `${feature.label} - ${t("poi.capture")} z${m.getZoom()}.jpg`);
    });

  const remove = (id: string) =>
    window.confirm(t("poi.removeConfirm")) && run(t("common.saving"), async () => void (await send("POST", `/api/events/${eventId}/map/${feature.id}/photos/${id}/remove`, newCommand({}))));

  return (
    <div className="poi-card" role="dialog" aria-label={feature.label}>
      <div className="row between">
        <strong>{feature.label}</strong>
        <button type="button" className="link" onClick={onClose} aria-label={t("common.close")} title={t("common.close")}>
          ✕
        </button>
      </div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pictures"} className={tab === "pictures" ? "active" : ""} onClick={() => setTab("pictures")}>
          🖼 {t("poi.pictures")} ({photos.length}/{MAX_POI_PHOTOS})
        </button>
        <button type="button" role="tab" aria-selected={tab === "checklist"} className={tab === "checklist" ? "active" : ""} onClick={() => setTab("checklist")}>
          ☑ {t("poi.checklist")}
        </button>
      </div>
      {tab === "pictures" ? (
        <>
          {photos.length === 0 && <p className="small muted">{t("poi.noPictures")}</p>}
          <div className="poi-photos">
            {photos.map((p) => (
              <figure key={p.id}>
                <a href={photoUrl(p.id)} target="_blank" rel="noreferrer" title={t("poi.openFull")}>
                  <img src={photoUrl(p.id)} alt={p.filename} loading="lazy" />
                </a>
                <figcaption className="small">
                  {p.role === "capture" ? `🗺 ${t("poi.capture")}` : `📷 ${t("poi.photo")}`}
                  {canEdit && (
                    <button type="button" className="link" disabled={busy !== null} onClick={() => remove(p.id)} aria-label={t("map.remove")} title={t("map.remove")}>
                      ✕
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          {canEdit && (
            <div className="row">
              <label className={`button file${full || busy ? " disabled" : ""}`} title={full ? t("poi.full") : t("poi.addHint")}>
                ⤒ {t("poi.add")}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={full || busy !== null} onChange={(e) => (void addFile(e.target.files?.[0]), (e.target.value = ""))} />
              </label>
              <button type="button" disabled={full || busy !== null} title={full ? t("poi.full") : t("poi.captureHint")} onClick={() => void capture()}>
                📷 {t("poi.captureView")}
              </button>
            </div>
          )}
          {canEdit && !full && <p className="small muted">{t("poi.captureTip")}</p>}
        </>
      ) : (
        <div className="small">
          <p>
            <span className="tag">{t("poi.comingTag")}</span> {t("poi.comingText")}
          </p>
          <ul>
            <li>📦 {t("poi.comingDeliver")}</li>
            <li>🛠 {t("poi.comingDo")}</li>
            <li>📄 {t("poi.comingPdf")}</li>
          </ul>
        </div>
      )}
      {busy && <p className="small muted">{busy}</p>}
      {error && (
        <p className="bad small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
