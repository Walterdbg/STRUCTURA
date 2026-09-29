import { useContext, useState } from "react";
import { get } from "../api.js";
import { LocaleContext, hasKey, useT, type TextKey } from "../i18n.js";

interface AuditRecord {
  id: string;
  action: string;
  actorName: string | null;
  deploymentId: string;
  change: unknown;
  recordedAt: string;
}

// "Who changed what, and when" for one record (spec 18.2, AT-18).
// Loaded on demand; only shown to people with audit.read.
export function AuditPanel({ recordType, recordId, version }: { recordType: string; recordId: string; version: number }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const [items, setItems] = useState<AuditRecord[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && loadedFor !== version) {
      try {
        const r = await get<{ items: AuditRecord[] }>(`/api/audit?recordType=${recordType}&recordId=${recordId}&limit=100`);
        setItems(r.items);
        setLoadedFor(version);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    }
  }

  const label = (action: string) => {
    const key = `audit.${action}`;
    return hasKey(key) ? t(key as TextKey) : action;
  };

  return (
    <section className="card">
      <button type="button" className="link" onClick={() => void toggle()} aria-expanded={open}>
        {open ? "▾" : "▸"} {t("audit.title")}
      </button>
      {open && failed && <p className="bad">{t("err.internal")}</p>}
      {open && !failed && items === null && <p>{t("common.loading")}</p>}
      {open && items && items.length === 0 && <p className="muted">{t("common.none")}</p>}
      {open && items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("mov.when")}</th>
                <th>{t("mov.by")}</th>
                <th>{t("audit.action")}</th>
                <th>{t("audit.details")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="small">
                    {new Date(a.recordedAt).toLocaleString(locale === "es" ? "es-PA" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="small">{a.actorName ?? a.deploymentId}</td>
                  <td>{label(a.action)}</td>
                  <td className="small">
                    <details>
                      <summary>{t("audit.show")}</summary>
                      <pre className="change">{JSON.stringify(a.change, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
