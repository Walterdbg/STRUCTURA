# Development Roadmap — STRUCTURA

## Document Control

| Field | Value |
| --- | --- |
| Project | STRUCTURA (ChatGPT project name: "Inventario") |
| Roadmap version | `1.14.1` |
| Current application version/build | `0.1.0-dev.6`: 0.1.0 feature-complete, READY FOR TEST by Walter |
| Last updated | 2026-09-30 |
| Document owner | Walter |
| Current environment | Development (Docker on Walter's PC, port 8095) |

## Version Control

| Version | Date | Modified by | Comments | Associated requirement |
| --- | --- | --- | --- | --- |
| 1.0.0 | 2026-09-29 | Claude (for Walter) | Initial roadmap, created from the STRUCTURA documentation package (spec v1.3) | N/A |
| 1.1.0 | 2026-09-29 | Claude (for Walter) | Walter approved repo/branch/version names and standalone architecture (P-001..P-003 → DEC-004..DEC-006); repo created and pushed | P-001, P-002, P-003 |
| 1.2.0 | 2026-09-29 | Claude (for Walter) | Walter set the solution type: Docker + JavaScript/Node (DEC-007); P-004 narrowed to the remaining stack details | P-004 |
| 1.3.0 | 2026-09-29 | Claude (for Walter) | Walter approved TypeScript, PostgreSQL on both sides, and a Linux onsite box (DEC-008..DEC-010). Stack ADR proposed in docs/ARCHITECTURE.md. New pending questions P-009..P-011 | P-004 |
| 1.4.0 | 2026-09-29 | Claude (for Walter) | Walter approved the architecture plan, Spanish + English, and own accounts first (P-004, P-009, P-010 → DEC-011..DEC-013). 0.1.0 step 1 started | P-004, P-009, P-010 |
| 1.5.0 | 2026-09-29 | Claude (for Walter) | 0.1.0 step 1 done: skeleton build 0.1.0-dev.1, 32/32 tests, verified in Docker (C-004). Step 2 (Phase 1 features) next | W-001 |
| 1.6.0 | 2026-09-29 | Claude (for Walter) | Step 2a done: accounts, permissions, Events (build 0.1.0-dev.3, 51/51 tests). dev.2 superseded (built twice; version rule). W-002 split into 2b/2c | W-002 |
| 1.7.0 | 2026-09-29 | Claude (for Walter) | Step 2b done: catalog, photos, locations, movement ledger and corrections (build 0.1.0-dev.4, 70/70 tests) | W-002 |
| 1.8.0 | 2026-09-29 | Claude (for Walter) | Step 2c done: Event products, availability check, confirm/cancel with both end days included (build 0.1.0-dev.5, 84/84 tests) | W-002 |
| 1.9.0 | 2026-09-29 | Claude (for Walter) | Change history view, photo permission fix, INSTALL + USER_GUIDE (build 0.1.0-dev.6, 89/89 tests). W-002 done; 0.1.0 handed to Walter for testing (T-001..T-006). Known limitations listed | W-002, B-001, B-002 |
| 1.9.1 | 2026-09-29 | Claude (for Walter) | End of day: DEFECT-002 added (browser's English required-field message), log closed | D-002 |
| 1.10.0 | 2026-09-30 | Claude (for Walter) | Walter added a read-only AI help assistant running on the tenant's own machine (DEC-014); timing and cloud-tenant hosting pending (P-012, P-013) | DEC-014 |
| 1.10.1 | 2026-09-30 | Claude (for Walter) | Walter clarified "outside" = outside our environment / secure connection paths (DEC-015); P-013 resolved by it | DEC-015 |
| 1.11.0 | 2026-09-30 | Claude (for Walter) | Walter's requirement: all tenant data on local machines encrypted, access only through the app or its export tool (DEC-016); design proposal P-014; limitation L-007 | DEC-016 |
| 1.12.0 | 2026-09-30 | Claude (for Walter) | Walter placed the search + assistant at the end of Phase 1 as version 0.2.0, after 0.1.0 is approved (DEC-017, was P-012). B-004 moved into the Phase 1 plan | DEC-017 |
| 1.13.0 | 2026-09-30 | Claude (for Walter) | Walter approved the encryption design with a scope: layer 1 (encrypted storage area) for everything; layer 2 (per-file app encryption) only for core data; product photos layer 1 only; users' own source folders out of scope (DEC-018, was P-014) | DEC-018 |
| 1.14.0 | 2026-09-30 | Claude (for Walter) | Walter's T-002 testing found D-003..D-006 (date rules and form messages); P-015 opened (past dates) | D-003..D-006 |
| 1.14.1 | 2026-09-30 | Claude (for Walter) | D-007: disabled Confirm button gives no reason | D-007 |

## Project Objective

Build STRUCTURA: an event-centered platform for inventory, services and
commercial operations, sold by subscription and license. The online engine
is primary. A licensed local server engine is the main onsite interface and
keeps working without internet. It supports quotes, approvals, inventory
movements, deliveries, invoices and payment records without becoming an
accounting system.

Full requirements:
[STRUCTURA_Implementation_Specification.md](docs/STRUCTURA_Documentation_Package/STRUCTURA_Implementation_Specification.md) (v1.3).

## Protected Baseline

These are the specification's locked (**L**) requirements. They must not
change without Walter's explicit approval. Full list and wording: spec
sections 2.2, 3 and 21.1.

- A movement can be a simple location update. A trip is always optional (answer 31).
- Map points and routes are not an inventory location hierarchy (answer 35).
- A quote is not a draft invoice. Invoices are separate records that may reuse, change or drop quote lines.
- Approval/acceptance, operational authorization and payment are separate facts.
- Events, quotes and invoices can be created without a final customer or final event name ("Internal Quote").
- Delivery proof is configurable. One simple photo satisfies a photo requirement (answer 34). Signatures are never universal.
- Attachments live on their records. No separate document-management subsystem (answer 38).
- Operational finance only (quotes, invoices, payment status, estimates). No accounting core (answer 39).
- Subscription plus license. Online engine is primary, local engine is secondary. Large files can stay in tenant repositories. Without an active license, full data transfer is blocked, but basic inventory/tracking CSV and printing still work (answer 40).
- Tenant invoices and STRUCTURA subscription billing are separate domains.
- Retained from the 27TS workbook/guide (**F**): rental dates include both departure and return days; returns split into usable / consumed / repair; posted movements are corrected by new records, never deleted.
- Do not invent the meaning of answers 32, 33 or 36, or any other documented gap (G-01–G-10).

## Current State

### Completed and verified

| ID | Capability | Evidence | Completed version | Status |
| --- | --- | --- | --- | --- |
| C-001 | Specification package placed in the project | 44 files extracted to `docs/STRUCTURA_Documentation_Package/`; SHA-256 of S7a–S7h matches `SOURCE_MANIFEST.json` (Working_Log_2026-09-29 entry 002) | N/A (documentation) | COMPLETED |
| C-002 | Standard project documentation set created | README, CHANGELOG, ROADMAP, docs/BUSINESS_RULES.md, daily log (Working_Log_2026-09-29 entry 003) | N/A (documentation) | COMPLETED |
| C-006 | 0.1.0 step 2b: locations, catalog (27TS fields), product photos, append-only movement ledger, corrections, stock figures, backups include files | 70/70 tests incl. AT-02, AT-03, AT-05, AT-28, AT-36 cases; browser check; Docker volume + backup check (Working_Log_2026-09-29 entry 009) | 0.1.0-dev.4 | COMPLETED |
| C-008 | 0.1.0 change history (audit.read API + screen panel), photo permission aligned with the operator profile, install and user guides | 89/89 tests incl. AT-18 cases; browser + Docker checks (Working_Log_2026-09-29 entry 011) | 0.1.0-dev.6 | COMPLETED |
| C-007 | 0.1.0 step 2c: Event inventory lines, availability (both end days, repair excluded, no double count, overdue stock blocks), confirm/cancel, re-check on changes | 84/84 tests incl. AT-04, AT-31, DST case; browser check; Docker check on PostgreSQL 17 (Working_Log_2026-09-29 entry 010) | 0.1.0-dev.5 | COMPLETED |
| C-005 | 0.1.0 step 2a: own staff accounts, sessions, capabilities/presets, Events (create/edit/search, version check, tenant isolation) | 51/51 tests incl. AT-01 and AT-28 cases; browser check on Docker (Working_Log_2026-09-29 entry 008) | 0.1.0-dev.3 | COMPLETED |
| C-004 | 0.1.0 step 1: skeleton (domain/server/web, Docker, migration 001, command handling, CI) | 32/32 tests; typecheck/build clean; Docker health check + append-only refusal on real PostgreSQL 17 (Working_Log_2026-09-29 entry 007) | 0.1.0-dev.1 | COMPLETED |
| C-003 | Git repository set up | `main` and `development/0.1.0` pushed to `Walterdbg/STRUCTURA`; confirmed with `git ls-remote` (Working_Log_2026-09-29 entry 004) | N/A (documentation) | COMPLETED |

### In progress

| ID | Work item | Current state | Remaining work | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| — | None | — | — | — | — |

### Ready for test

Walter tests the build running on his PC (see docs/USER_GUIDE.md; sign in with his own account created by the setup command in docs/INSTALL.md step 3). Each test is a yes/no.

| ID | Work item | Test required | Build | Status |
| --- | --- | --- | --- | --- |
| T-001 | Accounts (DEC-013) | Sign in; add a user with the *Operador de inventario* profile; sign in as that user and confirm they can record a movement but not create a product | 0.1.0-dev.6 | READY FOR TEST |
| T-002 | Events (UC-13, AT-01) | Create an Event with only a provisional name, no customer; set event date, departure and expected return; reopen it and check the three dates stayed separate | 0.1.0-dev.6 | FAIL 2026-09-30 (Walter): saves, but D-003..D-006. Retest in dev.7 |
| T-003 | Catalog and photos (UC-12, AT-05, AT-36) | Create two products, one with a barcode starting with 0; give each a photo; switch between them and check each keeps its own photo and the barcode keeps its 0 | 0.1.0-dev.6 | READY FOR TEST |
| T-004 | Movements (UC-03, AT-02, AT-03) | Create a warehouse and an event location; move part of a product's stock with no trip; try to move more than is there (must be refused); correct a movement and check the original stays, marked *Corregido* | 0.1.0-dev.6 | READY FOR TEST |
| T-005 | Reservations (UC-21, AT-04, AT-31) | Confirm Event A holding all of a product until day 14; an Event B starting day 14 must be refused; starting day 15 must confirm | 0.1.0-dev.6 | READY FOR TEST |
| T-006 | Change history (AT-18) | Open *Historial de cambios* on an Event and a product; check who/what/when is shown | 0.1.0-dev.6 | READY FOR TEST |

## Known Defects

| ID | Defect | Severity | Reproduction/evidence | Current status | Target |
| --- | --- | --- | --- | --- | --- |
| D-002 | Empty required field shows the browser's own English bubble ("Please fill out this field") even in Spanish | Low | Walter's screenshot; Working_Log_2026-09-29 DEFECT-002 | OPEN | 0.1.0-dev.7 |
| D-003 | Event date not checked against the rental period: an event on 26 Jul saved with warehouse departure on 6 Aug (event before the stock leaves) | Medium | Walter's T-002 screenshots, 2026-09-30 | OPEN | 0.1.0-dev.7 |
| D-004 | After fixing a refused date, the general message "Revise los campos marcados" stays on screen with no field marked, until the next save | Low | Walter's T-002 screenshots | OPEN | 0.1.0-dev.7 |
| D-005 | Past dates are accepted with no warning (whole rental period 6 Aug–22 Sep already over on 30 Sep) | Medium | Walter's T-002 screenshots | OPEN, rule pending P-015 | 0.1.0-dev.7 |
| D-006 | Date boxes show mm/dd/yyyy (browser's English) while the screen is in Spanish | Low | Walter's T-002 screenshots; same family as D-002 | OPEN | 0.1.0-dev.7 |
| D-007 | **Confirmar (reservar)** is disabled when the Event has no products (or no dates) but says nothing: pressing it does nothing, with no explanation, also after signing out and in | Medium | Walter, 2026-09-30, on the Event from his T-002 test | OPEN | 0.1.0-dev.7: the button stays pressable and says what is missing ("Agregue al menos un producto" / "Indique salida y retorno"), plus a hint next to it |
| D-001 | Saved Event stayed in edit mode | Low | Working_Log_2026-09-29 DEFECT-001 | CLOSED (fixed in dev.3) | — |

### Known limitations (by design in 0.1.0, not defects)

| ID | Limitation | Planned resolution |
| --- | --- | --- |
| L-001 | Sign-in throttling is kept in memory; a restart clears it | Move to the database with the local engine (Phase 4) |
| L-002 | Stock sent to an event location counts against that Event's reservation only when the movement names the Event | Explicit dispatch/return commands (Phase 3) |
| L-003 | Files are stored on a disk folder on both engines | S3-compatible adapter for the cloud at first cloud deployment |
| L-004 | Quantity tracking only; individual (serial) assets not yet | Assets module (later 0.x) |
| L-005 | If the database transaction fails after a photo's bytes were stored, an unreferenced file stays on disk (never shown) | Cleanup job with the worker queue (pg-boss) |
| L-006 | Only cloud mode is tested; ENGINE_MODE=local runs the same app without sync yet | Phase 4 |
| L-007 | Photos and backups are stored unencrypted in 0.1.0 (DEC-016/018 not built yet). Acceptable only for synthetic test data | DEC-018: layer 2 (core data, backups) in 0.2.0; layer 1 encrypted storage area with the onsite box (Phase 4) and at first cloud deployment. Must be in place before any real tenant data |

## Approved Decisions

| ID | Date | Decision | Reason | Affected area |
| --- | --- | --- | --- | --- |
| DEC-001 | 2026-09-29 | The STRUCTURA Documentation Package (spec v1.3) is the project's baseline documentation | Delivered by Walter as the complete package | All |
| DEC-002 | 2026-09-29 | Spec v1.1 (loose file at project root) is retired; v1.3 replaces it | Walter removed the loose v1.1 file | Specification |
| DEC-003 | 2026-09-29 | The spec's decision precedence applies: latest explicit user clarification → latest project document → earlier user decisions → spec's own C/D defaults | Spec section 1.1 | All |
| DEC-004 | 2026-09-29 | Repo `Walterdbg/STRUCTURA` (created by Walter); default branch `main`; first development branch `development/0.1.0` | Approved by Walter (was P-001) | Source control |
| DEC-005 | 2026-09-29 | Application version line `0.1.0`; test builds `0.1.0-dev.1`, `0.1.0-dev.2`, … | Approved by Walter (was P-002) | Versioning |
| DEC-006 | 2026-09-29 | STRUCTURA is standalone. It is not built on CITYTRI Hub's platform | Walter's decision (was P-003) | Architecture / Phase 0 |
| DEC-007 | 2026-09-29 | Solution type: Docker containers, JavaScript/Node | Walter's decision | Architecture / Phase 0 |
| DEC-008 | 2026-09-29 | Code is written in TypeScript (still Node; refines DEC-007) | Catches rule mistakes at build time; same as the Hub. Approved by Walter | Architecture |
| DEC-009 | 2026-09-29 | PostgreSQL on both the cloud and the local engine | Same data rules on both sides; simpler sync. Approved by Walter | Architecture / sync |
| DEC-010 | 2026-09-29 | The onsite local engine runs on a small Linux box with the free Docker Engine, not Docker Desktop on Windows. The code stays independent of the box | Reliability, and Docker Desktop licensing. Approved by Walter | Local engine / deployment |
| DEC-011 | 2026-09-29 | `docs/ARCHITECTURE.md` is approved as the stack ADR, including the 0.1.0 build order (section 5) | Approved by Walter (was P-004) | Architecture |
| DEC-012 | 2026-09-29 | Interface in Spanish and English from day one; Spanish is the default | Approved by Walter (was P-009); source material is Spanish | UI |
| DEC-013 | 2026-09-29 | Staff sign in with STRUCTURA's own accounts (email + password) first; Microsoft/Google sign-in later | Approved by Walter (was P-010) | Identity |
| DEC-014 | 2026-09-30 | Add a basic AI help assistant: it helps people search and find content and gives usage guidance. It **never changes anything** (read-only, no actions), answers only from STRUCTURA's own content (user guide + the records the asking person may see) and cites where each answer came from. The model runs **on the tenant's own machine** (option A, e.g. Ollama in Docker); no question or data goes to an outside AI service. Internet remains required for STRUCTURA; the model and its updates are downloaded over it. Built in two steps: plain search first, then the assistant on top | Walter's direction. The spec (21.1) listed AI automation as not in the baseline; this is new owner direction of higher precedence (spec 1.1), limited to read-only help | New module: search + assistant |
| DEC-015 | 2026-09-30 | Clarifies DEC-014: "no outside AI service" means nothing leaves **our environment**, i.e. STRUCTURA's own servers, the tenants' own machines, and the secure connections between them. The model may run on any machine inside that environment (the tenant's box, or STRUCTURA's cloud server for tenants without a box), reached only over secure connections. Never a third-party AI service | Walter's clarification. Resolves P-013 | Search + assistant; hosting |
| DEC-016 | 2026-09-30 | **Every local store of tenant data is encrypted.** The database, managed files (photos, signatures, delivery evidence, records captured offline), backups and the AI's index live only in an encrypted area that STRUCTURA uses. No direct access to it: data leaves only through STRUCTURA's export tool (with permission and license checks, audited). The AI assistant reads the latest local data inside that same encrypted area. Help content and the tenant's other data can live there too, off the public web | Walter's requirement. Makes spec 11.4 ("encrypt ... managed data where appropriate") mandatory for local stores. Limit, per spec 15.2: protects data at rest, stolen or copied; it can't make extraction impossible for someone with full admin control of a running, unlocked box. That risk is reduced by locking the box down as an appliance | Local engine, storage, backups, exports, AI |
| DEC-017 | 2026-09-30 | Search box + read-only AI help assistant (DEC-014..DEC-016) is version `0.2.0`, the **last part of Phase 1**, started after 0.1.0 is approved and frozen. Same naming as before: test builds `0.2.0-dev.1`, `0.2.0-dev.2`, … | Walter's decision (was P-012) | Roadmap / versioning |
| DEC-018 | 2026-09-30 | Encryption design (implements DEC-016). **Layer 1**, an encrypted storage area on every STRUCTURA machine (LUKS2 on the box, key sealed in its TPM chip; equivalent disk encryption in the cloud), holds the database, all managed files, backups and the AI index. **Layer 2**, per-tenant file encryption by the app (AES-256-GCM), applies only to core data: signatures, delivery photos and evidence, files attached to records, records and files captured offline and waiting to sync, backups and exports. **Product catalog photos get layer 1 only.** Users' own folders where they keep files before uploading (e.g. the 27TS `Imagenes` folder) are outside STRUCTURA and not encrypted by it. Exports only through STRUCTURA's tool; the box is locked down as an appliance | Walter approved the design (was P-014) and asked to limit per-file encryption to core data, photos only where simple. Layer 1 already encrypts photos at no extra effort | Storage, backups, exports, local engine |

## Pending Decisions

| ID | Question | Options or constraint | Needed by | Owner |
| --- | --- | --- | --- | --- |
| P-015 | Past dates on Events (D-005) | Proposed: saving with past dates shows a warning but is allowed (records can be entered after the fact); **confirming** (reserving stock) is refused when the expected return is already past, since stock can't be held for days that are over | Before 0.1.0-dev.7 | Walter |
| P-011 | Cloud hosting provider and onsite mini-PC model | Not blocking 0.1.0. DEC-014 adds a need: the machine running the local AI model needs roughly 8 GB of memory or more | Phase 4 / first cloud deployment | Walter |
| P-005 | Licensing policy values (gap G-07) | Pricing, plans, capacity limits, offline grace period. The spec says: configuration only, never invented | Phase 4 | Walter |
| P-006 | Tax, rounding, currency and retention settings (gap G-10) | Must be explicit configurable policies | Phase 2 | Walter |
| P-007 | Meaning of answers 32, 33 context and 36 default (gaps G-03–G-05) | Unrecoverable from sources. Build as configurable; confirm only if Walter recalls | Before claiming those policies are implemented | Walter |
| P-008 | Nine unsynced ChatGPT project sources and questions 1–30 (gaps G-01, G-02) | If recovered, reconcile against the spec; do not revive discarded platform approaches | Any time | Walter |

## Roadmap

Phases come from spec section 20. They are a proposed engineering sequence,
not an approved schedule.

### Immediate priorities

1. Walter tests 0.1.0-dev.6 (T-001..T-006). Fixes go into a bumped dev build.
2. On approval: freeze 0.1.0 (drop the -dev suffix, merge to `main`, tag) and start the next pipeline, whose name Walter approves first.
3. Phase 0 remainder: decision register, policy schema, workbook source mapping (spec 16.1).

### Near-term work

| Priority | Item | Dependency | Acceptance condition | Status |
| --- | --- | --- | --- | --- |
| 1 | Phase 0: architecture baseline (stack ADR, decision register, policy schema, workbook source mapping) | P-004 | Decision precedence preserved; no guessed answers for 32/36 | IN PROGRESS (stack ADR approved, DEC-011; workbook columns mapped for the catalog) |
| 2 | Phase 1: tenants, identity/scopes, Event CRUD, catalog + photos, locations, movement ledger, reservations, audit | Phase 0 | AT-01–05, AT-18, AT-28 pass | READY FOR TEST (0.1.0-dev.6, T-001..T-006) |
| 2b | Phase 1 (end), version 0.2.0: search box across records + user guide, then a read-only AI help assistant on a model inside our environment (DEC-014..DEC-017) | 0.1.0 approved and frozen; includes DEC-018 layer 2 (core data + backups) | Answers only from content the asking person may see, with links; no write path; no data leaves our environment; Spanish/English | PLANNED |
| 3 | Phase 2: quotes/approvals, independent invoices, payments, services, calendars | Phase 1 | AT-11–16, AT-27 pass | PLANNED |
| 4 | Phase 3: optional trips, partial delivery/returns, maps (POIs/routes), evidence | Phase 1 | AT-06–10, AT-29 pass | PLANNED |
| 5 | Phase 4: local engine, entitlements, authority delegation, sync, restricted exports, metering | Phases 1–3 | AT-19–24, AT-30 pass under fault injection | PLANNED |
| 6 | Phase 5: customer portal, imports/exports, repository adapter, integrations | Phases 1–4 | AT-17, AT-23, AT-25–26 pass | PLANNED |
| 7 | Phase 6: restore/migration runbooks, load testing, operator docs, traceability | Phases 1–5 | All ATs including AT-31–36 pass | PLANNED |

### Later / backlog

| ID | Item | Reason deferred | Revisit condition |
| --- | --- | --- | --- |
| B-003 | Migration of the 27TS workbook data (spec 16.1) | Needs the Phase 1 ledger and import job | Phase 5, or earlier if Walter asks |

## Build and Deployment Status

| Environment | Current build | Deployment date | Verification | Status |
| --- | --- | --- | --- | --- |
| Development | `0.1.0-dev.6` | 2026-09-29 | 89/89 tests; browser + Docker checks | Running on Walter's PC (http://127.0.0.1:8095), waiting for Walter's tests |
| Test | None | — | — | Not started |
| Production | None | — | — | Not started |

## Document Register

| Document | Purpose | Classification | Related item | Status |
| --- | --- | --- | --- | --- |
| `docs/STRUCTURA_Documentation_Package/STRUCTURA_Implementation_Specification.md` | Specification v1.3 | AUTHORITATIVE | DEC-001 | CURRENT |
| `docs/STRUCTURA_Documentation_Package/STRUCTURA_Use_Cases/` (README, INTEGRATION_CONTRACT, UC-01–25) | Use cases and shared contract | AUTHORITATIVE | DEC-001 | CURRENT |
| `docs/STRUCTURA_Documentation_Package/STRUCTURA_References/` | Source material (S1–S7h) | SUPPORTING | DEC-001 | CURRENT |
| `docs/STRUCTURA_Documentation_Package/START_HERE.md` | Package entry point | SUPPORTING | DEC-001 | CURRENT |
| `STRUCTURA_Documentation_Package.zip` | Original delivered package, unchanged | SUPPORTING | DEC-001 | CURRENT |
| `docs/BUSINESS_RULES.md` | Workflow rules + STRUCTURA rules | AUTHORITATIVE | — | CURRENT |
| `docs/ARCHITECTURE.md` | Stack ADR / architecture plan | AUTHORITATIVE | DEC-011 | CURRENT |
| `docs/INSTALL.md` | How to install, where data lives | AUTHORITATIVE | ex B-001 | CURRENT |
| `docs/USER_GUIDE.md` | How to use 0.1.0, workflow by workflow | AUTHORITATIVE | ex B-002 | CURRENT |
| `CHANGELOG.md` | Version history (Intent / Result) | AUTHORITATIVE | — | CURRENT |
| `docs/daily-logs/Working_Log_2026-09-29.txt` | Daily working log | SUPPORTING | — | CURRENT |

## Superseded or Rejected Documents

| Old document | Replacement or reason | Date | Status |
| --- | --- | --- | --- |
| `STRUCTURA_Implementation_Specification.md` v1.1 (project root) | Replaced by v1.3 in `docs/STRUCTURA_Documentation_Package/`; file removed by Walter | 2026-09-29 | SUPERSEDED |
| July 2026 WordPress proposal; older Odoo/Excel platform approaches | Excluded by the spec (section 1.2, 23) as superseded platform choices | 2026-09-29 | REJECTED |

## Daily Update Summary

### 2026-09-29

- Completed and verified:
  - Specification package extracted into the project with checksums confirmed (C-001).
  - Standard documentation set created (C-002).
  - Repo `Walterdbg/STRUCTURA` initialized; `main` and `development/0.1.0` pushed (C-003).
  - Skeleton build `0.1.0-dev.1`: 32/32 tests, verified in Docker (C-004).
  - Accounts, permissions and Events, build `0.1.0-dev.3`: 51/51 tests, browser-checked (C-005).
  - Catalog, photos, locations and movement ledger, build `0.1.0-dev.4`: 70/70 tests, browser + Docker checks (C-006).
  - Event products and reservations, build `0.1.0-dev.5`: 84/84 tests, browser + Docker checks (C-007).
  - Change history, guides, build `0.1.0-dev.6`: 89/89 tests (C-008).
- Still in progress:
  - None. 0.1.0 is READY FOR TEST (T-001..T-006).
- Defects added or remaining:
  - DEFECT-001 found and fixed the same day. DEFECT-002 open (for dev.7). Version-rule breach recorded (dev.2 built twice; superseded by dev.3).
- Deployment result:
  - Local development deployment only (Docker on Walter's PC), dev.6 running.
- First priority for next workday:
  - Walter's test results on T-001..T-006.
