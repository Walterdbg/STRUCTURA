# Business Rules — STRUCTURA

> **This file mirrors `~/.claude/DEVELOPMENT_BASE_WORKFLOW_AND_RULES.md`**
> (copied 2026-09-29, at project creation), plus the "Asking Walter to act"
> rule from `~/.claude/GENERAL_BUSINESS_RULES.md`. If either file is
> updated later, reconcile this copy against it. Project-specific rules
> are at the end, under "STRUCTURA — project-specific rules".

---
# Development base workflow and rules

The complete development/deployment workflow — same on every project, same
client throughout. Every Claude instance, on any project, reads this file
(via `CLAUDE.md`) before doing development work.

## The freeze protocol

"Freeze" means the same thing everywhere: the code, the pipeline (the git
branch used for development — these two words mean the same thing), and
the current data at that point all become a permanent, protected baseline
together — the "master code" concept. Once frozen:

- It is **never deleted**, ever — not for cleanup, not because a newer
  version supersedes it, not for any reason short of being told to delete
  that exact one, explicitly, by name.
- No further changes land on it. New work happens on a separate
  development branch/pipeline instead.
- A data change can still be explicitly authorized against a frozen
  baseline case-by-case (e.g. a backfill), but only as a **value update
  within the existing schema** — never a schema/structure change. A
  schema change requires a new version/freeze cycle, not an in-place
  exception.
- **Never touch anything in a frozen state unless explicitly told to, and
  even then, explain what you intend to do and the real reason behind it
  before doing it** — not just a restated instruction back, an actual
  justification. An earlier explanation of a scenario in conversation is
  not the same as a fresh, explicit "do this now."

**"Freeze" is reserved for an actual approved baseline — not every dev
branch.** An ordinary in-progress development branch that hasn't been
separately approved doesn't get this treatment; it can be renamed or moved
forward freely. Only apply the permanent/protected treatment to something
that was explicitly frozen/approved as a baseline. When a version line IS
frozen, the next round of new work moves to the next line (e.g. `0.9.6`
frozen → work continues on `0.9.7`, not another patch on `0.9.6`).

## Moving from a frozen baseline to a new pipeline — checklist

1. Verify the frozen baseline is actually present and pushed to its git
   remote — check, don't assume.
2. Verify the old/current development pipeline (branch) is decommissioned
   — retired, not left active alongside the new one.
3. **Verify the new pipeline's name with the user before creating it** —
   never pick a branch/pipeline name unilaterally. This extends to any
   naming choice, not just branches: version labels, artifact banner text,
   file names — propose it and get approval before applying it.
4. **Name the new branch descriptively from the moment it's created** —
   e.g. `development/0.9.7`, never a bare `development` that has to be
   renamed later (renaming into a nested name after the fact can hit a git
   ref conflict — `refs/heads/development` and
   `refs/heads/development/0.9.7` can't coexist on a remote — avoidable
   entirely by naming it right the first time).
5. Verify the real data from the frozen pipeline gets copied to the new
   one where applicable, so the new pipeline works from its own separate
   copy — testing new logic must never share the same live data set the
   frozen version is still being read from/used with.
6. The new pipeline's data/results/executables must never cross back into
   or mix with the frozen pipeline's, in either direction.

## Never delete a frozen/approved baseline, ever

Not for cleanup, not because a newer version supersedes it, not for any
reason short of being told to delete that exact one, explicitly, by name.
Applies to the git tag/commit and to its exe file(s) in `dist/`/
`releases/`.

## Version numbering

Never build or rebuild an executable (or any versioned artifact) under a
version number that's already been used — not even for a build "still in
progress" or "just testing." Bump first, every time, no exceptions, even
if nothing else in the source changed since the last build under that
number.

**Iterative test builds, before one is approved**: use a semver
pre-release suffix — `0.9.7-dev.1`, `0.9.7-dev.2`, etc., incrementing per
test build. Never zero-pad (`dev.001` is invalid semver and gets silently
mangled by tooling that cleans version strings). Avoid a 4-segment scheme
like `0.9.7.1` — electron-builder's semver cleaner corrupts it (confirmed:
`0.3.18.1` → `0.3.1-8.1`), corrupting both the exe filename and its
embedded Windows FileVersion/ProductVersion metadata. Once a test build is
approved as the new baseline, drop the suffix and ship the clean version
number.

