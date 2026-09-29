import crypto from "node:crypto";
import {
  DomainError,
  uuidv7,
  type CorrectionFields,
  type ItemFields,
  type LocationFields,
  type LocationKind,
  type MovementFields,
  type NewItemFields,
  type ProductType,
} from "@structura/domain";
import { executeCommand, type CommandContext, type CommandResult } from "../commands.js";
import { isUniqueViolation, type Db } from "../db.js";
import type { ParsedCommand } from "../http.js";
import type { FileStore } from "../storage.js";
import { getMovement, postMovement, trimQuantity, type MovementRecord } from "./ledger.js";

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

// ================================================================ locations
export interface LocationRecord {
  id: string;
  designation: string;
  kind: LocationKind;
  notes: string | null;
  active: boolean;
  version: number;
}

type LocationRow = { id: string; designation: string; kind: LocationKind; notes: string | null; active: boolean; version: number };
const toLocation = (r: LocationRow): LocationRecord => ({
  id: r.id,
  designation: r.designation,
  kind: r.kind,
  notes: r.notes,
  active: r.active,
  version: r.version,
});

export async function listLocations(db: Db, tenantId: string): Promise<LocationRecord[]> {
  const { rows } = await db.query<LocationRow>(
    "SELECT id, designation, kind, notes, active, version FROM locations WHERE tenant_id = $1 ORDER BY active DESC, kind, designation",
    [tenantId]
  );
  return rows.map(toLocation);
}

async function getLocation(db: Db, tenantId: string, id: string): Promise<LocationRecord> {
  const { rows } = await db.query<LocationRow>(
    "SELECT id, designation, kind, notes, active, version FROM locations WHERE tenant_id = $1 AND id = $2",
    [tenantId, id]
  );
  if (!rows[0]) throw new DomainError("not_found", "Location not found");
  return toLocation(rows[0]);
}

function duplicateName(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new DomainError("validation", "A location with this name already exists", { field: "designation" });
  }
  throw err;
}

export async function createLocation(db: Db, ctx: CommandContext, cmd: ParsedCommand<LocationFields>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "location.create", occurredAt: cmd.occurredAt, payload: f },
    async (t) => {
      const id = uuidv7();
      await t
        .query("INSERT INTO locations (id, tenant_id, designation, kind, notes, active) VALUES ($1, $2, $3, $4, $5, $6)", [
          id,
          ctx.tenantId,
          f.designation,
          f.kind,
          f.notes,
          f.active,
        ])
        .catch(duplicateName);
      const record = await getLocation(t, ctx.tenantId, id);
      return {
        result: record,
        audit: [{ action: "location.created", recordType: "location", recordId: id, change: { after: f } }],
        outbox: [{ aggregateType: "location", aggregateId: id, payload: { type: "location.created", location: record } }],
      };
    }
  );
}

