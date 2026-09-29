import { useEffect, useState } from "react";
import { api, type MovementRecord } from "../api.js";
import { describeFailure } from "../forms.js";
import { useT, type TextKey } from "../i18n.js";
import { MovementTable } from "./MovementTable.js";

export function MovementsList({ canMove, canCorrect }: { canMove: boolean; canCorrect: boolean }) {
  const t = useT();
  const [items, setItems] = useState<MovementRecord[] | null>(null);
  const [error, setError] = useState<TextKey | null>(null);

  const load = () => api.movements().then((r) => setItems(r.items), (err) => setError(describeFailure(err).message));
  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="card">
      <div className="row between">
        <h2>{t("mov.title")}</h2>
        {canMove && (
          <a className="button primary" href="#/movements/new">
            + {t("mov.new")}
          </a>
        )}
      </div>
      {error && <p className="bad">{t(error)}</p>}
      {items === null && !error && <p>{t("common.loading")}</p>}
      {items && <MovementTable movements={items} canCorrect={canCorrect} onChanged={() => void load()} />}
    </section>
  );
}
