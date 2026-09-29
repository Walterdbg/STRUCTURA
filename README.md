# STRUCTURA

STRUCTURA is a platform for running events. It handles the inventory,
services and commercial work around each event, and is sold by subscription
and license.

- **Online engine**: the main system.
- **Licensed local engine**: a server on the event site's network. Staff use
  it from their browsers onsite, and it keeps working when the internet is
  down. It syncs with the online engine when the connection returns.

It covers inventory and movement history, events, optional trips, event
maps (points and routes), delivery proof (confirmation, photo, signature),
services, quotes, invoices and payment status, a customer portal, audit,
imports/exports, licensing and capacity metering.

It is **not** an accounting system: no general ledger, bank reconciliation
or payroll.

## Status

Documentation only. No code, no build yet. Standalone product (not built
on CITYTRI Hub): Docker, Node + TypeScript, PostgreSQL, and a Linux box
for the onsite server. The detailed stack is proposed in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), awaiting approval. Repo:
[Walterdbg/STRUCTURA](https://github.com/Walterdbg/STRUCTURA). Work
happens on `development/0.1.0`. See
[ROADMAP.md](ROADMAP.md) for what's next and [CHANGELOG.md](CHANGELOG.md)
for history.

## Where things are

| Path | What it is |
| --- | --- |
| [docs/STRUCTURA_Documentation_Package/START_HERE.md](docs/STRUCTURA_Documentation_Package/START_HERE.md) | Entry point to the specification package |
| [docs/STRUCTURA_Documentation_Package/STRUCTURA_Implementation_Specification.md](docs/STRUCTURA_Documentation_Package/STRUCTURA_Implementation_Specification.md) | **The specification (v1.3)**: requirements, data model, rules, acceptance tests AT-01–36, build phases 0–6 |
| [docs/STRUCTURA_Documentation_Package/STRUCTURA_Use_Cases/](docs/STRUCTURA_Documentation_Package/STRUCTURA_Use_Cases/README.md) | 25 use cases (UC-01–25) and the shared integration contract |
| [docs/STRUCTURA_Documentation_Package/STRUCTURA_References/](docs/STRUCTURA_Documentation_Package/STRUCTURA_References/README.md) | Source material: the 27TS inventory workbook, SOP, QA report, barcode specs, conversation excerpts |
| `STRUCTURA_Documentation_Package.zip` | The original package as delivered, kept unchanged |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Development workflow rules plus STRUCTURA-specific rules |
| `docs/daily-logs/` | Daily working logs (`Working_Log_YYYY-MM-DD.txt`) |

## Rules that must not be broken

Short version; the full list is in [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md).

- A movement doesn't need a trip.
- A quote isn't a draft invoice. An invoice is its own record.
- Approval isn't payment.
- Events, quotes and invoices can exist before the final customer is known.
- Map points are not an inventory location hierarchy.
- Without an active license, full data transfer is blocked; basic inventory
  CSV and printing still work.
- Posted records are never edited or deleted; corrections are new linked
  records.

## For a new Claude session

1. Read `~/.claude/CLAUDE.md` and the files it points to.
2. Read [ROADMAP.md](ROADMAP.md), then the specification's sections 1, 3
   and 22.
3. Log work in today's `docs/daily-logs/Working_Log_YYYY-MM-DD.txt`.
4. Don't fill in the documented gaps (spec section 21, G-01–G-10) with
   guesses.
