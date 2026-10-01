import { useState, type FormEvent } from "react";
import type { Locale } from "@structura/domain";
import { ApiError, newCommand, send, type Me } from "../api.js";
import { errorKey, useT, type TextKey } from "../i18n.js";

// D-009: every person can change their own name, language and password.
export function MyAccount({ me, onSaved, onLocale }: { me: Me; onSaved: () => void; onLocale: (l: Locale) => void }) {
  const t = useT();
  const [name, setName] = useState(me.user.displayName);
  const [locale, setLocale] = useState<Locale>(me.user.locale === "en" ? "en" : "es");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; key: TextKey } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; key: TextKey } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setProfileMsg({ ok: false, key: "err.field.displayName" });
    setBusy(true);
    try {
      await send("PUT", "/api/me", newCommand({ displayName: name.trim(), locale }));
      onLocale(locale);
      onSaved();
      setProfileMsg({ ok: true, key: "common.saved" });
    } catch (err) {
      setProfileMsg({ ok: false, key: errorKey(err instanceof ApiError ? err.kind : "internal") });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!pw.current) return setPwMsg({ ok: false, key: "account.currentRequired" });
    if (pw.next.length < 10) return setPwMsg({ ok: false, key: "err.field.password" });
    if (pw.next !== pw.repeat) return setPwMsg({ ok: false, key: "account.mismatch" });
    setBusy(true);
    try {
      await send("POST", "/api/me/password", newCommand({ currentPassword: pw.current, newPassword: pw.next }));
      setPw({ current: "", next: "", repeat: "" });
      setPwMsg({ ok: true, key: "account.passwordChanged" });
    } catch (err) {
      const field = err instanceof ApiError ? err.details?.field : undefined;
      setPwMsg({
        ok: false,
        key: field === "currentPassword" ? "account.currentWrong" : field === "newPassword" ? "account.sameAsOld" : errorKey(err instanceof ApiError ? err.kind : "internal"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card narrow">
        <h2>{t("account.title")}</h2>
        <p className="muted small">
          {me.user.email} · {me.tenant.name}
        </p>
        <form className="form" onSubmit={saveProfile} noValidate>
          <label>
            <span>{t("members.name")}</span>
            <input value={name} onChange={(e) => (setName(e.target.value), setProfileMsg(null))} />
          </label>
          <label>
            <span>{t("language.label")}</span>
            <select value={locale} onChange={(e) => (setLocale(e.target.value as Locale), setProfileMsg(null))}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <small className="muted">{t("account.languageHint")}</small>
          </label>
          {profileMsg && <p className={profileMsg.ok ? "good" : "bad"}>{t(profileMsg.key)}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {t("common.save")}
          </button>
        </form>
      </section>

      <section className="card narrow">
        <h3 className="flush">{t("account.changePassword")}</h3>
        <form className="form" onSubmit={changePassword} noValidate>
          <label>
            <span>{t("account.currentPassword")}</span>
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => (setPw({ ...pw, current: e.target.value }), setPwMsg(null))} />
          </label>
          <label>
            <span>{t("account.newPassword")}</span>
            <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => (setPw({ ...pw, next: e.target.value }), setPwMsg(null))} />
          </label>
          <label>
            <span>{t("account.repeatPassword")}</span>
            <input type="password" autoComplete="new-password" value={pw.repeat} onChange={(e) => (setPw({ ...pw, repeat: e.target.value }), setPwMsg(null))} />
          </label>
          <small className="muted">{t("account.passwordHint")}</small>
          {pwMsg && <p className={pwMsg.ok ? "good" : "bad"}>{t(pwMsg.key)}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {t("account.changePassword")}
          </button>
        </form>
      </section>
    </>
  );
}
