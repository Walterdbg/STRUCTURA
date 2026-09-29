import { useEffect, useState } from "react";
import { get } from "../api.js";
import { useT } from "../i18n.js";

interface Health {
  status: "ok" | "degraded";
  version: string;
  engineMode: "cloud" | "local";
  deploymentId: string;
}

// Small footer: which version, which engine, is the server reachable.
export function SystemStatus() {
  const t = useT();
  const [health, setHealth] = useState<Health | "checking" | "unreachable">("checking");

  useEffect(() => {
    get<Health>("/api/health").then(setHealth, () => setHealth("unreachable"));
  }, []);

  if (health === "checking") return <footer className="status">{t("status.checking")}</footer>;
  if (health === "unreachable") return <footer className="status bad">{t("status.unreachable")}</footer>;
  return (
    <footer className="status">
      <span className={health.status === "ok" ? "good" : "bad"}>
        {t(health.status === "ok" ? "status.ok" : "status.degraded")}
      </span>
      <span>
        {t("status.version")} {health.version}
      </span>
      <span>{t(health.engineMode === "local" ? "engine.local" : "engine.cloud")}</span>
      <span>
        {t("status.deployment")} {health.deploymentId}
      </span>
    </footer>
  );
}
