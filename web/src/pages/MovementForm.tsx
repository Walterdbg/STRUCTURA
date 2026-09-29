import { useEffect, useMemo, useState, type FormEvent } from "react";
import { INBOUND_REASONS, MANUAL_REASONS, NOTE_REQUIRED, OUTBOUND_REASONS, movementFields, type MovementReason } from "@structura/domain";
import { api, type EventRecord, type ItemRecord, type LocationRecord, type PositionRecord } from "../api.js";
import { checkFields, describeFailure, useCommandSender } from "../forms.js";
import { hasKey, useT, type TextKey } from "../i18n.js";
import { go } from "../router.js";

interface Line {
  itemId: string;
  quantity: string;
}

const fieldMessage = (field: string): TextKey => (hasKey(`err.field.${field}`) ? (`err.field.${field}` as TextKey) : "err.validation");

// UC-03 / UC-08: an ordinary location update through normal screen
// controls. No Trip, driver or customer is asked for.
export function MovementForm({ presetItemId }: { presetItemId?: string }) {
  const t = useT();
  const send = useCommandSender();
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [positions, setPositions] = useState<Record<string, PositionRecord[]>>({});
  const [reason, setReason] = useState<MovementReason>("transfer");
  const [sourceLocationId, setSource] = useState("");
  const [destinationLocationId, setDestination] = useState("");
  const [eventId, setEventId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: presetItemId ?? "", quantity: "" }]);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<{ message: TextKey; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.locations().then((r) => setLocations(r.items.filter((l) => l.active)), () => {});
    api.items("", false).then((r) => setItems(r.items), () => {});
    api.events().then((r) => setEvents(r.items), () => {});
  }, []);

  // Where each chosen item is, to show what's available at the source.
  useEffect(() => {
    for (const l of lines) {
      if (l.itemId && !positions[l.itemId]) {
        api.item(l.itemId).then((d) => setPositions((p) => ({ ...p, [l.itemId]: d.positions })), () => {});
      }
    }
  }, [lines, positions]);

  const needsSource = !INBOUND_REASONS.includes(reason);
  const needsDestination = !OUTBOUND_REASONS.includes(reason);
  const noteRequired = NOTE_REQUIRED.includes(reason);

  const payload = {
    reason,
    sourceLocationId: needsSource ? sourceLocationId || null : null,
    destinationLocationId: needsDestination ? destinationLocationId || null : null,
    eventId: eventId || null,
    note: note.trim() || null,
    lines: lines.filter((l) => l.itemId || l.quantity).map((l) => ({ itemId: l.itemId, quantity: l.quantity.trim() })),
  };
  const errors = useMemo(() => (touched ? checkFields(movementFields, payload, fieldMessage) : {}), [touched, JSON.stringify(payload)]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = (id: string) => items.find((i) => i.id === id);
  const availableAtSource = (itemId: string) =>
    positions[itemId]?.find((p) => p.locationId === sourceLocationId)?.quantity ?? (positions[itemId] ? "0" : "…");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(checkFields(movementFields, payload, fieldMessage)).length) {
      setError({ message: "err.validation" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send("POST", "/api/movements", payload);
      if (presetItemId) go(`/inventory/${presetItemId}`);
      else go("/movements");
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setBusy(false);
    }
  }

  const locationSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("common.none")}</option>
      {locations
        .filter((l) => l.id !== exclude)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {l.designation} · {t(`kind.${l.kind}` as TextKey)}
          </option>
        ))}
    </select>
  );

  return (
    <section className="card">
      <div className="row between">
        <h2>{t("mov.new")}</h2>
        <a className="button" href={presetItemId ? `#/inventory/${presetItemId}` : "#/movements"}>
          {t("common.back")}
        </a>
      </div>
      {reason === "transfer" && <p className="muted small">{t("mov.noTrip")}</p>}
      <form className="form grid" onSubmit={submit}>
        <label>
          <span>{t("mov.reason")}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as MovementReason)}>
            {MANUAL_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reason.${r}` as TextKey)}
              </option>
            ))}
          </select>
        </label>
        {needsSource && (
          <label className={errors.sourceLocationId || error?.field === "sourceLocationId" ? "invalid" : ""}>
            <span>{t("mov.source")}</span>
            {locationSelect(sourceLocationId, setSource)}
            {errors.sourceLocationId && <small className="bad">{t(errors.sourceLocationId)}</small>}
          </label>
        )}
        {needsDestination && (
          <label className={errors.destinationLocationId || error?.field === "destinationLocationId" ? "invalid" : ""}>
            <span>{t("mov.destination")}</span>
            {locationSelect(destinationLocationId, setDestination, sourceLocationId)}
            {errors.destinationLocationId && <small className="bad">{t(errors.destinationLocationId)}</small>}
          </label>
        )}
        <label>
          <span>{t("mov.event")}</span>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t("common.none")}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.designation}
              </option>
            ))}
          </select>
        </label>
        <label className={`wide ${errors.note ? "invalid" : ""}`}>
          <span>{t(noteRequired ? "mov.noteRequired" : "mov.note")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
          {errors.note && <small className="bad">{t(errors.note)}</small>}
        </label>

        <div className="wide">
          <span className="label">{t("mov.lines")}</span>
          <div className="lines">
            {lines.map((l, i) => {
              const it = itemById(l.itemId);
              return (
                <div className="line" key={i}>
                  <select
                    aria-label={t("mov.item")}
                    value={l.itemId}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
                  >
                    <option value="">{t("mov.item")}…</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.internalReference ? ` · ${x.internalReference}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t("mov.quantity")}
                    inputMode="decimal"
                    placeholder={t("mov.quantity")}
                    value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <span className="small muted unit">{it?.unit ?? ""}</span>
                  {needsSource && sourceLocationId && l.itemId && (
                    <span className="small muted">
                      {t("mov.available")}: {availableAtSource(l.itemId)}
                    </span>
                  )}
                  {lines.length > 1 && (
                    <button type="button" aria-label="×" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setLines([...lines, { itemId: "", quantity: "" }])}>
            + {t("mov.addLine")}
          </button>
          {errors.lines && <p className="bad small">{t("err.field.lines")}</p>}
        </div>

        {error && (
          <p className="bad wide" role="alert">
            {t(error.message)}
          </p>
        )}
        <div className="row wide">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("common.saving") : t("mov.post")}
          </button>
        </div>
      </form>
    </section>
  );
}