export async function updateLocation(db: Db, ctx: CommandContext, id: string, cmd: ParsedCommand<LocationFields>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "location.update", occurredAt: cmd.occurredAt, payload: { id, ...f } },
    async (t) => {
      const before = await getLocation(t, ctx.tenantId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this location. Reload it and try again.");
      }
      // A location's kind decides which stock views its contents count in;
      // it can only change while it holds no stock.
      if (before.kind !== f.kind) {
        const held = await t.query("SELECT 1 FROM stock_positions WHERE tenant_id = $1 AND location_id = $2 AND quantity > 0 LIMIT 1", [
          ctx.tenantId,
          id,
        ]);
        if (held.rows[0]) {
          throw new DomainError("invalid_state", "Move the stock out before changing this location's type", { field: "kind" });
        }
      }
      await t
        .query(
          `UPDATE locations SET designation = $3, kind = $4, notes = $5, active = $6, version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, id, f.designation, f.kind, f.notes, f.active]
        )
        .catch(duplicateName);
      const after = await getLocation(t, ctx.tenantId, id);
      return {
        result: after,
        audit: [{ action: "location.updated", recordType: "location", recordId: id, change: { before, after: f } }],
        outbox: [{ aggregateType: "location", aggregateId: id, payload: { type: "location.updated", location: after } }],
      };
    }
  );
}

// ================================================================ catalog
export interface StockSummary {
  total: string; // everything owned (Total actual)
  atEvents: string; // Alquilado actualmente
  inRepair: string; // En reparación
  inWarehouse: string; // Disponible en almacén
  other: string;
}

export interface ItemRecord {
  id: string;
  name: string;
  internalReference: string | null;
  barcode: string | null;
  responsible: string | null;
  categoryPath: string | null;
  productType: ProductType;
  unit: string;
  quantityDecimals: number;
  salesPrice: string | null;
  priceCurrency: string | null;
  brand: string | null;
  model: string | null;
  baseLocationId: string | null;
  notes: string | null;
  active: boolean;
  photo: { attachmentId: string; state: string } | null;
  stock: StockSummary;
  version: number;
  updatedAt: string;
}

interface ItemRow {
  id: string;
  name: string;
  internal_reference: string | null;
  barcode: string | null;
  responsible_text: string | null;
  category_path: string | null;
  product_type: ProductType;
  unit: string;
  quantity_decimals: number;
  sales_price: string | null;
  price_currency: string | null;
  brand: string | null;
  model: string | null;
  base_location_id: string | null;
  notes: string | null;
  active: boolean;
  photo_attachment_id: string | null;
  photo_state: string | null;
  version: number;
  updated_at: Date | string;
  total: string;
  at_events: string;
  in_repair: string;
  in_warehouse: string;
  other: string;
}

const toItem = (r: ItemRow): ItemRecord => ({
  id: r.id,
  name: r.name,
  internalReference: r.internal_reference,
  barcode: r.barcode,
  responsible: r.responsible_text,
  categoryPath: r.category_path,
  productType: r.product_type,
  unit: r.unit,
  quantityDecimals: r.quantity_decimals,
  salesPrice: r.sales_price === null ? null : trimQuantity(r.sales_price),
  priceCurrency: r.price_currency,
  brand: r.brand,
  model: r.model,
  baseLocationId: r.base_location_id,
  notes: r.notes,
  active: r.active,
  photo: r.photo_attachment_id ? { attachmentId: r.photo_attachment_id, state: r.photo_state ?? "available" } : null,
  stock: {
    total: trimQuantity(r.total),
    atEvents: trimQuantity(r.at_events),
    inRepair: trimQuantity(r.in_repair),
    inWarehouse: trimQuantity(r.in_warehouse),
    other: trimQuantity(r.other),
  },
  version: r.version,
  updatedAt: iso(r.updated_at),
});

// The four stock figures of the workbook, derived from positions - never
// stored as separately editable totals (spec 6.4).
const ITEM_SELECT = `
  SELECT i.*, a.state AS photo_state,
         coalesce(sum(sp.quantity), 0)::text AS total,
         coalesce(sum(sp.quantity) FILTER (WHERE l.kind = 'event'), 0)::text AS at_events,
         coalesce(sum(sp.quantity) FILTER (WHERE l.kind = 'repair'), 0)::text AS in_repair,
         coalesce(sum(sp.quantity) FILTER (WHERE l.kind = 'warehouse'), 0)::text AS in_warehouse,
         coalesce(sum(sp.quantity) FILTER (WHERE l.kind = 'other'), 0)::text AS other
    FROM inventory_items i
    LEFT JOIN attachments a ON a.id = i.photo_attachment_id
    LEFT JOIN stock_positions sp ON sp.tenant_id = i.tenant_id AND sp.item_id = i.id
    LEFT JOIN locations l ON l.id = sp.location_id`;

export async function getItem(db: Db, tenantId: string, id: string): Promise<ItemRecord> {
  const { rows } = await db.query<ItemRow>(`${ITEM_SELECT} WHERE i.tenant_id = $1 AND i.id = $2 GROUP BY i.id, a.state`, [
    tenantId,
    id,
  ]);
  if (!rows[0]) throw new DomainError("not_found", "Item not found");
  return toItem(rows[0]);
}

export async function listItems(
  db: Db,
  tenantId: string,
  opts: { search?: string; includeInactive?: boolean; limit: number; offset: number }
): Promise<{ items: ItemRecord[]; total: number }> {
  const where = ["i.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (!opts.includeInactive) where.push("i.active");
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(i.name ILIKE ${p} OR i.internal_reference ILIKE ${p} OR i.barcode ILIKE ${p} OR i.category_path ILIKE ${p})`);
  }
  const cond = where.join(" AND ");
  const total = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM inventory_items i WHERE ${cond}`, params);
  params.push(opts.limit, opts.offset);
  const { rows } = await db.query<ItemRow>(
    `${ITEM_SELECT} WHERE ${cond} GROUP BY i.id, a.state ORDER BY lower(i.name), i.internal_reference NULLS LAST, i.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: rows.map(toItem), total: Number(total.rows[0]?.n ?? 0) };
}

