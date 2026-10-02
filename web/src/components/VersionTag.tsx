import { useEffect, useState } from "react";
import { get } from "../api.js";

// The running version, always in view under the STRUCTURA name (Walter,
// 2026-10-01: "add a note with the version somewhere visible").
export function VersionTag() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    get<{ version: string }>("/api/health").then((h) => setVersion(h.version), () => {});
  }, []);
  return version ? <span className="version-tag">v{version}</span> : null;
}