A version bumped in `package.json` for exe-naming purposes must correspond
to an actual git commit, not just uncommitted working-tree state —
otherwise the version string isn't rollback-able or diff-able. Make sure
the code a build is based on is actually committed first.

## Exe deployment checklist

Whenever asked for a new exe build, work through this rather than just
running the build command and handing over the file:

*Before building:* confirm/bump the version number (see above); diff the
working source against the last build/commit so both sides know exactly
what's changing; test the change in a browser/dev-server setup first when
the change is observable there. **Check that every source file the app is
built from was last modified before, not after, any existing build you're
about to hand off as current** — a source change made after the last
build means that build is stale and must not be presented as reflecting
current code (confirmed real incident, 2026-09-16: fixes were made to
source after a build, the stale exe was handed back for testing anyway,
and the user rightly returned it as a failed deploy).

*Build:* run the build; verify the output filename matches what's
expected; verify the exe's embedded Windows version metadata
(`(Get-Item <exe>).VersionInfo` in PowerShell) actually matches the
intended version — confirmed able to silently corrupt independent of the
filename.

*Post-build sanity check:* if the build tooling supports it, extract the
packaged app and spot-check that the intended change is actually present
in the packaged source — don't just trust that editing the source was
enough.

*User testing:* the user tests the actual exe; gives an explicit yes/no.
Issues get fixed and rebuilt under a bumped version; approval moves to the
next step.

*After approval:* freeze the code — no further changes to that line;
commit and push to git as the new baseline; only then start the next dev
pipeline (see the checklist above).

## Performance in render-heavy UI code

These apps (Startline, Shipment Tracker) use a full-innerHTML-replace render
pattern — every interaction re-renders the whole visible screen from
scratch, calling every render-time helper function once per visible row. A
helper that's individually cheap can become catastrophic once multiplied by
hundreds of rows, especially if it calls another per-row helper internally.

- **Never call an O(n) list-scanning helper (filter/find/some/every over the
  full dataset) from inside another function that itself gets called once
  per row.** That's an accidental O(n²) cost per call — and if that outer
  function is also called multiple times per row (e.g. once for a badge,
  once for a background color, once for a tooltip), the whole render
  becomes O(n³). Confirmed real incident, 2026-09-17: a "distinct color per
  email group" helper filtered the full record list, and for *each* record
  in that filter it called another helper that itself re-filtered the full
  list again — roughly 200 million redundant operations for a single
  render of 411 real records, freezing the app solid (confirmed by direct
  benchmark: ~1156ms for one render pass before the fix, ~1ms after).
- **Precompute once per render, not once per row.** Any per-row value
  derived from the full dataset (a count, a group membership, an assigned
  color) belongs in a Map/Set built exactly once at the top of the render
  pass, then read via O(1) lookups per row — never recomputed inside the
  per-row loop itself.
- **Test performance-sensitive logic against real data scale, not just a
  small test fixture.** The incident above passed every check performed
  against a ~100-record synthetic fixture with only a handful of groups —
  the quadratic cost was completely invisible at that scale and only
  surfaced against the real ~400-record event. Before shipping a change to
  a hot render path (anything called per-row in a table), either test it
  against a dataset close to real production scale, or explicitly reason
  through its Big-O complexity — a small fixture passing cleanly is not
  proof a render-path change is safe.

## Standard project documentation set

Every project should carry the same baseline set of docs, so opening any
one of them is self-explanatory without hidden tribal knowledge:

- **A purpose/README doc** — what the app is, for a new person or a new
  Claude session to understand immediately, without reading source code
  first.
- **`CHANGELOG.md`** — version history. Every entry gets an Intent and a
  Result, and Result is only marked confirmed once actually verified, not
  just written — a Result can honestly say FAILED.
