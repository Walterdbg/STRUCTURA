-- 006_event_maps.sql - Event maps (UC-05, AT-07; DEC-022) and paid add-ons
-- per organization (DEC-023: "Running courses").

-- Plans (tiers) and add-ons, controlled by the platform operator (Walter:
-- "be sure that we can control what is part of what tier"). A plan lists
-- the features it includes; nothing about plan contents is hard-coded.
-- Names and prices are business decisions (spec gap G-07), so no plans
-- are created here.
CREATE TABLE plans (
  id         UUID PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]+$'),
  name       TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  features   TEXT[] NOT NULL DEFAULT '{}',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each organization has at most one plan, plus individual add-ons on top
-- (e.g. {courses}). What it can use = plan features + add-ons. Checked by
-- the server; the Phase 4 license system will sign these entitlements.
ALTER TABLE tenants ADD COLUMN plan_id UUID REFERENCES plans (id);
ALTER TABLE tenants ADD COLUMN features TEXT[] NOT NULL DEFAULT '{}';

-- Points, small areas and routes on an Event's map. Geometry is GeoJSON
-- (WGS84): Point, Polygon or LineString; validated by the app. Never a
-- location hierarchy and never a stock change (spec 2.2, 12).
CREATE TABLE map_features (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  event_id   UUID NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('point', 'area', 'route')),
  category   TEXT NOT NULL,
  label      TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  notes      TEXT,
  geometry   JSONB NOT NULL,
  preferred  BOOLEAN NOT NULL DEFAULT false,
  -- Imported file name, for provenance (spec 12: retain source file).
  source     TEXT,
  version    INTEGER NOT NULL DEFAULT 1,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users (id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, event_id) REFERENCES events (tenant_id, id),
  CHECK (kind = 'route' OR NOT preferred)
);
CREATE INDEX map_features_event ON map_features (tenant_id, event_id) WHERE removed_at IS NULL;

-- New capability map.edit (spec 7): existing administrators and operations
-- managers (those who can manage Events) receive it, matching the presets.
UPDATE memberships
   SET capabilities = capabilities || 'map.edit'::text
 WHERE ('tenant.admin' = ANY (capabilities) OR 'event.manage' = ANY (capabilities))
   AND NOT ('map.edit' = ANY (capabilities));