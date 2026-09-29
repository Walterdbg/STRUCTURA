import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PRODUCT_TYPES, UNIT_SUGGESTIONS, itemFields, uuidv7 } from "@structura/domain";
import {
  ApiError,
  api,
  photoUrl,
  uploadPhoto,
  type ItemRecord,
  type LocationRecord,
  type MovementRecord,
  type PositionRecord,
} from "../api.js";
import { checkFields, describeFailure, useCommandSender } from "../forms.js";
import { hasKey, useT, type TextKey } from "../i18n.js";
import { go } from "../router.js";
import { AuditPanel } from "./AuditPanel.js";
import { MovementTable } from "./MovementTable.js";

interface FormState {
  name: string;
  internalReference: string;
  barcode: string;
  responsible: string;
  categoryPath: string;
  productType: ItemRecord["productType"];
  unit: string;
  quantityDecimals: number;
  salesPrice: string;
  priceCurrency: string;
  brand: string;
  model: string;
  baseLocationId: string;
  notes: string;
  active: boolean;
}

const blank: FormState = {
  name: "",
  internalReference: "",
  barcode: "",
  responsible: "",
  categoryPath: "",
  productType: "rentable",
  unit: "Unidad",
  quantityDecimals: 0,
  salesPrice: "",
  priceCurrency: "",
  brand: "",
  model: "",
  baseLocationId: "",
  notes: "",
  active: true,
};

const fromRecord = (i: ItemRecord): FormState => ({
  name: i.name,
  internalReference: i.internalReference ?? "",
  barcode: i.barcode ?? "",
  responsible: i.responsible ?? "",
  categoryPath: i.categoryPath ?? "",
  productType: i.productType,
  unit: i.unit,
  quantityDecimals: i.quantityDecimals,
  salesPrice: i.salesPrice ?? "",
  priceCurrency: i.priceCurrency ?? "",
  brand: i.brand ?? "",
  model: i.model ?? "",
  baseLocationId: i.baseLocationId ?? "",
  notes: i.notes ?? "",
  active: i.active,
});

const nullIfEmpty = (s: string) => (s.trim() === "" ? null : s);
const toPayload = (f: FormState) => ({
  ...f,
  internalReference: nullIfEmpty(f.internalReference),
  barcode: nullIfEmpty(f.barcode),
  responsible: nullIfEmpty(f.responsible),
  categoryPath: nullIfEmpty(f.categoryPath),
  salesPrice: nullIfEmpty(f.salesPrice),
  priceCurrency: nullIfEmpty(f.priceCurrency),
  brand: nullIfEmpty(f.brand),
  model: nullIfEmpty(f.model),
  baseLocationId: nullIfEmpty(f.baseLocationId),
  notes: nullIfEmpty(f.notes),
});

const fieldMessage = (field: string): TextKey => (hasKey(`err.field.${field}`) ? (`err.field.${field}` as TextKey) : "err.validation");

type PhotoState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; message: TextKey };

