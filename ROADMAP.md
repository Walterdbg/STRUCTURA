# Development Roadmap — STRUCTURA

## Document Control

| Field | Value |
| --- | --- |
| Project | STRUCTURA (ChatGPT project name: "Inventario") |
| Roadmap version | `1.6.0` |
| Current application version/build | `0.1.0-dev.3` (accounts + Events, not yet tested by Walter) |
| Last updated | 2026-09-29 |
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
| C-005 | 0.1.0 step 2a: own staff accounts, sessions, capabilities/presets, Events (create/edit/search, version check, tenant isolation) | 51/51 tests incl. AT-01 and AT-28 cases; browser check on Docker (Working_Log_2026-09-29 entry 008) | 0.1.0-dev.3 | COMPLETED |
| C-004 | 0.1.0 step 1: skeleton (domain/server/web, Docker, migration 001, command handling, CI) | 32/32 tests; typecheck/build clean; Docker health check + append-only refusal on real PostgreSQL 17 (Working_Log_2026-09-29 entry 007) | 0.1.0-dev.1 | COMPLETED |
| C-003 | Git repository set up | `main` and `development/0.1.0` pushed to `Walterdbg/STRUCTURA`; confirmed with `git ls-remote` (Working_Log_2026-09-29 entry 004) | N/A (documentation) | COMPLETED |

### In progress

| ID | Work item | Current state | Remaining work | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| W-002 | 0.1.0 step 2: spec Phase 1 features | 2a done (accounts, permissions, Events: C-005) | 2b: catalog + photos, locations, movement ledger and corrections. 2c: Event inventory lines, reservations with both end days included, confirm/cancel. Then audit reads. AT-02–05, AT-18 | Claude | IN PROGRESS |

### Ready for test

| ID | Work item | Test required | Build | Status |
| --- | --- | --- | --- | --- |
| — | None | — | — | — |

## Known Defects

| ID | Defect | Severity | Reproduction/evidence | Current status | Target |
| --- | --- | --- | --- | --- | --- |
| — | None (no code yet) | — | — | — | — |

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

## Pending Decisions

| ID | Question | Options or constraint | Needed by | Owner |
| --- | --- | --- | --- | --- |
| P-011 | Cloud hosting provider and onsite mini-PC model | Not blocking 0.1.0 | Phase 4 / first cloud deployment | Walter |
| P-005 | Licensing policy values (gap G-07) | Pricing, plans, capacity limits, offline grace period. The spec says: configuration only, never invented | Phase 4 | Walter |
| P-006 | Tax, rounding, currency and retention settings (gap G-10) | Must be explicit configurable policies | Phase 2 | Walter |
| P-007 | Meaning of answers 32, 33 context and 36 default (gaps G-03–G-05) | Unrecoverable from sources. Build as configurable; confirm only if Walter recalls | Before claiming those policies are implemented | Walter |
| P-008 | Nine unsynced ChatGPT project sources and questions 1–30 (gaps G-01, G-02) | If recovered, reconcile against the spec; do not revive discarded platform approaches | Any time | Walter |

## Roadmap

Phases come from spec section 20. They are a proposed engineering sequence,
not an approved schedule.

### Immediate priorities

1. Read the use cases and 27TS sources that Phase 1 depends on (UC-03, 08, 12, 13, 21; S7a, S7b).
2. 0.1.0 step 2: spec Phase 1 features (W-002).
3. Phase 0 remainder: decision register, policy schema, workbook source mapping (spec 16.1).

### Near-term work

| Priority | Item | Dependency | Acceptance condition | Status |
| --- | --- | --- | --- | --- |
| 1 | Phase 0: architecture baseline (stack ADR, decision register, policy schema, workbook source mapping) | P-004 | Decision precedence preserved; no guessed answers for 32/36 | PLANNED |
| 2 | Phase 1: tenants, identity/scopes, Event CRUD, catalog + photos, locations, movement ledger, reservations, audit | Phase 0 | AT-01–05, AT-18, AT-28 pass | PLANNED |
| 3 | Phase 2: quotes/approvals, independent invoices, payments, services, calendars | Phase 1 | AT-11–16, AT-27 pass | PLANNED |
| 4 | Phase 3: optional trips, partial delivery/returns, maps (POIs/routes), evidence | Phase 1 | AT-06–10, AT-29 pass | PLANNED |
| 5 | Phase 4: local engine, entitlements, authority delegation, sync, restricted exports, metering | Phases 1–3 | AT-19–24, AT-30 pass under fault injection | PLANNED |
| 6 | Phase 5: customer portal, imports/exports, repository adapter, integrations | Phases 1–4 | AT-17, AT-23, AT-25–26 pass | PLANNED |
| 7 | Phase 6: restore/migration runbooks, load testing, operator docs, traceability | Phases 1–5 | All ATs including AT-31–36 pass | PLANNED |

### Later / backlog

| ID | Item | Reason deferred | Revisit condition |
| --- | --- | --- | --- |
| B-001 | `docs/INSTALL.md` | Nothing installable yet | First installable build (local engine or server) |
| B-002 | `docs/USER_GUIDE.md` | No workflows usable yet | First usable build |
| B-003 | Migration of the 27TS workbook data (spec 16.1) | Needs the Phase 1 ledger and import job | Phase 5, or earlier if Walter asks |

## Build and Deployment Status

| Environment | Current build | Deployment date | Verification | Status |
| --- | --- | --- | --- | --- |
| Development | `0.1.0-dev.3` | 2026-09-29 | 51/51 tests; browser check | Running on Walter's PC (port 8095) |
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
- Still in progress:
  - None.
- Defects added or remaining:
  - None.
- Deployment result:
  - No deployment.
- First priority for next workday:
  - 0.1.0 step 2: Phase 1 features (W-002).
