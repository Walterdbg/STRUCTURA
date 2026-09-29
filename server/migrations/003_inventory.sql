-- 003_inventory.sql - locations, catalog, photos (attachments), movement
-- ledger and stock positions (spec 6.2, 6.4, 6.5, 13; UC-03, UC-08, UC-12).
-- Field set follows the 27TS workbook (tblProducts, Listas) where it fits.

-- ---------------------------------------------------------------- locations
-- Flat list, no mandatory hierarchy (spec 2.2). The kind drives the stock
-- views of the workbook: warehouse (Almacén), event (Evento), repair
-- (Reparación). Written-off stock (Baja) leaves inventory: it has no location.
CREATE TABLE locations (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants (id),
  designation TEXT NOT NULL CHECK (length(btrim(designation)) > 0),
  kind        TEXT NOT NULL CHECK (kind IN ('warehouse', 'event', 'repair', 'other')),
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX locations_designation_unique ON locations (tenant_id, lower(designation));

-- ---------------------------------------------------------------- attachments
-- A file belongs to one parent record; the parent's access rules govern it.
-- The row is only 'available' after the bytes are safely stored (AT-05).
CREATE TABLE attachments (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  parent_type   TEXT NOT NULL,
  parent_id     UUID NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  byte_size     BIGINT NOT NULL CHECK (byte_size >= 0),
  sha256        TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('pending', 'available', 'failed', 'removed')),
  uploaded_by   UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX attachments_parent ON attachments (tenant_id, parent_type, parent_id);

-- ---------------------------------------------------------------- catalog
CREATE TABLE inventory_items (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants (id),
  name                  TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  internal_reference    TEXT,
  -- Text, never a number: leading zeros are part of the code (AT-36).
  barcode               TEXT,
  responsible_text      TEXT,
  category_path         TEXT,
  product_type          TEXT NOT NULL CHECK (product_type IN ('rentable', 'consumable', 'spare_part')),
  -- Individual (serial) tracking arrives with assets; 0.1.0 is quantity only.
  tracking_mode         TEXT NOT NULL DEFAULT 'quantity' CHECK (tracking_mode IN ('quantity')),
  unit                  TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
  -- How many decimals a quantity of this item may have (Unidad 0, Galón 3...).
  quantity_decimals     SMALLINT NOT NULL DEFAULT 0 CHECK (quantity_decimals BETWEEN 0 AND 6),
  sales_price           NUMERIC(19, 4) CHECK (sales_price IS NULL OR sales_price >= 0),
  price_currency        CHAR(3),
  brand                 TEXT,
  model                 TEXT,
  base_location_id      UUID,
  photo_attachment_id   UUID,
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT true,
  -- Migration provenance (spec 16.1); unused for items created on screen.
  legacy_source_id      TEXT,
  legacy_exception_data TEXT,
  version               INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users (id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK ((sales_price IS NULL) = (price_currency IS NULL)),
  FOREIGN KEY (tenant_id, base_location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, photo_attachment_id) REFERENCES attachments (tenant_id, id)
);
CREATE INDEX inventory_items_name ON inventory_items (tenant_id, lower(name));
CREATE INDEX inventory_items_barcode ON inventory_items (tenant_id, barcode) WHERE barcode IS NOT NULL;

-- ---------------------------------------------------------------- movements
-- The ledger. Posted rows never change; a mistake is fixed by a linked
-- correction movement (spec 6.5, AT-03). Reason decides which endpoints
-- exist: stock entering has no source, stock leaving has no destination.
CREATE TABLE movements (
  id                      UUID PRIMARY KEY,
  tenant_id               UUID NOT NULL REFERENCES tenants (id),
  reason                  TEXT NOT NULL CHECK (reason IN (
                            'opening_balance', 'receipt', 'adjustment_in',
                            'transfer', 'to_repair', 'repair_return',
                            'consumption', 'write_off', 'adjustment_out',
                            'correction')),
  source_location_id      UUID,
  destination_location_id UUID,
  occurred_at             TIMESTAMPTZ NOT NULL,
  recorded_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id                UUID REFERENCES users (id),
  command_id              UUID NOT NULL,
  -- Optional links (spec 6.2). Trip grouping arrives with Trips (Phase 3).
  event_id                UUID,
  corrects_movement_id    UUID,
  note                    TEXT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, source_location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, destination_location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, event_id) REFERENCES events (tenant_id, id),
  FOREIGN KEY (tenant_id, corrects_movement_id) REFERENCES movements (tenant_id, id),
  FOREIGN KEY (tenant_id, command_id) REFERENCES command_log (tenant_id, command_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL),
  CHECK (source_location_id IS DISTINCT FROM destination_location_id),
  CHECK (reason NOT IN ('opening_balance', 'receipt', 'adjustment_in')
         OR (source_location_id IS NULL AND destination_location_id IS NOT NULL)),
  CHECK (reason NOT IN ('consumption', 'write_off', 'adjustment_out')
         OR (source_location_id IS NOT NULL AND destination_location_id IS NULL)),
  CHECK (reason NOT IN ('transfer', 'to_repair', 'repair_return')
         OR (source_location_id IS NOT NULL AND destination_location_id IS NOT NULL)),
  CHECK ((reason = 'correction') = (corrects_movement_id IS NOT NULL))
);
-- A movement can be corrected once.
CREATE UNIQUE INDEX movements_one_correction ON movements (corrects_movement_id) WHERE corrects_movement_id IS NOT NULL;
CREATE INDEX movements_tenant_time ON movements (tenant_id, occurred_at DESC);

CREATE TABLE movement_lines (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  movement_id UUID NOT NULL,
  item_id     UUID NOT NULL,
  quantity    NUMERIC(19, 6) NOT NULL CHECK (quantity > 0),
  unit        TEXT NOT NULL,
  FOREIGN KEY (tenant_id, movement_id) REFERENCES movements (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);
CREATE INDEX movement_lines_item ON movement_lines (tenant_id, item_id);

CREATE TRIGGER movements_append_only
  BEFORE UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER movements_no_truncate
  BEFORE TRUNCATE ON movements
  FOR EACH STATEMENT EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER movement_lines_append_only
  BEFORE UPDATE OR DELETE ON movement_lines
  FOR EACH ROW EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER movement_lines_no_truncate
  BEFORE TRUNCATE ON movement_lines
  FOR EACH STATEMENT EXECUTE FUNCTION structura_append_only();

-- ---------------------------------------------------------------- stock
-- Projection of the ledger: changed only by the movement service, in the
-- same transaction as the movement. Never negative (spec 6.5).
CREATE TABLE stock_positions (
  tenant_id   UUID NOT NULL,
  item_id     UUID NOT NULL,
  location_id UUID NOT NULL,
  quantity    NUMERIC(19, 6) NOT NULL CHECK (quantity >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, item_id, location_id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);
