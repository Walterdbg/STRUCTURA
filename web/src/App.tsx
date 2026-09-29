import { useCallback, useEffect, useState } from "react";
import { LOCALES, type Locale } from "@structura/domain";
import { loadLocale, saveLocale, translate, type TextKey } from "./i18n.js";

interface Health {
  status: "ok" | "degraded";
  version: string;
  engineMode: "cloud" | "local";
  deploymentId: string;
}

type HealthState = { kind: "checking" } | { kind: "unreachable" } | { kind: "loaded"; health: Health };

export function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const t = (key: TextKey) => translate(locale, key);

  const check = useCallback(async () => {
    setHealth({ kind: "checking" });
    try {
      const res = await fetch("/api/health");
      const body = (await res.json()) as Health;
      setHealth({ kind: "loaded", health: body });
    } catch {
      setHealth({ kind: "unreachable" });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>STRUCTURA</h1>
          <p className="tagline">{t("app.tagline")}</p>
        </div>
        <label className="lang">
          <span>{t("language.label")}</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l === "es" ? "Español" : "English"}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="card" aria-live="polite">
        <h2>{t("status.title")}</h2>
        {health.kind === "checking" && <p>{t("status.checking")}</p>}
        {health.kind === "unreachable" && (
          <p className="bad">
            {t("status.unreachable")}{" "}
            <button type="button" onClick={() => void check()}>
              {t("status.retry")}
            </button>
          </p>
        )}
        {health.kind === "loaded" && (
          <>
            <p className={health.health.status === "ok" ? "good" : "bad"}>
              {t(health.health.status === "ok" ? "status.ok" : "status.degraded")}
            </p>
            <dl>
              <dt>{t("status.version")}</dt>
              <dd>{health.health.version}</dd>
              <dt>{t("status.engine")}</dt>
              <dd>{t(health.health.engineMode === "local" ? "engine.local" : "engine.cloud")}</dd>
              <dt>{t("status.deployment")}</dt>
              <dd>{health.health.deploymentId}</dd>
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
