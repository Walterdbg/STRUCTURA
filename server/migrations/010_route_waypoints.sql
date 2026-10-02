-- 010_route_waypoints.sql
--
-- Waypoints of a repository route (Walter's course files, 2026-10-01):
-- start, finish, mile markers, water stations, staff positions, turns. Kept
-- with each GPX version (and written into its GPX), so they can become Event
-- points when the route is used in an Event. Earlier versions have none.
ALTER TABLE route_repository_versions ADD COLUMN waypoints JSONB NOT NULL DEFAULT '[]';
