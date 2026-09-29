import { useEffect, useState } from "react";
import { ApiError, api, type EventRecord } from "../api.js";
import { errorKey, useT, type TextKey } from "../i18n.js";

export function EventsList({ canCreate }: { canCreate: boolean }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<EventRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.events(search).then(
        (page) => live && (setItems(page.items), setError(null)),
        (err) => live && setError(t(errorKey(err instanceof ApiError ? err.kind : "internal")))
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <section className="card">
      <div className="row between">
        <h2>{t("events.title")}</h2>
        {/* UC-13: a visible way to create an Event */}
        {canCreate && (
          <a className="button primary" href="#/events/new">
            + {t("events.create")}
          </a>
        )}
      </div>
      <input
        type="search"
        className="search"
        placeholder={t("events.searchPlaceholder")}
        aria-label={t("common.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="bad">{error}</p>}
      {items === null && !error && <p>{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{search ? t("common.noResults") : t("events.empty")}</p>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("event.designation")}</th>
                <th>{t("event.departureDate")}</th>
                <th>{t("event.expectedReturnDate")}</th>
                <th>{t("event.responsible")}</th>
                <th>{t("event.state")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <a href={`#/events/${e.id}`}>{e.designation}</a>
                    {e.designationStatus === "provisional" && <span className="tag">{t("event.provisional")}</span>}
                  </td>
                  <td>{e.departureDate ?? t("common.none")}</td>
                  <td>{e.expectedReturnDate ?? t("common.none")}</td>
                  <td>{e.responsibleName}</td>
                  <td>{t(`state.${e.fulfillmentState}` as TextKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
