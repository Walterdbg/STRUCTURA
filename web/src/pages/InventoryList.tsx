import { useEffect, useState } from "react";
import { api, photoUrl, type ItemRecord } from "../api.js";
import { describeFailure } from "../forms.js";
import { useT, type TextKey } from "../i18n.js";

export function InventoryList({ canManage, canMove }: { canManage: boolean; canMove: boolean }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  const [items, setItems] = useState<ItemRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<TextKey | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.items(search, inactive).then(
        (page) => live && (setItems(page.items), setTotal(page.total), setError(null)),
        (err) => live && setError(describeFailure(err).message)
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, inactive]);

  return (
    <section className="card">
      <div className="row between">
        <h2>{t("inv.title")}</h2>
        <div className="row">
          {canMove && (
            <a className="button" href="#/movements/new">
              {t("inv.move")}
            </a>
          )}
          {canManage && (
            <a className="button primary" href="#/inventory/new">
              + {t("inv.create")}
            </a>
          )}
        </div>
      </div>
      <div className="row">
        <input
          type="search"
          className="search"
          placeholder={t("inv.searchPlaceholder")}
          aria-label={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
          <span>{t("inv.showInactive")}</span>
        </label>
      </div>
      {error && <p className="bad">{t(error)}</p>}
      {items === null && !error && <p>{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{search ? t("common.noResults") : t("inv.empty")}</p>}
      {items && items.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>{t("item.name")}</th>
                  <th>{t("item.internalReference")}</th>
                  <th>{t("item.barcode")}</th>
                  <th className="num">{t("stock.total")}</th>
                  <th className="num">{t("stock.inWarehouse")}</th>
                  <th className="num">{t("stock.atEvents")}</th>
                  <th className="num">{t("stock.inRepair")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={i.active ? "" : "muted"}>
                    <td className="thumb-cell">
                      {i.photo ? <img className="thumb" src={photoUrl(i.photo.attachmentId)} alt="" loading="lazy" /> : <span className="thumb empty" />}
                    </td>
                    <td>
                      <a href={`#/inventory/${i.id}`}>{i.name}</a>
                      <div className="small muted">{i.categoryPath ?? ""}</div>
                    </td>
                    <td className="small">{i.internalReference ?? ""}</td>
                    <td className="small mono">{i.barcode ?? ""}</td>
                    <td className="num">
                      {i.stock.total} <span className="small muted">{i.unit}</span>
                    </td>
                    <td className="num">{i.stock.inWarehouse}</td>
                    <td className="num">{i.stock.atEvents}</td>
                    <td className="num">{i.stock.inRepair}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > items.length && <p className="small muted">{`${items.length} / ${total}`}</p>}
        </>
      )}
    </section>
  );
}
