-- 011_route_location.sql
--
-- General location of a repository route, to group the library (Walter,
-- 2026-10-01): country (e.g. USA), area (state or region, e.g. New Jersey)
-- and place (park or venue, e.g. Liberty State Park). Descriptive only: a
-- change here is recorded in the history but is not a new GPX version.
ALTER TABLE route_repository ADD COLUMN country TEXT;
ALTER TABLE route_repository ADD COLUMN area TEXT;
ALTER TABLE route_repository ADD COLUMN place TEXT;
CREATE INDEX route_repository_location ON route_repository (tenant_id, country, area, place) WHERE removed_at IS NULL;
