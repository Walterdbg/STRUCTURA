-- 009_route_repository.sql
--
-- DEC-033: the Maps section keeps a repository of routes (race courses,
-- delivery and pickup routes) made ahead of time, outside any Event. Every
-- route is always saved as a GPX file: each save adds a new version with its
-- GPX, and no version is ever changed or deleted. An Event takes a route as
-- its own copy (map_features.source names the route and version).

CREATE TABLE route_repository (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants (id),
  name            TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  category        TEXT NOT NULL CHECK (category IN ('course', 'delivery', 'pickup', 'other')),
  notes           TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  version         INTEGER NOT NULL DEFAULT 1, -- record version (optimistic concurrency)
  removed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users (id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX route_repository_tenant ON route_repository (tenant_id) WHERE removed_at IS NULL;

CREATE TABLE route_repository_versions (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  route_id    UUID NOT NULL,
  version     INTEGER NOT NULL CHECK (version >= 1),
  gpx         TEXT NOT NULL,          -- the route as a GPX file, exactly as saved
  geometry    JSONB NOT NULL,         -- the same line as GeoJSON, for the map
  props       JSONB NOT NULL DEFAULT '{}',
  length_m    NUMERIC NOT NULL,
  source      TEXT,                   -- imported file name, or the Event it came from
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users (id),
  UNIQUE (tenant_id, route_id, version),
  FOREIGN KEY (tenant_id, route_id) REFERENCES route_repository (tenant_id, id)
);

CREATE TRIGGER route_repository_versions_append_only
  BEFORE UPDATE OR DELETE ON route_repository_versions
  FOR EACH ROW EXECUTE FUNCTION structura_append_only();
CREATE TRIGGER route_repository_versions_no_truncate
  BEFORE TRUNCATE ON route_repository_versions
  FOR EACH STATEMENT EXECUTE FUNCTION structura_append_only();
