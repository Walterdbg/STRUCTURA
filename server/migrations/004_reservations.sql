-- 004_reservations.sql - Event inventory lines and reservations
-- (spec 6.4, 6.5, 8.1; UC-21; AT-04, AT-31). Workbook: tblRentalItems.

-- What an Event asks for (the workbook's "Detalle Alquiler" lines).
-- Editable while the Event is draft or confirmed.
CREATE TABLE event_inventory_lines (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  event_id      UUID NOT NULL,
  item_id       UUID NOT NULL,
  requested_qty NUMERIC(19, 6) NOT NULL CHECK (requested_qty > 0),
  unit          TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, event_id, item_id),
  FOREIGN KEY (tenant_id, event_id) REFERENCES events (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);

-- A time-bound claim on stock. It never moves stock (spec 6.5). The dates
-- are local calendar days in the Event's timezone and BOTH ends are
-- included: returning on day 14 keeps day 14 reserved; day 15 is free.
-- Rows are never deleted; only the state moves on (with who/when).
CREATE TABLE reservations (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  event_id     UUID NOT NULL,
  line_id      UUID,
  item_id      UUID NOT NULL,
  quantity     NUMERIC(19, 6) NOT NULL CHECK (quantity > 0),
  starts_on    DATE NOT NULL,
  ends_on      DATE NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('committed', 'released', 'fulfilled', 'cancelled')),
  command_id   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  closed_by    UUID REFERENCES users (id),
  close_reason TEXT,
  CHECK (starts_on <= ends_on),
  CHECK ((state = 'committed') = (closed_at IS NULL)),
  FOREIGN KEY (tenant_id, event_id) REFERENCES events (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items (tenant_id, id)
);
CREATE INDEX reservations_item_dates ON reservations (tenant_id, item_id, starts_on, ends_on) WHERE state = 'committed';
CREATE INDEX reservations_event ON reservations (tenant_id, event_id);

-- Reservations: only the closing of a committed row is allowed; quantity,
-- dates, item and Event never change, and rows are never deleted.
CREATE FUNCTION structura_reservation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append_only: reservations cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.state <> 'committed'
     OR NEW.quantity <> OLD.quantity OR NEW.starts_on <> OLD.starts_on OR NEW.ends_on <> OLD.ends_on
     OR NEW.item_id <> OLD.item_id OR NEW.event_id <> OLD.event_id OR NEW.command_id <> OLD.command_id THEN
    RAISE EXCEPTION 'append_only: a reservation can only be closed, not edited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER reservations_guard
  BEFORE UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION structura_reservation_guard();