export interface StockPositionRecord {
  locationId: string;
  designation: string;
  kind: LocationKind;
  quantity: string;
}

export async function itemPositions(db: Db, tenantId: string, itemId: string): Promise<StockPositionRecord[]> {
  await getItem(db, tenantId, itemId);
  const { rows } = await db.query<{ location_id: string; designation: string; kind: LocationKind; quantity: string }>(
    `SELECT sp.location_id, l.designation, l.kind, sp.quantity
       FROM stock_positions sp JOIN locations l ON l.id = sp.location_id
      WHERE sp.tenant_id = $1 AND sp.item_id = $2 AND sp.quantity > 0
      ORDER BY l.kind, l.designation`,
    [tenantId, itemId]
  );
  return rows.map((r) => ({ locationId: r.location_id, designation: r.designation, kind: r.kind, quantity: trimQuantity(r.quantity) }));
}

// Two items with the same barcode would make scanning ambiguous, so the
// screen path refuses it. Imports will flag duplicates for review instead
// of refusing (spec 16.3).
async function assertBarcodeFree(t: Db, tenantId: string, barcode: string | null, exceptId: string | null) {
  if (!barcode) return;
  const { rows } = await t.query<{ name: string }>(
    "SELECT name FROM inventory_items WHERE tenant_id = $1 AND barcode = $2 AND ($3::uuid IS NULL OR id <> $3::uuid) LIMIT 1",
    [tenantId, barcode, exceptId]
  );
  if (rows[0]) {
    throw new DomainError("validation", `Barcode already used by "${rows[0].name}"`, { field: "barcode", usedBy: rows[0].name });
  }
}

async function assertBaseLocation(t: Db, tenantId: string, id: string | null) {
  if (!id) return;
  const { rows } = await t.query("SELECT 1 FROM locations WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
  if (!rows[0]) throw new DomainError("validation", "Unknown base location", { field: "baseLocationId" });
}

export async function createItem(db: Db, ctx: CommandContext, cmd: ParsedCommand<NewItemFields>): Promise<CommandResult<ItemRecord>> {
  const { item: f, initialQuantity, initialLocationId } = cmd.payload;
  if (initialQuantity && !initialLocationId) {
    throw new DomainError("validation", "Choose where the initial quantity is", { field: "initialLocationId" });
  }
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "item.create", occurredAt: cmd.occurredAt, payload: cmd.payload },
    async (t) => {
      await assertBarcodeFree(t, ctx.tenantId, f.barcode, null);
      await assertBaseLocation(t, ctx.tenantId, f.baseLocationId);
      const id = uuidv7();
      await t.query(
        `INSERT INTO inventory_items (id, tenant_id, name, internal_reference, barcode, responsible_text, category_path,
                                      product_type, unit, quantity_decimals, sales_price, price_currency, brand, model,
                                      base_location_id, notes, active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          id,
          ctx.tenantId,
          f.name,
          f.internalReference,
          f.barcode,
          f.responsible,
          f.categoryPath,
          f.productType,
          f.unit,
          f.quantityDecimals,
          f.salesPrice,
          f.priceCurrency,
          f.brand,
          f.model,
          f.baseLocationId,
          f.notes,
          f.active,
          ctx.actorId,
        ]
      );
      let movementId: string | null = null;
      if (initialQuantity && initialLocationId) {
        movementId = await postMovement(t, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          commandId: cmd.commandId,
          reason: "opening_balance",
          sourceLocationId: null,
          destinationLocationId: initialLocationId,
          occurredAt: cmd.occurredAt,
          eventId: null,
          note: null,
          lines: [{ itemId: id, quantity: initialQuantity }],
        });
      }
      const record = await getItem(t, ctx.tenantId, id);
      return {
        result: record,
        audit: [
          { action: "item.created", recordType: "inventory_item", recordId: id, change: { after: f } },
          ...(movementId
            ? [{ action: "movement.posted", recordType: "movement", recordId: movementId, change: { reason: "opening_balance", initialQuantity } }]
            : []),
        ],
        outbox: [{ aggregateType: "inventory_item", aggregateId: id, payload: { type: "item.created", item: record, movementId } }],
      };
    }
  );
}

// Metadata only: quantities change through movements, never here (UC-08).
export async function updateItem(db: Db, ctx: CommandContext, id: string, cmd: ParsedCommand<ItemFields>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "item.update", occurredAt: cmd.occurredAt, payload: { id, ...f } },
    async (t) => {
      const before = await getItem(t, ctx.tenantId, id);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this item. Reload it and try again.");
      }
      if (f.unit !== before.unit || f.quantityDecimals < before.quantityDecimals) {
        const moved = await t.query("SELECT 1 FROM movement_lines WHERE tenant_id = $1 AND item_id = $2 LIMIT 1", [ctx.tenantId, id]);
        if (moved.rows[0]) {
          throw new DomainError("invalid_state", "The unit can't change once the item has movements", { field: "unit" });
        }
      }
      await assertBarcodeFree(t, ctx.tenantId, f.barcode, id);
      await assertBaseLocation(t, ctx.tenantId, f.baseLocationId);
      await t.query(
        `UPDATE inventory_items
            SET name = $3, internal_reference = $4, barcode = $5, responsible_text = $6, category_path = $7,
                product_type = $8, unit = $9, quantity_decimals = $10, sales_price = $11, price_currency = $12,
                brand = $13, model = $14, base_location_id = $15, notes = $16, active = $17,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [
          ctx.tenantId,
          id,
          f.name,
          f.internalReference,
          f.barcode,
          f.responsible,
          f.categoryPath,
          f.productType,
          f.unit,
          f.quantityDecimals,
          f.salesPrice,
          f.priceCurrency,
          f.brand,
          f.model,
          f.baseLocationId,
          f.notes,
          f.active,
        ]
      );
      const after = await getItem(t, ctx.tenantId, id);
      return {
        result: after,
        audit: [{ action: "item.updated", recordType: "inventory_item", recordId: id, change: { before, after: f } }],
        outbox: [{ aggregateType: "inventory_item", aggregateId: id, payload: { type: "item.updated", item: after } }],
      };
    }
  );
}

