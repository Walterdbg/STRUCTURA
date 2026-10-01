import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DATE_FIELDS,
  DEFAULT_DATE_RULES,
  addBusinessDays,
  addDays,
  eventFields,
  limitIssues,
  pastDateIssues,
  todayIn,
  type DateField as DateFieldName,
  type DateRules,
} from "@structura/domain";
import { ApiError, api, get, newCommand, send, type Command, type EventRecord, type Me, type Member } from "../api.js";
import { LocaleContext, errorKey, hasKey, useT, type TextKey } from "../i18n.js";
import { DateField } from "../components/DateField.js";
import { LocationPicker, type MapPoint } from "../components/LocationPicker.js";
import { TimezoneSelect } from "../components/TimezoneSelect.js";
import { go } from "../router.js";
import { AuditPanel } from "./AuditPanel.js";
import { EventLines } from "./EventLines.js";
import { EventMap } from "./EventMap.js";

interface FormState {
  designation: string;
  designationStatus: "provisional" | "final";
  eventType: "rental" | "race";
  responsibleUserId: string;
  timezone: string;
  location: string;
  locationLat: number | null;
  locationLng: number | null;
  eventDate: string;
  departureDate: string;
  expectedReturnDate: string;
  notes: string;
}

const blank = (me: Me): FormState => ({
  designation: "",
  designationStatus: "provisional",
  eventType: "rental",
  responsibleUserId: me.user.id,
  timezone: me.tenant.defaultTimezone,
  location: "",
  locationLat: null,
  locationLng: null,
  eventDate: "",
  departureDate: "",
  expectedReturnDate: "",
  notes: "",
});

const fromRecord = (e: EventRecord): FormState => ({
  designation: e.designation,
  designationStatus: e.designationStatus,
  eventType: e.eventType,
  responsibleUserId: e.responsibleUserId,
  timezone: e.timezone,
  location: e.location ?? "",
  locationLat: e.locationLat,
  locationLng: e.locationLng,
  eventDate: e.eventDate ?? "",
  departureDate: e.departureDate ?? "",
  expectedReturnDate: e.expectedReturnDate ?? "",
  notes: e.notes ?? "",
});

const toPayload = (f: FormState) => ({
  ...f,
  location: f.location || null,
  eventDate: f.eventDate || null,
  departureDate: f.departureDate || null,
  expectedReturnDate: f.expectedReturnDate || null,
  notes: f.notes || null,
});

const REASON_KEYS: Record<string, TextKey> = {
  return_before_departure: "err.field.expectedReturnDate",
  event_outside_rental: "err.field.eventOutside",
  past: "err.field.past",
  departure_too_early: "err.field.departureTooEarly",
  return_too_late: "err.field.returnTooLate",
  type_fixed: "err.field.typeFixed",
};

// A field message, with the date it refers to for the DEC-028 limits.
type FieldErr = { key: TextKey; limit?: string };

const showDate = (iso: string, locale: string) => {
  const [y, m, d] = iso.split("-");
  return locale === "es" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
};

// One localized message per field, from the same rules the server applies
// (timeline order, and DEC-019/020: event date and return not in the past;
// only dates being entered or changed are checked).
function fieldErrors(f: FormState, before: EventRecord | null, rules: DateRules): Record<string, FieldErr> {
  const out: Record<string, FieldErr> = {};
  const payload = toPayload(f);
  // Past dates first: every problem shows at once, not one per save.
  const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const dates = { eventDate: isDate(payload.eventDate), departureDate: isDate(payload.departureDate), expectedReturnDate: isDate(payload.expectedReturnDate) };
  const changed: DateFieldName[] =
    before && before.timezone === f.timezone ? DATE_FIELDS.filter((d) => dates[d] !== before[d]) : [...DATE_FIELDS];
  try {
    for (const issue of pastDateIssues(dates, todayIn(f.timezone), changed)) out[issue.field] = { key: "err.field.past" };
  } catch {
    /* unknown timezone: reported below */
  }
  const parsed = eventFields.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (out[field]) continue;
      const reason = issue.code === "custom" ? (issue.params as { reason?: string } | undefined)?.reason : undefined;
      if (reason && REASON_KEYS[reason]) out[field] = { key: REASON_KEYS[reason] };
      else if ((DATE_FIELDS as readonly string[]).includes(field)) out[field] = { key: "err.field.date" };
      else if (hasKey(`err.field.${field}`)) out[field] = { key: `err.field.${field}` as TextKey };
      else out[field] = { key: "err.validation" };
    }
  }
  // DEC-028: the organization's departure and return limits.
  for (const issue of limitIssues(dates, rules, changed)) {
    if (!out[issue.field]) out[issue.field] = { key: REASON_KEYS[issue.reason]!, limit: issue.limit };
  }
  return out;
}

