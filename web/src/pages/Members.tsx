import { useEffect, useRef, useState, type FormEvent } from "react";
import { PRESETS, type PresetName } from "@structura/domain";
import { ApiError, api, newCommand, send, type Command, type Member } from "../api.js";
import { errorKey, useT, type TextKey } from "../i18n.js";

const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

export function Members() {
  const t = useT();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "", password: "", preset: "inventory_operator" as PresetName });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; cmd: Command<unknown> } | null>(null);

  const load = () => api.members().then((r) => setMembers(r.items), () => setError(t("err.internal")));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const key = JSON.stringify(form);
    if (pending.current?.key !== key) pending.current = { key, cmd: newCommand(form) };
    setBusy(true);
    setError(null);
    try {
      await send("POST", "/api/members", pending.current.cmd);
      pending.current = null;
      setForm({ displayName: "", email: "", password: "", preset: form.preset });
      await load();
    } catch (err) {
      const kind = err instanceof ApiError ? err.kind : "internal";
      if (kind !== "unreachable") pending.current = null;
      const field = err instanceof ApiError ? (err.details?.field as string | undefined) : undefined;
      setError(t(field === "email" ? "err.field.email" : kind === "validation" ? "err.field.password" : errorKey(kind)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("members.title")}</h2>
      {members === null ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("members.name")}</th>
                <th>{t("members.email")}</th>
                <th>{t("members.permissions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>{m.displayName}</td>
                  <td>{m.email}</td>
                  <td className="small">{m.capabilities.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>{t("members.add")}</h3>
      <form className="form grid" onSubmit={submit}>
        <label>
          <span>{t("members.name")}</span>
          <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </label>
        <label>
          <span>{t("members.email")}</span>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          <span>{t("members.password")}</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          <span>{t("members.role")}</span>
          <select value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value as PresetName })}>
            {PRESET_NAMES.map((p) => (
              <option key={p} value={p}>
                {t(`preset.${p}` as TextKey)}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="bad wide" role="alert">
            {error}
          </p>
        )}
        <div className="row wide">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("common.saving") : t("members.add")}
          </button>
        </div>
      </form>
    </section>
  );
}
