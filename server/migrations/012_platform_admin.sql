-- 012_platform_admin.sql
--
-- Platform administrators (DEC-039): the STRUCTURA operator (Walter) sees
-- platform-wide views, starting with the course library of every
-- organization, grouped by country > area > place. Read-only; granted only
-- with the operator tool (cli/platform.js), never from the screens.
ALTER TABLE users ADD COLUMN platform_admin BOOLEAN NOT NULL DEFAULT false;
