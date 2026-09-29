import { useContext, useState } from "react";
import type { MovementRecord } from "../api.js";
import { describeFailure, useCommandSender } from "../forms.js";
import { LocaleContext, useT, type TextKey } from "../i18n.js";

// Movement history, used on the Movements page and on each product.
// Correcting posts a linked reverse movement (AT-03); nothing is deleted.
export function MovementTable({
  movements,
  canCorrect,
  onChanged,
}: {
  movements: MovementRecord[];
  canCorrect: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const send = useCommandSender();
  const [error, setError] = useState<TextKey | null>(null);

  async function correct(m: MovementRecord) {
    const note = window.prompt(t("mov.correctPrompt"));
    if (!note || !note.trim()) return;
    setError(null);
    try {
      await send("POST", "/api/movements/corrections", { movementId: m.id, note: note.trim() });
      onChanged();
    } catch (err) {
      setError(describeFailure(err).message);
    }
  }

  if (movements.length === 0) return <p className="muted">{t("mov.empty")}</p>;
  return (
    <>
      {error && (
        <p className="bad" role="alert">
          {t(error)}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("mov.when")}</th>
              <th>{t("mov.reason")}</th>
              <th>{t("mov.lines")}</th>
              <th>{t("mov.source")}</th>
              <th>{t("mov.destination")}</th>
              <th>{t("mov.by")}</th>
              <th>{t("mov.note")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className={m.correctedByMovementId ? "struck" : ""}>
                <td className="small">{new Date(m.occurredAt).toLocaleString(locale === "es" ? "es-PA" : "en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  {t(`reason.${m.reason}` as TextKey)}
                  {m.correctedByMovementId && <span className="tag">{t("mov.corrected")}</span>}
                </td>
                <td className="small">
                  {m.lines.map((l) => (
                    <div key={l.itemId}>
                      {l.quantity} {l.unit} · <a href={`#/inventory/${l.itemId}`}>{l.itemName}</a>
                    </div>
                  ))}
                </td>
                <td className="small">{m.sourceName ?? <span className="muted">{t("mov.outside")}</span>}</td>
                <td className="small">{m.destinationName ?? <span className="muted">{t("mov.outside")}</span>}</td>
                <td className="small">{m.actorName ?? ""}</td>
                <td className="small wrap">{m.note ?? ""}</td>
                <td>
                  {canCorrect && m.reason !== "correction" && !m.correctedByMovementId && (
                    <button type="button" onClick={() => void correct(m)}>
                      {t("mov.correct")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
