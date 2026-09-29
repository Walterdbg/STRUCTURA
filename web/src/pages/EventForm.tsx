import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { eventFields } from "@structura/domain";
import { ApiError, api, newCommand, send, type Command, type EventRecord, type Me, type Member } from "../api.js";
import { errorKey, hasKey, useT, type TextKey } from "../i18n.js";
import { go } from "../router.js";

interface FormState {
  designation: string;
  designationStatus: "provisional" | "final";
  responsibleUserId: string;
  timezone: string;
  location: string;
  eventDate: string;
  departureDate: string;
  expectedReturnDate: string;
  notes: string;
}

const blank = (me: Me): FormState => ({
  designation: "",
  designationStatus: "provisional",
  responsibleUserId: me.user.id,
  timezone: me.tenant.defaultTimezone,
  location: "",
  eventDate: "",
  departureDate: "",
  expectedReturnDate: "",
  notes: "",
});

const fromRecord = (e: EventRecord): FormState => ({
  designation: e.designation,
  designationStatus: e.designationStatus,
  responsibleUserId: e.responsibleUserId,
  timezone: e.timezone,
  location: e.location ?? "",
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

const DATE_FIELDS = ["eventDate", "departureDate", "expectedReturnDate"];

// One localized message per field, from the same rules the server applies.
function fieldErrors(f: FormState): Record<string, TextKey> {
  const parsed = eventFields.safeParse(toPayload(f));
  if (parsed.success) return {};
  const out: Record<string, TextKey> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (out[field]) continue;
    if (field === "expectedReturnDate" && issue.code === "custom") out[field] = "err.field.expectedReturnDate";
    else if (DATE_FIELDS.includes(field)) out[field] = "err.field.date";
    else if (hasKey(`err.field.${field}`)) out[field] = `err.field.${field}` as TextKey;
  }
  return out;
}

let timezones: string[] = [];
try {
  timezones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
} catch {
  /* older browser: free text still works */
}

export function EventForm({ me, eventId }: { me: Me; eventId?: string }) {
  const t = useT();
  const canEdit = me.capabilities.includes("event.manage");
  const [record, setRecord] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<FormState>(() => blank(me));
  const [editing, setEditing] = useState(!eventId);
  const [members, setMembers] = useState<Member[]>([]);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // The same attempt keeps its command ID across retries (spec 11.2).
  const pending = useRef<{ key: string; cmd: Command<unknown> } | null>(null);

  useEffect(() => {
    api.members().then((r) => setMembers(r.items.filter((m) => m.active)), () => {});
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

  const errors = useMemo(() => (touched ? fieldErrors(form) : {}), [form, touched]);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(fieldErrors(form)).length) {
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
      setError(t(errorKey(kind)));
    } finally {
      setBusy(false);
    }
  }

  if (eventId && !record && !error) return <p>{t("common.loading")}</p>;

  const readOnly = !editing;
  const field = (name: keyof FormState, label: TextKey, input: JSX.Element, hint?: TextKey) => (
    <label className={errors[name] ? "invalid" : ""}>
      <span>{t(label)}</span>
      {input}
      {hint && <small className="muted">{t(hint)}</small>}
      {errors[name] && <small className="bad">{t(errors[name]!)}</small>}
    </label>
  );

  return (
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
        </p>
      )}

      <form className="form grid" onSubmit={submit}>
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
          <>
            <input list="tz-list" value={form.timezone} onChange={set("timezone")} disabled={readOnly} />
            <datalist id="tz-list">
              {timezones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </>
        )}
        {field("location", "event.location", <input value={form.location} onChange={set("location")} disabled={readOnly} />)}
        {field("eventDate", "event.eventDate", <input type="date" value={form.eventDate} onChange={set("eventDate")} disabled={readOnly} />)}
        {field(
          "departureDate",
          "event.departureDate",
          <input type="date" value={form.departureDate} onChange={set("departureDate")} disabled={readOnly} />
        )}
        {field(
          "expectedReturnDate",
          "event.expectedReturnDate",
          <input type="date" value={form.expectedReturnDate} onChange={set("expectedReturnDate")} disabled={readOnly} />
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
  );
}