export function ItemForm({
  itemId,
  canManage,
  canMove,
  canCorrect,
  canAudit = false,
  canPhoto = false,
}: {
  itemId?: string;
  canManage: boolean;
  canMove: boolean;
  canCorrect: boolean;
  canAudit?: boolean;
  canPhoto?: boolean;
}) {
  const t = useT();
  const send = useCommandSender();
  const [record, setRecord] = useState<ItemRecord | null>(null);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [history, setHistory] = useState<MovementRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [form, setForm] = useState<FormState>(blank);
  const [initial, setInitial] = useState({ quantity: "", locationId: "" });
  const [editing, setEditing] = useState(!itemId);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<{ message: TextKey; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ kind: "idle" });
  const [imageBroken, setImageBroken] = useState(false);
  // Retrying the same file after a lost connection reuses its command ID.
  const pendingPhoto = useRef<{ key: string; commandId: string } | null>(null);

  useEffect(() => {
    api.locations().then((r) => setLocations(r.items.filter((l) => l.active)), () => {});
  }, []);

  const load = async () => {
    if (!itemId) return;
    try {
      const [detail, moves] = await Promise.all([api.item(itemId), api.movements({ itemId })]);
      setRecord(detail.item);
      setPositions(detail.positions);
      setHistory(moves.items);
      setForm(fromRecord(detail.item));
      setImageBroken(false);
    } catch (err) {
      setError(describeFailure(err));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const errors = useMemo(() => (touched ? checkFields(itemFields, toPayload(form), fieldMessage) : {}), [form, touched]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(checkFields(itemFields, toPayload(form), fieldMessage)).length) {
      setError({ message: "err.validation" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (record) {
        const res = await send<ItemRecord>("PUT", `/api/items/${record.id}`, toPayload(form), record.version);
        setRecord(res.result);
        setForm(fromRecord(res.result));
        setEditing(false);
      } else {
        const res = await send<ItemRecord>("POST", "/api/items", {
          item: toPayload(form),
          initialQuantity: initial.quantity.trim() || null,
          initialLocationId: initial.quantity.trim() ? initial.locationId || null : null,
        });
        go(`/inventory/${res.result.id}`);
      }
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file || !record) return;
    const target = record; // bound to this product's ID (UC-12)
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setPhoto({ kind: "failed", message: "item.photoWrongType" });
      return;
    }
    const key = `${target.id}|${target.version}|${file.name}|${file.size}|${file.lastModified}`;
    if (pendingPhoto.current?.key !== key) pendingPhoto.current = { key, commandId: uuidv7() };
    setPhoto({ kind: "saving" });
    try {
      const res = await uploadPhoto(target.id, file, file.name, target.version, pendingPhoto.current.commandId);
      pendingPhoto.current = null;
      setRecord(res.result);
      setImageBroken(false);
      setPhoto({ kind: "saved" });
    } catch (err) {
      if (!(err instanceof ApiError && err.kind === "unreachable")) pendingPhoto.current = null;
      const f = describeFailure(err);
      setPhoto({
        kind: "failed",
        message: err instanceof ApiError && err.kind === "validation" ? "item.photoWrongType" : f.message === "err.provider_failure" ? "item.photoFailed" : f.message,
      });
    }
  }

  async function removePhoto() {
    if (!record) return;
    setPhoto({ kind: "saving" });
    try {
      const res = await send<ItemRecord>("POST", `/api/items/${record.id}/photo/remove`, {}, record.version);
      setRecord(res.result);
      setPhoto({ kind: "idle" });
    } catch (err) {
      setPhoto({ kind: "failed", message: describeFailure(err).message });
    }
  }

  if (itemId && !record && !error) return <p>{t("common.loading")}</p>;

  const ro = !editing;
  const field = (name: keyof FormState, label: TextKey, input: JSX.Element, hint?: TextKey) => (
    <label className={errors[name] || error?.field === name ? "invalid" : ""}>
      <span>{t(label)}</span>
      {input}
      {hint && editing && <small className="muted">{t(hint)}</small>}
      {errors[name] && <small className="bad">{t(errors[name]!)}</small>}
    </label>
  );

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>{record ? record.name : t("inv.newTitle")}</h2>
          <div className="row">
            <a className="button" href="#/inventory">
              {t("common.back")}
            </a>
            {record && canMove && (
              <a className="button" href={`#/movements/new?item=${record.id}`}>
                {t("inv.move")}
              </a>
            )}
            {record && !editing && canManage && (
              <button type="button" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </button>
            )}
          </div>
        </div>

        {record && (
          <div className="item-head">
            <div className="photo-box">
              {record.photo && !imageBroken ? (
                <img
                  key={record.photo.attachmentId}
                  src={photoUrl(record.photo.attachmentId)}
                  alt={record.name}
                  onError={() => setImageBroken(true)}
                />
              ) : (
                <div className="photo-empty">{record.photo && imageBroken ? t("item.photoMissing") : t("item.noPhoto")}</div>
              )}
              {canPhoto && (
                <div className="row">
                  <label className="button file">
                    {t("item.choosePhoto")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        void choosePhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {record.photo && (
                    <button type="button" onClick={() => void removePhoto()}>
                      {t("item.removePhoto")}
                    </button>
                  )}
                </div>
              )}
              {photo.kind === "saving" && <small className="muted">{t("item.photoSaving")}</small>}
              {photo.kind === "saved" && <small className="good">{t("item.photoSaved")}</small>}
              {photo.kind === "failed" && (
                <small className="bad" role="alert">
                  {t(photo.message)}
                </small>
              )}
            </div>
            <dl className="stock">
              <dt>{t("stock.total")}</dt>
              <dd>
                {record.stock.total} {record.unit}
              </dd>
              <dt>{t("stock.inWarehouse")}</dt>
              <dd>{record.stock.inWarehouse}</dd>
              <dt>{t("stock.atEvents")}</dt>
              <dd>{record.stock.atEvents}</dd>
              <dt>{t("stock.inRepair")}</dt>
              <dd>{record.stock.inRepair}</dd>
            </dl>
          </div>
        )}
        {!record && <p className="muted small">{t("item.saveFirst")}</p>}

        <form className="form grid" onSubmit={submit}>
          {field("name", "item.name", <input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={ro} />)}
          {field("internalReference", "item.internalReference", <input value={form.internalReference} onChange={(e) => set("internalReference", e.target.value)} disabled={ro} />)}
          {field("barcode", "item.barcode", <input className="mono" inputMode="text" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} disabled={ro} />, "item.barcodeHint")}
          {field("categoryPath", "item.categoryPath", <input value={form.categoryPath} onChange={(e) => set("categoryPath", e.target.value)} disabled={ro} placeholder="All / Produccion / Audio / Microfonos" />)}
          {field(
            "productType",
            "item.productType",
            <select value={form.productType} onChange={(e) => set("productType", e.target.value as FormState["productType"])} disabled={ro}>
              {PRODUCT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`type.${p}` as TextKey)}
                </option>
              ))}
            </select>
          )}
          {field(
            "unit",
            "item.unit",
            <>
              <input
                list="unit-list"
                value={form.unit}
                disabled={ro}
                onChange={(e) => {
                  const unit = e.target.value;
                  const known = UNIT_SUGGESTIONS.find((u) => u.unit.toLowerCase() === unit.trim().toLowerCase());
                  setForm((f) => ({ ...f, unit, quantityDecimals: known ? known.decimals : f.quantityDecimals }));
                }}
              />
              <datalist id="unit-list">
                {UNIT_SUGGESTIONS.map((u) => (
                  <option key={u.unit} value={u.unit} />
                ))}
              </datalist>
            </>
          )}
          {field(
            "quantityDecimals",
            "item.quantityDecimals",
            <select value={form.quantityDecimals} onChange={(e) => set("quantityDecimals", Number(e.target.value))} disabled={ro}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          {field("salesPrice", "item.salesPrice", <input inputMode="decimal" value={form.salesPrice} onChange={(e) => set("salesPrice", e.target.value)} disabled={ro} />)}
          {field("priceCurrency", "item.priceCurrency", <input maxLength={3} value={form.priceCurrency} onChange={(e) => set("priceCurrency", e.target.value.toUpperCase())} disabled={ro} placeholder="USD" />)}
          {field("responsible", "item.responsible", <input value={form.responsible} onChange={(e) => set("responsible", e.target.value)} disabled={ro} />)}
          {field("brand", "item.brand", <input value={form.brand} onChange={(e) => set("brand", e.target.value)} disabled={ro} />)}
          {field("model", "item.model", <input value={form.model} onChange={(e) => set("model", e.target.value)} disabled={ro} />)}
          {field(
            "baseLocationId",
            "item.baseLocation",
            <select value={form.baseLocationId} onChange={(e) => set("baseLocationId", e.target.value)} disabled={ro}>
              <option value="">{t("common.none")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.designation}
                </option>
              ))}
            </select>
          )}
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} disabled={ro} />
            <span>{t("item.active")}</span>
          </label>
          <label className="wide">
            <span>{t("item.notes")}</span>
            <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={ro} />
          </label>

          {!record && (
            <>
              <label className={error?.field === "lines" || error?.field === "quantity" ? "invalid" : ""}>
                <span>{t("item.initialQuantity")}</span>
                <input inputMode="decimal" value={initial.quantity} onChange={(e) => setInitial({ ...initial, quantity: e.target.value })} />
                <small className="muted">{t("item.initialHint")}</small>
              </label>
              <label className={error?.field === "initialLocationId" ? "invalid" : ""}>
                <span>{t("item.initialLocation")}</span>
                <select value={initial.locationId} onChange={(e) => setInitial({ ...initial, locationId: e.target.value })}>
                  <option value="">{t("common.none")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.designation}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {error && (
            <p className="bad wide" role="alert">
              {t(error.message)}
            </p>
          )}
          {editing && canManage && (
            <div className="row wide">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
              {record && (
                <button type="button" onClick={() => (setForm(fromRecord(record)), setEditing(false), setError(null), setTouched(false))}>
                  {t("common.cancel")}
                </button>
              )}
            </div>
          )}
        </form>
      </section>

      {record && (
        <section className="card">
          <h3>{t("item.positions")}</h3>
          {positions.length === 0 ? (
            <p className="muted">{t("common.none")}</p>
          ) : (
            <table>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.locationId}>
                    <td>{p.designation}</td>
                    <td className="small muted">{t(`kind.${p.kind}` as TextKey)}</td>
                    <td className="num">
                      {p.quantity} {record.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>{t("item.history")}</h3>
          <MovementTable movements={history} canCorrect={canCorrect} onChanged={() => void load()} />
        </section>
      )}
      {record && canAudit && <AuditPanel recordType="inventory_item" recordId={record.id} version={record.version} />}
    </>
  );
}
