-- 013_poi_photos.sql - pictures on an Event's points of interest (DEC-044).
-- They are ordinary attachments (parent_type 'map_feature'); the role tells
-- a photo taken there from a capture of the map zoomed in on the point.
ALTER TABLE attachments ADD COLUMN role TEXT CHECK (role IS NULL OR role IN ('photo', 'capture'));
