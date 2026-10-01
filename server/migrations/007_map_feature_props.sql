-- 007_map_feature_props.sql - extra settings per map item (DEC-027):
-- routes: laps, out-and-back, follows streets; points: placed at a
-- distance along a course. Validated by the app (domain featurePropsSchema).
ALTER TABLE map_features ADD COLUMN props JSONB NOT NULL DEFAULT '{}'::jsonb;
