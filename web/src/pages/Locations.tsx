import { useEffect, useState, type FormEvent } from "react";
import { LOCATION_KINDS } from "@structura/domain";
import { api, type LocationRecord } from "../api.js";
import { describeFailure, useCommandSender } from "../forms.js";
import { useT, type TextKey } from "../i18n.js";

type Kind = LocationRecord["kind"];
const empty = { designation: "", kind: "warehouse" as Kind, notes: "", active: true };

export function Locations({ canManage }: { canManage: boolean }) {
  const t = useT();
  const send = useCommandSender();
  const [items, setItems] = useState<LocationRecord[] | null>(null);
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<TextKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.locations().then((r) => setItems(r.items), () => setError("err.internal"));
  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.designation.trim()) {
      setError("err.field.designation.loc");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = { ...form, notes: form.notes || null };
    try {
      if (editing) await send("PUT", `/api/locations/${editing.id}`, payload, editing.version);
      else await send("POST", "/api/locations", payload);
      setEditing(null);
      setForm(empty);
      await load();
    } catch (err) {
      const f = describeFailure(err);
      setError(f.field === "designation" ? "err.field.designation.loc" : f.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("loc.title")}</h2>
      {items === null && <p>{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{t("loc.empty")}</p>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("loc.designation")}</th>
                <th>{t("loc.kind")}</th>
                <th>{t("loc.notes")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className={l.active ? "" : "muted"}>
                  <td>
                    {l.designation}
                    {!l.active && <span className="tag">{t("loc.inactive")}</span>}
                  </td>
                  <td>{t(`kind.${l.kind}` as TextKey)}</td>
                  <td className="small">{l.notes ?? ""}</td>
                  <td>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(l);
                          setForm({ designation: l.designation, kind: l.kind, notes: l.notes ?? "", active: l.active });
                          setError(null);
                        }}
                      >
                        {t("common.edit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <h3>{editing ? `${t("common.edit")}: ${editing.designation}` : t("loc.add")}</h3>
          <form className="form grid" onSubmit={submit} noValidate>
            <label>
              <span>{t("loc.designation")}</span>
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </label>
            <label>
              <span>{t("loc.kind")}</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                {LOCATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}` as TextKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("loc.notes")}</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>{t("loc.active")}</span>
            </label>
            {error && (
              <p className="bad wide" role="alert">
                {t(error)}
              </p>
            )}
            <div className="row wide">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
              {editing && (
                <button type="button" onClick={() => (setEditing(null), setForm(empty), setError(null))}>
                  {t("common.cancel")}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
