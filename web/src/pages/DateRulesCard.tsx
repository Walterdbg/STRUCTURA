import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_DATE_RULES, type DateRules } from "@structura/domain";
import { ApiError, get, newCommand, send } from "../api.js";
import { errorKey, useT } from "../i18n.js";

// The organization's date rules (DEC-028), changed by its administrator:
// how early stock may leave, how late it must be back, and when the
// "equipment still out" warning appears.
export function DateRulesCard() {
  const t = useT();
  const [rules, setRules] = useState<DateRules>(DEFAULT_DATE_RULES);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<DateRules>("/api/settings/date-rules").then(setRules, () => {});
  }, []);

  const field = (k: keyof DateRules, label: string, max: number) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={rules[k]}
        onChange={(e) => {
          setMsg(null);
          setRules({ ...rules, [k]: Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))) });
        }}
      />
    </label>
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("PUT", "/api/settings/date-rules", newCommand(rules));
      setMsg({ ok: true, text: t("common.saved") });
    } catch (err) {
      setMsg({ ok: false, text: t(errorKey(err instanceof ApiError ? err.kind : "internal")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("rules.title")}</h2>
      <p className="muted small">{t("rules.hint")}</p>
      <form className="form grid" onSubmit={save}>
        {field("departureMaxDays", t("rules.departureMaxDays"), 365)}
        {field("returnMaxBusinessDays", t("rules.returnMaxBusinessDays"), 260)}
        {field("returnWarningDays", t("rules.returnWarningDays"), 60)}
        <div className="row wide">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
          {msg && <span className={msg.ok ? "good" : "bad"}>{msg.text}</span>}
        </div>
      </form>
    </section>
  );
}
