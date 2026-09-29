import { useEffect, useState } from "react";
import { ApiError, api, get, type EventRecord, type ItemRecord } from "../api.js";
import { describeFailure, useCommandSender } from "../forms.js";
import { useT, type TextKey } from "../i18n.js";

interface LineRecord {
  id: string;
  itemId: string;
  itemName: string;
  internalReference: string | null;
  unit: string;
  requested: string;
  reserved: string;
  notes: string | null;
  availability: { available: string; ok: boolean } | null;
}

interface Draft {
  itemId: string;
  quantity: string;
  notes: string;
}

// The Event's products (workbook "NUEVO ALQUILER" lower table):
// edit lines, check availability for the rental dates, then confirm.
export function EventLines({
  event,
  canManage,
  canCommit,
  onChanged,
}: {
  event: EventRecord;
  canManage: boolean;
  canCommit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const send = useCommandSender();
  const [lines, setLines] = useState<LineRecord[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [short, setShort] = useState<{ name: string; requested: string; available: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const editable = event.fulfillmentState === "draft" || event.fulfillmentState === "confirmed";

  const load = async () => {
    const r = await get<{ items: LineRecord[] }>(`/api/events/${event.id}/lines`);
    setLines(r.items);
    setDrafts(r.items.map((l) => ({ itemId: l.itemId, quantity: l.requested, notes: l.notes ?? "" })));
  };
  useEffect(() => {
    void load().catch(() => setError("err.internal"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.version]);
  useEffect(() => {
    if (editing && items.length === 0) api.items("", false).then((r) => setItems(r.items), () => {});
  }, [editing, items.length]);

  function fail(err: unknown) {
    const f = describeFailure(err);
    setError(err instanceof ApiError && err.kind === "insufficient_availability" ? "ev.notReserved" : f.message);
    const details = err instanceof ApiError ? (err.details?.lines as typeof short | undefined) : undefined;
    setShort(details ?? []);
  }

  async function saveLines() {
    setBusy(true);
    setError(null);
    setShort([]);
    try {
      await send("PUT", `/api/events/${event.id}/lines`, {
        lines: drafts.filter((d) => d.itemId).map((d) => ({ itemId: d.itemId, quantity: d.quantity.trim(), notes: d.notes || null })),
      }, event.version);
      setEditing(false);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function action(kind: "confirm" | "cancel") {
    let note: string | null = null;
    if (kind === "cancel") {
      const answer = window.prompt(t("ev.cancelPrompt"));
      if (answer === null) return;
      note = answer.trim() || null;
    }
    setBusy(true);
    setError(null);
    setShort([]);
    try {
      await send("POST", `/api/events/${event.id}/${kind}`, { note }, event.version);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const hasDates = Boolean(event.departureDate && event.expectedReturnDate);
  const allOk = lines?.every((l) => l.availability?.ok) ?? false;

  return (
    <section className="card">
      <div className="row between">
        <h3 className="flush">{t("ev.products")}</h3>
        <div className="row">
          {canManage && editable && !editing && (
            <button type="button" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </button>
          )}
          {canCommit && event.fulfillmentState === "draft" && !editing && (
            <button type="button" className="primary" disabled={busy || !lines?.length || !hasDates} onClick={() => void action("confirm")}>
              {t("ev.confirm")}
            </button>
          )}
          {canManage && editable && !editing && (
            <button type="button" disabled={busy} onClick={() => void action("cancel")}>
              {t("ev.cancel")}
            </button>
          )}
        </div>
      </div>
      <p className="muted small">
        {hasDates ? `${t("ev.rentalDates")}: ${event.departureDate} → ${event.expectedReturnDate} (${t("ev.inclusive")})` : t("ev.needDates")}
      </p>

      {lines === null && <p>{t("common.loading")}</p>}
      {lines && !editing && lines.length === 0 && <p className="muted">{t("ev.noProducts")}</p>}
      {lines && !editing && lines.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("mov.item")}</th>
                <th className="num">{t("ev.requested")}</th>
                <th className="num">{t("ev.reserved")}</th>
                <th className="num">{t("ev.available")}</th>
                <th>{t("item.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <a href={`#/inventory/${l.itemId}`}>{l.itemName}</a>
                    {l.internalReference && <div className="small muted">{l.internalReference}</div>}
                  </td>
                  <td className="num">
                    {l.requested} <span className="small muted">{l.unit}</span>
                  </td>
                  <td className="num">{l.reserved}</td>
                  <td className={`num ${l.availability ? (l.availability.ok ? "good" : "bad") : ""}`}>
                    {l.availability ? l.availability.available : t("common.none")}
                    {l.availability && !l.availability.ok && <div className="small">{t("ev.insufficient")}</div>}
                  </td>
                  <td className="small wrap">{l.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines && !editing && lines.length > 0 && hasDates && event.fulfillmentState === "draft" && (
        <p className={`small ${allOk ? "good" : "bad"}`}>{t(allOk ? "ev.allAvailable" : "ev.someShort")}</p>
      )}

      {editing && (
        <div className="lines">
          {drafts.map((d, i) => (
            <div className="line" key={i}>
              <select aria-label={t("mov.item")} value={d.itemId} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                <option value="">{t("mov.item")}…</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.internalReference ? ` · ${x.internalReference}` : ""}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("ev.requested")}
                inputMode="decimal"
                placeholder={t("ev.requested")}
                value={d.quantity}
                onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
              />
              <input
                aria-label={t("item.notes")}
                placeholder={t("item.notes")}
                value={d.notes}
                onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
              />
              <button type="button" aria-label="×" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <button type="button" onClick={() => setDrafts([...drafts, { itemId: "", quantity: "", notes: "" }])}>
              + {t("mov.addLine")}
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => void saveLines()}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
            <button type="button" onClick={() => (setEditing(false), setError(null), setShort([]), void load())}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bad" role="alert">
          <p>{t(error)}</p>
          {short.length > 0 && (
            <ul className="small">
              {short.map((s) => (
                <li key={s.name}>
                  {s.name}: {t("ev.requested")} {s.requested}, {t("ev.available")} {s.available}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