- **`ROADMAP.md`** — planned/pending work, open defects, what's
  deliberately not done yet. Not a record of what shipped (that's the
  changelog) — a record of what's next. If organized by phase, the phase
  structure should cover the whole document consistently, not just one
  section of it. Versioned per "logs are the law": when an entry is
  removed or superseded, the change itself should be traceable, not
  silently edited away with no record.
- **`docs/BUSINESS_RULES.md`** — a copy of this file's content (not just a
  link, so the project is readable standalone) plus whatever is specific
  to that one project.
- **`docs/INSTALL.md`** — whenever the project produces something
  installable (a packaged executable, an installer), how to install and
  where its data/config lives.
- **`docs/USER_GUIDE.md`** — how to actually use it, workflow by workflow.

**When creating a new project**, copy this file's content into that
project's own `docs/BUSINESS_RULES.md` at creation — an actual copy, so
the project is readable standalone. Note at the top of the project's copy
that it mirrors this file, so a later update here can be reconciled
against it.

**Before editing this file, or a project's own `BUSINESS_RULES.md`**,
check whether the change conflicts with an existing rule already written
down. If it does, say so explicitly and flag the conflict before making
the change — never silently overwrite a standing rule because a new
instruction seems to contradict it.

---

# Mirrored from GENERAL_BUSINESS_RULES.md

## Asking Walter to act

When work is blocked on something only Walter can do (create a repo, send
an email, approve a name, test an exe, give an answer), say it plainly as
its own first line — **"Walter, I need you to …"** — followed by the exact
steps, kept separate from any status summary, and state that the work is
waiting on Walter. Never bury a request inside a progress update. Added
2026-09-28 after a buried request looked like a stall.

---

# STRUCTURA — project-specific rules

Source of authority: [the specification v1.3](STRUCTURA_Documentation_Package/STRUCTURA_Implementation_Specification.md).
If a rule here and the specification disagree, the specification wins and
the conflict is flagged to Walter.

## Decision precedence (spec 1.1)

Latest explicit clarification from Walter → latest relevant project
document/workbook → earlier explicit decisions still in force → the
specification's own conventional (C) and design (D) defaults. Old platform
proposals (Odoo, WordPress, Excel macros) don't set the architecture.

## Locked product rules (spec 2.2, 3, 21.1)

- Movement ≠ Trip. A location update is a complete movement. A trip is optional.
- Map ≠ inventory hierarchy. Event points and routes never require a location tree.
- Quote ≠ draft invoice. Invoices are independent. They may copy, change, add or drop quote lines, with traceability.
- Approval ≠ payment. Accepted quote, approved operation and paid invoice are different facts.
- Tenant invoices ≠ STRUCTURA subscription billing.
- Local storage ≠ unlicensed access. The local engine and full data transfer need an active license. Basic inventory/tracking CSV and printing stay available.
- Operational finance ≠ accounting. No general ledger, bank reconciliation, payroll or statutory reporting.
- Events, quotes and invoices can exist without a final customer or final event name.
- Delivery proof: confirmation, photo and signature are separate, configurable requirements. One valid photo satisfies a photo requirement. Nothing defaults to "all required".
- Attachments belong to their parent record, and the parent's permissions govern access.
- Scanning is optional. Normal on-screen entry and search always work.

## Data integrity rules

- Posted movements, approvals and payments are never edited or deleted. Corrections are new, linked records.
- Stock totals come from posted movements, never from a free-form edit.
- Rental reservations include both the departure day and the expected-return day.
- Returns are split into usable / consumed / sent to repair. Repair-to-stock is an explicit movement.
- Every change command carries an idempotency key. A retry never doubles stock, payment or usage.
- Money and quantities use decimal arithmetic, never binary floating point.
- Barcodes and legacy IDs are stored as text. Leading zeros are preserved and codes are never regenerated.
- Imports never run workbook macros. Reimporting the same file never duplicates products. Name alone never identifies a product.
- Tenant isolation and permission checks apply to every command, query, file download, job and sync replay.

## Gaps — never fill with guesses (spec 21.2)

G-01 to G-10 stay open until Walter or a recovered source closes them. In
particular: the meaning of answers 32 and 36, the original context of
answer 33, and pricing, grace periods, retention, tax and rounding values.
Build these as configurable settings and never present them as agreed
policy.