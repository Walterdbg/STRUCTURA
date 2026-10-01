-- 008_event_types_date_rules.sql
--
-- DEC-031: two types of Event. A race has running courses; a rental is
-- rented inventory with a location, deliveries and pickups. The type is
-- chosen when the Event is created and never changes afterwards.
ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'rental'
  CHECK (event_type IN ('rental', 'race'));

-- Existing Events that already have a course are races.
UPDATE events e
   SET event_type = 'race'
 WHERE EXISTS (SELECT 1 FROM map_features f
                WHERE f.tenant_id = e.tenant_id AND f.event_id = e.id
                  AND f.kind = 'route' AND f.category = 'course' AND f.removed_at IS NULL);

-- DEC-028: date rules per organization (an administrator can change them).
--   departure at most N days before the event date (default 15)
--   expected return at most N business days after the event date (default 7)
--   warning when equipment is still out N days after the event (default 3)
ALTER TABLE tenants ADD COLUMN departure_max_days INTEGER NOT NULL DEFAULT 15
  CHECK (departure_max_days BETWEEN 0 AND 365);
ALTER TABLE tenants ADD COLUMN return_max_business_days INTEGER NOT NULL DEFAULT 7
  CHECK (return_max_business_days BETWEEN 0 AND 260);
ALTER TABLE tenants ADD COLUMN return_warning_days INTEGER NOT NULL DEFAULT 3
  CHECK (return_warning_days BETWEEN 0 AND 60);
