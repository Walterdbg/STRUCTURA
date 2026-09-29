-- 001_foundation.sql - STRUCTURA 0.1.0 foundation (ARCHITECTURE.md section 4)
--
-- Rules built in from day one:
--   * Every business table carries tenant_id; composite foreign keys
--     (tenant_id, x_id) make a cross-tenant reference impossible (AT-28).
--   * Command log and audit are append-only, enforced by the database
--     itself, not only by the app (spec 18.2, AT-18).
--   * Every change command is recorded once by its command ID; a retry
--     returns the stored result (spec 11.2, AT-15/AT-20).
--   * Record IDs are UUID v7, created by the app (offline-safe).

-- Shared guard: raises on any UPDATE, DELETE or TRUNCATE of an append-only table.
CREATE FUNCTION structura_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append_only: rows in % cannot be changed (%)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END
$$;

-- ---------------------------------------------------------------- tenants
CREATE TABLE tenants (
  id             UUID PRIMARY KEY,
  display_name   TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  default_locale TEXT NOT NULL DEFAULT 'es' CHECK (default_locale IN ('es', 'en')),
  config_version INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- users
-- A person's identity. Access to a tenant comes only from a membership.
-- Sign-in credentials arrive with the identity work in 0.1.0 step 2 (DEC-013).
CREATE TABLE users (
  id           UUID PRIMARY KEY,
  email        TEXT NOT NULL CHECK (position('@' IN email) > 1),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  locale       TEXT NOT NULL DEFAULT 'es' CHECK (locale IN ('es', 'en')),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE memberships (
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  user_id    UUID NOT NULL REFERENCES users (id),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- ---------------------------------------------------------------- command log
-- One row per accepted change command. Same ID + same payload returns
-- `result`; same ID + different payload is refused (idempotency_conflict).
CREATE TABLE command_log (
  command_id    UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  actor_id      UUID REFERENCES users (id),
  deployment_id TEXT NOT NULL,
  command_type  TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  result        JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, command_id)
);
CREATE TRIGGER command_log_append_only
  BEFORE UPDATE OR DELETE ON command_log
  FOR EACH ROW EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER command_log_no_truncate
  BEFORE TRUNCATE ON command_log
  FOR EACH STATEMENT EXECUTE FUNCTION structura_append_only();

-- ---------------------------------------------------------------- audit
CREATE TABLE audit_entries (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  command_id    UUID,
  actor_id      UUID REFERENCES users (id),
  deployment_id TEXT NOT NULL,
  action        TEXT NOT NULL,
  record_type   TEXT NOT NULL,
  record_id     UUID,
  change        JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An audit entry can only point at a command of its own tenant.
  FOREIGN KEY (tenant_id, command_id) REFERENCES command_log (tenant_id, command_id)
);
CREATE INDEX audit_entries_record ON audit_entries (tenant_id, record_type, record_id);
CREATE TRIGGER audit_entries_append_only
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER audit_entries_no_truncate
  BEFORE TRUNCATE ON audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION structura_append_only();

-- ---------------------------------------------------------------- outbox
-- Written in the same transaction as the change it reports. The worker
-- sends pending rows on (local -> cloud sync, integrations) and moves them
-- through the sync states of spec 11.2. The row itself is operational
-- state, so it may be updated; the command it points to may not.
CREATE TABLE outbox (
  id             UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  command_id     UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  payload        JSONB NOT NULL,
  state          TEXT NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending', 'sending', 'acknowledged', 'conflict', 'rejected')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, command_id) REFERENCES command_log (tenant_id, command_id)
);
CREATE INDEX outbox_pending ON outbox (created_at) WHERE state IN ('pending', 'sending');