export function EventForm({ me, eventId }: { me: Me; eventId?: string }) {
  const t = useT();
  const locale = useContext(LocaleContext); // maps are rebuilt in the new language
  const canEdit = me.capabilities.includes("event.manage");
  const [record, setRecord] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<FormState>(() => blank(me));
  const [editing, setEditing] = useState(!eventId);
  const [members, setMembers] = useState<Member[]>([]);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A field the server refused (e.g. a date that became past meanwhile).
  const [serverField, setServerField] = useState<{ field: string; err: FieldErr } | null>(null);
  const [rules, setRules] = useState<DateRules>(DEFAULT_DATE_RULES);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // The same attempt keeps its command ID across retries (spec 11.2).
  const pending = useRef<{ key: string; cmd: Command<unknown> } | null>(null);

  useEffect(() => {
    api.members().then((r) => setMembers(r.items.filter((m) => m.active)), () => {});
    get<DateRules>("/api/settings/date-rules").then(setRules, () => {});
  }, []);

  const load = async () => {
    if (!eventId) return;
    try {
      const e = await api.event(eventId);
      setRecord(e);
      setForm(fromRecord(e));
      setError(null);
    } catch (err) {
      setError(t(errorKey(err instanceof ApiError ? err.kind : "internal")));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const errors = useMemo(() => {
    const local = touched ? fieldErrors(form, record, rules) : {};
    return serverField && !local[serverField.field] ? { ...local, [serverField.field]: serverField.err } : local;
  }, [form, touched, record, serverField, rules]);
  // Any change clears the old messages; the field checks run again live (D-004).
  const setValue = (k: keyof FormState, v: string) => {
    setSaved(false);
    setError(null);
    setServerField(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setValue(k, e.target.value);
  const onPoint = useCallback((p: MapPoint) => {
    setSaved(false);
    setError(null);
    setForm((f) => ({ ...f, location: p.name, locationLat: p.lat, locationLng: p.lng }));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(fieldErrors(form, record, rules)).length) {
      setError(t("err.validation"));
      return;
    }
    const payload = toPayload(form);
    const key = JSON.stringify([eventId ?? null, record?.version ?? null, payload]);
    if (pending.current?.key !== key) {
      pending.current = { key, cmd: newCommand(payload, record ? record.version : null) };
    }
    setBusy(true);
    setError(null);
    try {
      const res = record
        ? await send<EventRecord>("PUT", `/api/events/${record.id}`, pending.current.cmd)
        : await send<EventRecord>("POST", "/api/events", pending.current.cmd);
      pending.current = null;
      setSaved(true);
      if (!record) {
        go(`/events/${res.result.id}`);
      } else {
        setRecord(res.result);
        setForm(fromRecord(res.result));
        setEditing(false);
      }
    } catch (err) {
      // Input stays on screen for every failure (spec 2.3).
      const kind = err instanceof ApiError ? err.kind : "internal";
      if (kind !== "unreachable") pending.current = null;
      const field = err instanceof ApiError && typeof err.details?.field === "string" ? err.details.field : null;
      const reason = err instanceof ApiError ? (err.details?.reason as string | undefined) : undefined;
      const limit = err instanceof ApiError && typeof err.details?.limit === "string" ? err.details.limit : undefined;
      if (field && reason && REASON_KEYS[reason]) setServerField({ field, err: { key: REASON_KEYS[reason], limit } });
      setError(t(kind === "validation" ? "err.validation" : errorKey(kind)));
    } finally {
      setBusy(false);
    }
  }

  if (eventId && !record && !error) return <p>{t("common.loading")}</p>;

  const readOnly = !editing;
  const field = (name: keyof FormState, label: TextKey, input: JSX.Element, hint?: TextKey, hintText?: string) => (
    <label className={errors[name] ? "invalid" : ""}>
      <span>{t(label)}</span>
      {input}
      {hint && <small className="muted">{t(hint)}</small>}
      {hintText && !errors[name] && <small className="muted">{hintText}</small>}
      {errors[name] && <small className="bad">{t(errors[name]!.key).replace("{date}", errors[name]!.limit ? showDate(errors[name]!.limit!, locale) : "")}</small>}
    </label>
  );

  return (
    <>
    <section className="card">
      <div className="row between">
        <h2>{record ? (editing ? t("events.editTitle") : record.designation) : t("events.newTitle")}</h2>
        <div className="row">
          <a className="button" href="#/events">
            {t("common.back")}
          </a>
          {record && !editing && canEdit && ["draft", "confirmed"].includes(record.fulfillmentState) && (
            <button type="button" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </button>
          )}
        </div>
      </div>

      {record && (
        <p className="muted">
          {t("event.state")}: <strong>{t(`state.${record.fulfillmentState}` as TextKey)}</strong> · {t("event.version")}{" "}
          {record.version}
          {record.designationStatus === "provisional" && <span className="tag">{t("event.provisional")}</span>}
          <span className="tag">{record.eventType === "race" ? `🏁 ${t("event.type.race")}` : `📦 ${t("event.type.rental")}`}</span>
        </p>
      )}
      {/* DEC-028: equipment still out after the event. */}
      {record?.returnAlert && (
        <p className={record.returnAlert === "overdue" ? "alert bad" : "alert warn"} role="alert">
          {record.returnAlert === "overdue" ? `⛔ ${t("event.alert.overdue")}` : `⚠️ ${t("event.alert.endedOut")}`}
        </p>
      )}

      <form className="form grid" onSubmit={submit}>
        {/* DEC-031: the type is chosen once, when the Event is created. */}
        {!record && (
          <div className="wide type-choice" role="radiogroup" aria-label={t("event.type")}>
            <span className="label">{t("event.type")}</span>
            {(["rental", "race"] as const).map((ty) => (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={form.eventType === ty}
                className={form.eventType === ty ? "primary" : ""}
                onClick={() => setValue("eventType", ty)}
              >
                {ty === "race" ? "🏁" : "📦"} <strong>{t(`event.type.${ty}`)}</strong>
                <small>{t(`event.type.${ty}Hint`)}</small>
              </button>
            ))}
            <small className="muted">{t("event.typeFixedHint")}</small>
          </div>
        )}
        {field(
          "designation",
          "event.designation",
          <input value={form.designation} onChange={set("designation")} disabled={readOnly} maxLength={200} />,
          editing ? "event.designationHint" : undefined
        )}
        {field(
          "designationStatus",
          "event.designationStatus",
          <select value={form.designationStatus} onChange={set("designationStatus")} disabled={readOnly}>
            <option value="provisional">{t("event.provisional")}</option>
            <option value="final">{t("event.final")}</option>
          </select>
        )}
        {field(
          "responsibleUserId",
          "event.responsible",
          <select value={form.responsibleUserId} onChange={set("responsibleUserId")} disabled={readOnly}>
            {members.length === 0 && <option value={form.responsibleUserId}>{record?.responsibleName ?? me.user.displayName}</option>}
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        )}
        {field(
          "timezone",
          "event.timezone",
          <TimezoneSelect
            label={t("event.timezone")}
            value={form.timezone}
            onChange={(v) => setValue("timezone", v)}
            disabled={readOnly}
            preferred={[me.tenant.defaultTimezone]}
          />
        )}
        <div className="wide">
          <span className="label">{t("event.location")}</span>
          <LocationPicker
            key={locale}
            value={{ name: form.location, lat: form.locationLat, lng: form.locationLng }}
            onChange={onPoint}
            disabled={readOnly}
          />
        </div>
        {/* Timeline order: stock leaves, the event happens, stock comes back. */}
        {field(
          "departureDate",
          "event.departureDate",
          <DateField label={t("event.departureDate")} value={form.departureDate} onChange={(v) => setValue("departureDate", v)} disabled={readOnly} />,
          undefined,
          editing && form.eventDate ? t("event.departureLimit").replace("{n}", String(rules.departureMaxDays)).replace("{date}", showDate(addDays(form.eventDate, -rules.departureMaxDays), locale)) : undefined
        )}
        {field(
          "eventDate",
          "event.eventDate",
          <DateField label={t("event.eventDate")} value={form.eventDate} onChange={(v) => setValue("eventDate", v)} disabled={readOnly} />
        )}
        {field(
          "expectedReturnDate",
          "event.expectedReturnDate",
          <DateField label={t("event.expectedReturnDate")} value={form.expectedReturnDate} onChange={(v) => setValue("expectedReturnDate", v)} disabled={readOnly} />,
          undefined,
          editing && form.eventDate ? t("event.returnLimit").replace("{n}", String(rules.returnMaxBusinessDays)).replace("{date}", showDate(addBusinessDays(form.eventDate, rules.returnMaxBusinessDays), locale)) : undefined
        )}
        <label className="wide">
          <span>{t("event.notes")}</span>
          <textarea rows={3} value={form.notes} onChange={set("notes")} disabled={readOnly} />
        </label>

        {error && (
          <p className="bad wide" role="alert">
            {error}
          </p>
        )}
        {saved && !error && <p className="good wide">{t("common.saved")}</p>}

        {editing && (
          <div className="row wide">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
            {record && (
              <button
                type="button"
                onClick={() => {
                  setForm(fromRecord(record));
                  setEditing(false);
                  setError(null);
                  setTouched(false);
                }}
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        )}
      </form>
    </section>
    {record && !editing && (
      <EventLines
        event={record}
        canManage={canEdit}
        canCommit={me.capabilities.includes("reservation.commit")}
        onChanged={() => void load()}
      />
    )}
    {/* The Event map stays visible while editing (Walter, 2026-10-01). */}
    {record && (
      <EventMap
        key={`${record.id}-${locale}`}
        event={record}
        canEdit={me.capabilities.includes("map.edit")}
        features={me.tenant.features ?? []}
      />
    )}
    {record && me.capabilities.includes("audit.read") && (
      <AuditPanel recordType="event" recordId={record.id} version={record.version} />
    )}
    </>
  );
}
