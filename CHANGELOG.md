# Changelog — STRUCTURA

Every entry gets an **Intent** and a **Result**. A Result is only marked
confirmed once actually verified, and can honestly say FAILED.

## 0.1.0-dev.5 — 2026-09-29 (step 2c: Event products and reservations) — NOT YET TESTED BY WALTER

**Intent:** an Event lists the products it needs (the workbook's
"NUEVO ALQUILER" lines), checks availability for its dates (VALIDAR), and
confirming it commits the stock, with both the departure and the return
day included (UC-21, AT-04, AT-31).

**Result:**
- Migration `004_reservations.sql`: Event inventory lines and
  reservations. A reservation never moves stock. The database refuses
  deleting a reservation or changing it, except to close it (released /
  cancelled / fulfilled, with who and when).
- Availability for [departure, expected return], both days included:
  - Capacity is everything owned except what is in repair.
  - Subtracted: the largest daily total of other Events' reservations.
  - Also subtracted: stock sitting at an event location that no
    reservation explains, and stock still out for an Event whose expected
    return has passed. An expected return date never creates a receipt.
  - Stock moved to an event location *for* an Event is covered by that
    Event's reservation, so it is not counted twice.
- Confirm (Borrador → Confirmado) needs both rental dates and at least
  one product. It refuses and lists every product that doesn't fit, and
  nothing is reserved. Commitments per product are serialized, so two
  people confirming at once can't overbook.
- Editing the products or the rental dates of a confirmed Event re-checks
  availability. If the change doesn't fit it is refused and the previous
  reservations stand.
- Cancel (Borrador/Confirmado only) releases the reservations. History is
  kept. A cancelled Event can't be cancelled again.
- Dates are local calendar days; checked across the New York
  daylight-saving change (2026-11-01).
- Screens (Spanish/English): "Productos del evento" on the Event page,
  with requested / reserved / available per product,
  **Confirmar (reservar)** and **Cancelar evento**.
- Tests: 84/84 (domain 10, server 74).
- Checked in the browser (dev run): with 5 of 7 mics reserved for 10–14
  October, an Event starting on the 14th shows 2 available, is refused at
  3 (listing requested 3 / available 2) and confirms at 2.
- Checked in Docker dev.5: migration 004 applied, and the day-14 case is
  refused on real PostgreSQL 17.

## 0.1.0-dev.4 — 2026-09-29 (step 2b: catalog, photos, locations, movement ledger) — NOT YET TESTED BY WALTER

**Intent:** standard inventory entry, search and location tracking
through ordinary screens (INV-01, UC-03, UC-08), product photos that
always stay with the right product (UC-12, AT-05), and a movement ledger
where mistakes are corrected, never erased (AT-03).

**Result:**
- Migration `003_inventory.sql` adds:
  - locations: a flat list typed as warehouse, event, repair or other
  - a catalog with the 27TS workbook fields
  - attachments
  - an append-only movement ledger (movements and lines)
  - stock positions that can never go negative
- Catalog: barcodes are stored as text, so leading zeros are kept. A
  category change never recodes a barcode (AT-36). A duplicate barcode is
  refused, naming the product that already has it. Distinct products can
  share a name and are found by reference. Every product has a unit and
  the decimals it allows (Unidad 0, Galón 3…). A price needs a currency.
- The "Cantidad inicial" is recorded as an opening-balance movement,
  never as an editable total. Total / en almacén / en eventos / en
  reparación are calculated from stock positions.
- Movement types map to the workbook's list: receipt, adjustment in and
  out (written reason required), location change (UC-03, no Trip), to
  repair, back from repair, consumption, write-off. A correction posts a
  linked reverse movement once, and the original is kept.
- Movements refuse to take more than is at the source and change nothing
  when refused, including the other lines. A retry with the same command
  ID moves the stock only once.
- Photos (UC-12):
  - only JPEG, PNG or WebP up to 10 MB, checked by content, not by name
  - stored before being recorded; a storage failure reports an error and
    the product keeps its previous photo
  - each photo is bound to its product's ID
  - another organization gets "not found"
- Docker: photos go on a new `structura-files` volume. The nightly backup
  now writes the database dump plus a files archive (spec 18.3).
- Screens (Spanish/English): Inventory (search, photo thumbnails, the
  four stock figures), product page (photo, stock by location, history
  with Corregir), Locations, New movement (shows what's available at the
  source) and the Movements list.
- Development only: `server/dist/cli/dev.js` runs the app on an in-memory
  database for checking screens without spending a version number.
- Tests: 70/70 (domain 10, server 60).
- Checked in the browser (dev run, synthetic data):
  - the list shows the correct stock figures and the barcode's leading
    zero
  - the product page shows its photo, stock by location and history
  - a transfer of 9 with 6 available is refused in Spanish and nothing
    moves
  - a transfer of 2 then shows 4 in the warehouse and 2 at the event
- Checked in Docker dev.4: health ok, migration 003 applied, the photo is
  still served after an app restart, and the backup wrote both parts.

