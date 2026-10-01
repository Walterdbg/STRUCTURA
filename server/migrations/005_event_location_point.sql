-- 005_event_location_point.sql - the Event's location as a point on the
-- map, not only text (Walter, 2026-09-30). WGS84 coordinates, as spec 12
-- requires for map points. The text keeps the place name/address shown.

ALTER TABLE events
  ADD COLUMN location_lat NUMERIC(9, 6) CHECK (location_lat BETWEEN -90 AND 90),
  ADD COLUMN location_lng NUMERIC(9, 6) CHECK (location_lng BETWEEN -180 AND 180),
  ADD CONSTRAINT events_location_point_complete CHECK ((location_lat IS NULL) = (location_lng IS NULL));
