# STRUCTURA — Architecture Plan (stack ADR)

**Status:** PROPOSED, 2026-09-29. Sections marked **[APPROVE]** need
Walter's yes or no before any code is written.
**Branch:** `development/0.1.0`
**Implements:** ROADMAP P-004 (spec Phase 0, gap G-08)

Already approved, and not reopened here:
- DEC-006: standalone, not built on CITYTRI Hub.
- DEC-007: Docker + JavaScript/Node.
- DEC-008: TypeScript.
- DEC-009: PostgreSQL on both cloud and local.
- DEC-010: the onsite server is a small Linux box running Docker Engine.

Where a choice matches CITYTRI Hub, it's on purpose, so both projects work
the same way. STRUCTURA still shares no code or database with the Hub.

## 1. What gets built

One repository with three parts (npm workspaces, like the Hub):

| Part | What it is |
| --- | --- |
| `domain` | The business rules, written once: commands, validation, permission checks, license checks, and money/quantity math. Plain TypeScript, with no web or database code. |
| `server` | The API, background jobs and sync. It calls `domain` for every rule. It also serves the web app. |
| `web` | The browser interface for staff and the customer portal. |

**The same Docker image runs as either engine.** One setting,
`ENGINE_MODE=cloud` or `ENGINE_MODE=local`, decides which. This is how
the spec's requirement (section 5.1) is met: the online and local engines
share the same rules, because they are the same code.

## 2. How it runs **[APPROVE]**

```text
CLOUD (Linux server/VM with Docker)          ONSITE (Linux mini-PC with Docker Engine)
┌──────────────────────────────────┐          ┌──────────────────────────────────┐
│ app     (ENGINE_MODE=cloud)      │          │ app     (ENGINE_MODE=local)      │
│ worker  (jobs: imports, exports, │  <-----> │ worker  (jobs + sync outbox)     │
│          files, sync inbox)      │   sync   │ db      PostgreSQL 17            │
│ db      PostgreSQL 17            │ over     │ files   folder on the box's disk │
│ files   S3-compatible storage    │ HTTPS    │ backup  nightly dump + files     │
│ backup  nightly dump             │          └──────────────▲───────────────────┘
└──────────────▲───────────────────┘                         │ onsite Wi-Fi/LAN
               │ internet                          staff phones, tablets, laptops
     office staff + customer portal                (browser only, nothing to install)
```

- **Background jobs** run in the same PostgreSQL database (a job-queue
  library, see section 3). There's no Redis or other extra service, so the
  onsite box stays simple.
- **Sync.** Every change is saved together with its audit entry and an
  "outbox" row, in one transaction. The worker sends outbox rows to the
  cloud and retries until the cloud acknowledges them. Every command has an
  ID, so a retry never doubles stock, payments or usage. This follows spec
  section 11. Photos and files upload separately, with checksums.
- **The onsite box** has the same containers as the cloud, set up with
  `docker compose up -d` and a license file. It's reachable on the event's
  local network. The internet is only needed for sync and license renewal.
- **Cloud hosting** (provider, region) isn't needed until the first cloud
  deployment. It stays open (section 7).

## 3. Technology **[APPROVE]**

| Area | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | Long-term support; same as the Hub |
| Language | TypeScript 5 (DEC-008) | Catches rule mistakes at build time |
| API server | Fastify 5 | Fast and simple; same as the Hub |
| Database | PostgreSQL 17 (DEC-009) with `pg` and plain numbered SQL migrations | Same database in the cloud and onsite; same approach as the Hub |
| Money and quantities | PostgreSQL `NUMERIC` plus the `decimal.js` library. JavaScript numbers are never used for money | The spec requires exact decimals (8.3, AT-16) |
| Record IDs | UUID v7 | Can be created offline without collisions, and sort by time |
| Input rules | `zod` schemas, shared by the UI, API and sync | One definition of each command's valid input |
| Background jobs | `pg-boss` (a queue stored inside PostgreSQL) | Durable retries with no extra service |
| License files | Signed with Ed25519 through `jose` (already used by the Hub) | The onsite box can verify a license offline; it can't be edited without breaking the signature |
| Web UI | React 18 + Vite | Same as the Hub |
| Maps | Leaflet | Suggested by the spec; handles points, routes and GeoJSON |
| File storage | S3-compatible in the cloud, a folder on disk onsite, behind one adapter | Spec 5.1 and 13 |
| Tests | Vitest (with PGlite for fast database tests, as in the Hub), plus real-PostgreSQL integration tests. Playwright for end-to-end tests later | Spec 19.2 test layers |

## 4. Data rules built in from day one

These are spec requirements that are expensive to add later, so the first
database migration includes them:

- Every table has `tenant_id`. Database constraints stop one tenant's
  record from pointing to another tenant's.
- Posted movements, approvals, payments and audit entries can't be updated
  or deleted, enforced by the database itself and not just the app.
  Corrections are new linked records.
- Stock balances are calculated from movements and never edited directly.
- Every change command stores its command ID. The same ID with the same
  data returns the original result; the same ID with different data is
  rejected.

## 5. Build order for 0.1.0 **[APPROVE]**

Version line `0.1.0` (DEC-005). Test builds are Docker images tagged
`0.1.0-dev.1`, `0.1.0-dev.2`, … There are no exe files in this project.

1. Project skeleton, Docker files, the first migration (section 4) and CI tests.
2. Spec **Phase 1**: tenants and users with permissions, Event creation
   (without a customer or final name), catalog with photos, locations,
   movement ledger, reservations (both end dates included) and audit.
3. Running in **cloud mode** only, but with command IDs and the outbox
   already in place, so the local engine (Phase 4) doesn't mean rewriting
   anything.

`0.1.0` is done when AT-01–05, AT-18 and AT-28 pass. Then Walter tests.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Phone cameras in browsers need HTTPS for some features. On an event LAN, HTTPS needs a certificate | Photo capture uses the standard file/camera picker, which works without HTTPS. A local certificate for the box is set up in Phase 4 |
| Offline maps: the free OpenStreetMap tile servers don't allow bulk or offline downloading (spec 12) | Store event points and routes locally, which works now. Choose a tile provider that allows offline use, or host tiles ourselves, in Phase 3 |
| JavaScript on the onsite box can be read by whoever controls that machine | Accepted by the spec (15.2). Licenses are enforced with signed files and server checks, not by hiding code |
| Docker Engine on the mini-PC needs a documented setup | A setup guide goes in `docs/INSTALL.md` (backlog B-001) with the first onsite build |

## 7. Needs Walter's answer

1. Approve sections 2, 3 and 5, or say what to change.
2. **Interface language.** The source material is in Spanish (27TS
   inventory, SOP). Proposal: Spanish and English from day one, with
   Spanish as the default. Or just one of them?
3. **How staff sign in.** STRUCTURA is sold to other companies, so the
   proposal is its own accounts (email and password) first, with
   Microsoft/Google sign-in as a later option. OK?
4. **Not needed yet, answer when convenient:** cloud hosting provider and
   the mini-PC model. Neither blocks 0.1.0; they're needed by Phase 4 and
   the first cloud deployment.
