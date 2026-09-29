# Development Roadmap — STRUCTURA

## Document Control

| Field | Value |
| --- | --- |
| Project | STRUCTURA (ChatGPT project name: "Inventario") |
| Roadmap version | `1.2.0` |
| Current application version/build | None yet. No code exists. Version line `0.1.0` approved. |
| Last updated | 2026-09-29 |
| Document owner | Walter |
| Current environment | Documentation only. No Development, Test or Production environment yet. |

## Version Control

| Version | Date | Modified by | Comments | Associated requirement |
| --- | --- | --- | --- | --- |
| 1.0.0 | 2026-09-29 | Claude (for Walter) | Initial roadmap, created from the STRUCTURA documentation package (spec v1.3) | N/A |
| 1.1.0 | 2026-09-29 | Claude (for Walter) | Walter approved repo/branch/version names and standalone architecture (P-001..P-003 → DEC-004..DEC-006); repo created and pushed | P-001, P-002, P-003 |
| 1.2.0 | 2026-09-29 | Claude (for Walter) | Walter set the solution type: Docker + JavaScript/Node (DEC-007); P-004 narrowed to the remaining stack details | P-004 |

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
| C-003 | Git repository set up | `main` and `development/0.1.0` pushed to `Walterdbg/STRUCTURA`; confirmed with `git ls-remote` (Working_Log_2026-09-29 entry 004) | N/A (documentation) | COMPLETED |

### In progress

| ID | Work item | Current state | Remaining work | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| — | None | — | — | — | — |

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

## Pending Decisions

| ID | Question | Options or constraint | Needed by | Owner |
| --- | --- | --- | --- | --- |
| P-004 | Remaining stack details (spec Phase 0, gap G-08) | Fixed: standalone (DEC-006), Docker + JavaScript/Node (DEC-007). Still open, for an ADR: relational database, web/API framework, UI approach, how the local engine is packaged and run onsite, cloud hosting | Phase 0 exit | Walter + Claude |
| P-005 | Licensing policy values (gap G-07) | Pricing, plans, capacity limits, offline grace period. The spec says: configuration only, never invented | Phase 4 | Walter |
| P-006 | Tax, rounding, currency and retention settings (gap G-10) | Must be explicit configurable policies | Phase 2 | Walter |
| P-007 | Meaning of answers 32, 33 context and 36 default (gaps G-03–G-05) | Unrecoverable from sources. Build as configurable; confirm only if Walter recalls | Before claiming those policies are implemented | Walter |
| P-008 | Nine unsynced ChatGPT project sources and questions 1–30 (gaps G-01, G-02) | If recovered, reconcile against the spec; do not revive discarded platform approaches | Any time | Walter |

## Roadmap

Phases come from spec section 20. They are a proposed engineering sequence,
not an approved schedule.

### Immediate priorities

1. Phase 0 on `development/0.1.0`: write the stack ADR within Docker + Node (P-004) and propose it to Walter.
2. Phase 0: decision register and policy schema.
3. Phase 0: workbook source mapping (spec 16.1).

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
| Development | None (branch `development/0.1.0` exists, docs only) | — | — | Not started |
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
- Still in progress:
  - None.
- Defects added or remaining:
  - None.
- Deployment result:
  - No deployment.
- First priority for next workday:
  - Phase 0: draft the stack ADR for Walter (P-004).
