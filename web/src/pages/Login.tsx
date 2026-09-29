import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api.js";
import { useT } from "../i18n.js";

interface Tenant {
  id: string;
  name: string;
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent, tenantId?: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password, tenantId);
      onSignedIn();
    } catch (err) {
      if (err instanceof ApiError && err.kind === "choose_tenant") {
        setTenants((err.body as { tenants: Tenant[] }).tenants);
      } else if (err instanceof ApiError && err.details?.reason === "throttled") {
        setError(t("login.throttled"));
      } else if (err instanceof ApiError && err.kind === "unreachable") {
        setError(t("err.unreachable"));
      } else {
        setError(t("login.wrong"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h2>{t("login.title")}</h2>
      <form onSubmit={(e) => submit(e)} className="form">
        <label>
          <span>{t("login.email")}</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span>{t("login.password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="bad" role="alert">{error}</p>}
        {tenants ? (
          <div className="choices">
            <p>{t("login.chooseTenant")}</p>
            {tenants.map((x) => (
              <button key={x.id} type="button" disabled={busy} onClick={(e) => submit(e, x.id)}>
                {x.name}
              </button>
            ))}
          </div>
        ) : (
          <button type="submit" className="primary" disabled={busy}>
            {t("login.submit")}
          </button>
        )}
      </form>
    </section>
  );
}