// ================================================================ photos (UC-12, AT-05)
export interface PhotoUpload {
  commandId: string;
  occurredAt: string;
  expectedVersion: number;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export async function setItemPhoto(db: Db, store: FileStore, ctx: CommandContext, itemId: string, up: PhotoUpload) {
  const sha256 = crypto.createHash("sha256").update(up.bytes).digest("hex");
  return executeCommand(
    db,
    ctx,
    {
      commandId: up.commandId,
      commandType: "item.photo.set",
      occurredAt: up.occurredAt,
      payload: { itemId, sha256, byteSize: up.bytes.length, contentType: up.contentType, filename: up.filename },
    },
    async (t) => {
      const before = await getItem(t, ctx.tenantId, itemId);
      if (before.version !== up.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this item. Reload it and try again.");
      }
      const attachmentId = uuidv7();
      const key = `${ctx.tenantId}/${attachmentId}`;
      // Bytes first. If storing fails, nothing is recorded and the error
      // says so; the item keeps its previous photo.
      try {
        await store.put(key, up.bytes);
      } catch {
        throw new DomainError("provider_failure", "The photo could not be stored. Nothing was changed.");
      }
      await t.query(
        `INSERT INTO attachments (id, tenant_id, parent_type, parent_id, filename, content_type, byte_size, sha256,
                                  storage_key, state, uploaded_by)
         VALUES ($1, $2, 'inventory_item', $3, $4, $5, $6, $7, $8, 'available', $9)`,
        [attachmentId, ctx.tenantId, itemId, up.filename, up.contentType, up.bytes.length, sha256, key, ctx.actorId]
      );
      if (before.photo) {
        await t.query("UPDATE attachments SET state = 'removed', updated_at = now() WHERE tenant_id = $1 AND id = $2", [
          ctx.tenantId,
          before.photo.attachmentId,
        ]);
      }
      await t.query(
        "UPDATE inventory_items SET photo_attachment_id = $3, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2",
        [ctx.tenantId, itemId, attachmentId]
      );
      const after = await getItem(t, ctx.tenantId, itemId);
      return {
        result: after,
        audit: [
          {
            action: "item.photo.set",
            recordType: "inventory_item",
            recordId: itemId,
            change: { attachmentId, filename: up.filename, byteSize: up.bytes.length, sha256, replaced: before.photo?.attachmentId ?? null },
          },
        ],
        outbox: [
          { aggregateType: "attachment", aggregateId: attachmentId, payload: { type: "attachment.stored", itemId, sha256, byteSize: up.bytes.length } },
        ],
      };
    }
  );
}

export async function removeItemPhoto(db: Db, ctx: CommandContext, itemId: string, cmd: ParsedCommand<unknown>) {
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "item.photo.remove", occurredAt: cmd.occurredAt, payload: { itemId } },
    async (t) => {
      const before = await getItem(t, ctx.tenantId, itemId);
      if (cmd.expectedVersion === null || before.version !== cmd.expectedVersion) {
        throw new DomainError("stale_version", "Someone else changed this item. Reload it and try again.");
      }
      if (before.photo) {
        await t.query("UPDATE attachments SET state = 'removed', updated_at = now() WHERE tenant_id = $1 AND id = $2", [
          ctx.tenantId,
          before.photo.attachmentId,
        ]);
      }
      await t.query(
        "UPDATE inventory_items SET photo_attachment_id = NULL, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2",
        [ctx.tenantId, itemId]
      );
      const after = await getItem(t, ctx.tenantId, itemId);
      return {
        result: after,
        audit: [{ action: "item.photo.removed", recordType: "inventory_item", recordId: itemId, change: { removed: before.photo?.attachmentId ?? null } }],
      };
    }
  );
}

