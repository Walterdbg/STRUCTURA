-- 002_identity_events.sql - own staff accounts (DEC-013), capabilities
-- (spec 7) and Events (spec 6.2/6.4, UC-13).

ALTER TABLE tenants ADD COLUMN default_timezone TEXT NOT NULL DEFAULT 'UTC';

-- scrypt hash; NULL means the account cannot sign in with a password.
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Capabilities granted in this tenant. Checked by the app on every request.
ALTER TABLE memberships ADD COLUMN capabilities TEXT[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------- sessions
-- Only a SHA-256 of the session token is stored, so a database copy can't
-- be used to sign in. A session is bound to one tenant membership.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users (id),
  tenant_id  UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id)
);
CREATE INDEX sessions_user ON sessions (user_id);

-- ---------------------------------------------------------------- events
CREATE TABLE events (
  id                   UUID PRIMARY KEY,
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  -- Can be provisional ("Internal event - October"); no customer required.
  designation          TEXT NOT NULL CHECK (length(btrim(designation)) > 0),
  designation_status   TEXT NOT NULL DEFAULT 'provisional'
                       CHECK (designation_status IN ('provisional', 'final')),
  responsible_user_id  UUID NOT NULL,
  location_text        TEXT,
  timezone             TEXT NOT NULL,
  -- Separate dates, never collapsed into one (UC-13, spec 6.4).
  event_date           DATE,
  departure_date       DATE,
  expected_return_date DATE,
  closure_date         DATE,
  notes                TEXT,
  fulfillment_state    TEXT NOT NULL DEFAULT 'draft'
                       CHECK (fulfillment_state IN ('draft', 'confirmed', 'delivered', 'partial_return', 'closed', 'cancelled')),
  version              INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES users (id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  -- The responsible person must be a member of the same tenant.
  FOREIGN KEY (tenant_id, responsible_user_id) REFERENCES memberships (tenant_id, user_id),
  CHECK (departure_date IS NULL OR expected_return_date IS NULL OR departure_date <= expected_return_date)
);
CREATE INDEX events_tenant_dates ON events (tenant_id, departure_date, expected_return_date);