## 0.1.0-dev.3 — 2026-09-29 (step 2a: accounts, permissions, Events) — NOT YET TESTED BY WALTER

**Intent:** staff sign in with STRUCTURA's own accounts (DEC-013), and
permitted staff can create Events directly (UC-13, AT-01).

**Result:**
- Migration `002_identity_events.sql`: passwords (scrypt), sessions
  (only a SHA-256 of the token is stored), capabilities per membership,
  and Events with separate event / departure / expected-return / closure
  dates, a provisional or final designation, and no customer required.
- Sign-in: HttpOnly + SameSite=Strict cookie, 12-hour sessions checked on
  every request, one message for any wrong email/password, and a block
  after 5 failures for 15 minutes. Organization chooser when a person
  belongs to several.
- Permissions from spec 7 (capabilities, with presets: administrator,
  operations manager, inventory operator, viewer/auditor). The
  administrator adds users with an initial password. Passwords never
  reach the audit, command log or outbox (tested).
- Events: create, edit with version check (a stale edit is refused and
  the input stays on screen), search, and tenant isolation (another
  organization gets "not found").
- Setup command for a new installation: `server/dist/cli/bootstrap.js`
  (password via the `ADMIN_PASSWORD` variable, never the command line).
- Screens (Spanish/English): sign-in, Events list with a visible **Crear
  evento** button, Event form with field-level errors, Users.
- Tests: 51/51 (domain 10, server 41).
- Checked in the browser on dev.3 (Docker, synthetic account):
  - sign-in works
  - a return date before departure is caught on the right field, with the
    input kept
  - saving opens the saved record
  - the list shows both Events with separate dates
  - no sideways page scroll at 375px wide

**Version note:** `0.1.0-dev.2` was built twice: the second build added
the fix that makes a saved Event open as the saved record. Nobody
received it. dev.3 is the code of that second build, rebuilt under a new
number as the version rule requires. dev.2 is superseded.

## 0.1.0-dev.1 — 2026-09-29 (skeleton: 0.1.0 step 1) — NOT YET TESTED BY WALTER

**Intent:** lay the foundation from ARCHITECTURE.md sections 1–5 so the
Phase 1 features have somewhere correct to live. No business features yet.

**Result:**
- Three parts: `domain` (shared rules), `server` (Fastify API), `web`
  (React screen). One Docker image; `ENGINE_MODE` picks cloud or local.
- Migration `001_foundation.sql`: tenants, users, memberships, command
  log, audit entries, outbox. The database itself refuses UPDATE, DELETE
  and TRUNCATE on the command log and audit (confirmed on real PostgreSQL
  17 in Docker). Composite keys stop cross-tenant references.
- Command handling (`executeCommand`): the change, its audit entry, its
  outbox row and its command-log row commit together or not at all. A
  retry with the same command ID returns the stored result; the same ID
  with different data is refused.
- Exact decimals (`decimal.js`; NUMERIC stays text end to end), UUID v7
  IDs, and error kinds from spec 18.1, each with its own HTTP status.
- Screen: Spanish by default, English switch (remembered per browser),
  system status (version, engine, installation).
- Docker Compose: database, app, nightly backup (keeps 14).
- GitHub Actions CI: typecheck, tests, Docker build.
- Tests: 32/32 (domain 10, server 22), run on in-memory PostgreSQL
  (PGlite). Typecheck and build clean.
- Verified in Docker on this PC: `/api/health` → `0.1.0-dev.1`, database
  ok; migration applied; first backup written; screen checked in both
  languages.
- Local port: 8095 in this PC's `.env` (8080 is taken by another Docker
  app and 8090 by Wondershare).

## Project setup — 2026-09-29 (documentation only, no application version)

**Intent:** turn the delivered specification package into a project folder
that follows the standard documentation set.

**Result:**
- `STRUCTURA_Documentation_Package.zip` (spec v1.3, 25 use cases,
  integration contract, reference library) extracted to
  `docs/STRUCTURA_Documentation_Package/`. The ZIP itself is kept
  unchanged. Confirmed: 44 files extracted; SHA-256 of all 8 reference
  files (S7a–S7h) matches `SOURCE_MANIFEST.json`.
- The older loose spec (v1.1) at the project root was removed by Walter
  before setup; v1.3 inside the package is the current specification.
- Created `README.md`, `CHANGELOG.md`, `ROADMAP.md`,
  `docs/BUSINESS_RULES.md` and `docs/daily-logs/Working_Log_2026-09-29.txt`.
- Added STRUCTURA to `~/.claude/GENERAL_ROADMAP.md`.
- Walter approved the names and created `Walterdbg/STRUCTURA`. Docs
  committed on `main`, and `development/0.1.0` was created from it. Both
  pushed and confirmed on the remote with `git ls-remote`.
- Walter's decision: STRUCTURA is standalone, not built on CITYTRI Hub
  (ROADMAP DEC-006). Solution type is Docker + JavaScript/Node (DEC-007).