// Access to a file always goes through its parent's tenant (spec 13).
export async function readAttachment(db: Db, store: FileStore, tenantId: string, attachmentId: string) {
  const { rows } = await db.query<{ storage_key: string; content_type: string; filename: string; state: string; sha256: string }>(
    "SELECT storage_key, content_type, filename, state, sha256 FROM attachments WHERE tenant_id = $1 AND id = $2",
    [tenantId, attachmentId]
  );
  const a = rows[0];
  if (!a || a.state === "pending" || a.state === "failed") throw new DomainError("not_found", "File not found");
  try {
    return { ...a, bytes: await store.get(a.storage_key) };
  } catch {
    throw new DomainError("provider_failure", "The stored file is missing or unreadable");
  }
}

// ================================================================ movements
export async function createMovement(
  db: Db,
  ctx: CommandContext,
  cmd: ParsedCommand<MovementFields>
): Promise<CommandResult<MovementRecord>> {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "movement.post", occurredAt: cmd.occurredAt, payload: f },
    async (t) => {
      const id = await postMovement(t, {
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        commandId: cmd.commandId,
        reason: f.reason,
        sourceLocationId: f.sourceLocationId,
        destinationLocationId: f.destinationLocationId,
        occurredAt: cmd.occurredAt,
        eventId: f.eventId,
        note: f.note,
        lines: f.lines,
      });
      const record = await getMovement(t, ctx.tenantId, id);
      return {
        result: record,
        audit: [{ action: "movement.posted", recordType: "movement", recordId: id, change: f }],
        outbox: [{ aggregateType: "movement", aggregateId: id, payload: { type: "movement.posted", movement: record } }],
      };
    }
  );
}

// AT-03: the original stays; a linked reverse movement undoes its effect once.
export async function correctMovement(db: Db, ctx: CommandContext, cmd: ParsedCommand<CorrectionFields>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "movement.correct", occurredAt: cmd.occurredAt, payload: f },
    async (t) => {
      const original = await getMovement(t, ctx.tenantId, f.movementId);
      if (original.reason === "correction") {
        throw new DomainError("invalid_state", "A correction can't be corrected. Post a new movement instead.");
      }
      if (original.correctedByMovementId) {
        throw new DomainError("invalid_state", "This movement was already corrected", {
          correctedBy: original.correctedByMovementId,
        });
      }
      let id: string;
      try {
        id = await postMovement(t, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          commandId: cmd.commandId,
          reason: "correction",
          sourceLocationId: original.destinationLocationId,
          destinationLocationId: original.sourceLocationId,
          occurredAt: cmd.occurredAt,
          eventId: original.eventId,
          note: f.note,
          correctsMovementId: original.id,
          lines: original.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new DomainError("invalid_state", "This movement was already corrected");
        throw err;
      }
      const record = await getMovement(t, ctx.tenantId, id);
      return {
        result: record,
        audit: [
          { action: "movement.corrected", recordType: "movement", recordId: original.id, change: { correction: id, note: f.note } },
          { action: "movement.posted", recordType: "movement", recordId: id, change: { reason: "correction", corrects: original.id } },
        ],
        outbox: [{ aggregateType: "movement", aggregateId: id, payload: { type: "movement.posted", movement: record } }],
      };
    }
  );
}
