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
  const [notice, setNotice] = useState<string | null>(null);
  // Messages for the actions in the list, shown above it.
  const [tableError, setTableError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; cmd: Command<unknown> } | null>(null);

  const load = () => api.members().then((r) => setMembers(r.items), () => setError(t("err.internal")));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Own messages instead of the browser's (D-002).
    if (!form.displayName.trim()) return setError(t("err.field.displayName"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError(t("err.field.email"));
    if (form.password.length < 10) return setError(t("err.field.password"));
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

  // Which profile a member's permissions match exactly, if any.
  const presetOf = (m: Member): PresetName | "custom" =>
    PRESET_NAMES.find((p) => {
      const caps = PRESETS[p] as readonly string[];
      return caps.length === m.capabilities.length && caps.every((c) => m.capabilities.includes(c as never));
    }) ?? "custom";

  async function change(m: Member, payload: { active: boolean; preset?: PresetName }) {
    setNotice(null);
    setTableError(null);
    try {
      await send("PUT", `/api/members/${m.userId}`, newCommand(payload));
      await load();
    } catch (err) {
      const reason = err instanceof ApiError ? (err.details?.reason as string | undefined) : undefined;
      setTableError(t(reason === "last_admin" ? "members.lastAdmin" : errorKey(err instanceof ApiError ? err.kind : "internal")));
    }
  }

  async function resetPassword(m: Member) {
    const pw = window.prompt(`${t("members.resetPrompt")} ${m.displayName}`);
    if (pw === null) return;
    setNotice(null);
    setTableError(null);
    if (pw.length < 10) return setTableError(t("err.field.password"));
    try {
      await send("POST", `/api/members/${m.userId}/password`, newCommand({ newPassword: pw }));
      setNotice(`${t("members.resetDone")} ${m.displayName}`);
    } catch (err) {
      setTableError(t(errorKey(err instanceof ApiError ? err.kind : "internal")));
    }
  }

  return (
    <section className="card">
      <h2>{t("members.title")}</h2>
      {notice && <p className="good">{notice}</p>}
      {tableError && (
        <p className="bad" role="alert">
          {tableError}
        </p>
      )}
      {members === null ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("members.name")}</th>
                <th>{t("members.email")}</th>
                <th>{t("members.role")}</th>
                <th>{t("members.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className={m.active ? "" : "muted"}>
                  <td>{m.displayName}</td>
                  <td>{m.email}</td>
                  <td>
                    <select
                      aria-label={t("members.role")}
                      value={presetOf(m)}
                      disabled={!m.active}
                      onChange={(e) => void change(m, { active: m.active, preset: e.target.value as PresetName })}
                    >
                      {presetOf(m) === "custom" && <option value="custom">{t("members.custom")}</option>}
                      {PRESET_NAMES.map((p) => (
                        <option key={p} value={p}>
                          {t(`preset.${p}` as TextKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{t(m.active ? "members.active" : "members.inactive")}</td>
                  <td className="row">
                    <button type="button" onClick={() => void change(m, { active: !m.active })}>
                      {t(m.active ? "members.deactivate" : "members.activate")}
                    </button>
                    {m.active && (
                      <button type="button" onClick={() => void resetPassword(m)}>
                        {t("members.resetPassword")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>{t("members.add")}</h3>
      <form className="form grid" onSubmit={submit} noValidate>
        <label>
          <span>{t("members.name")}</span>
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </label>
        <label>
          <span>{t("members.email")}</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          <span>{t("members.password")}</span>
          <input
            type="password"
            autoComplete="new-password"
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
