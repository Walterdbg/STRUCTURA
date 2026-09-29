# Changelog — STRUCTURA

Every entry gets an **Intent** and a **Result**. A Result is only marked
confirmed once actually verified, and can honestly say FAILED.

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
