# Changelog — STRUCTURA

Every entry gets an **Intent** and a **Result**. A Result is only marked
confirmed once actually verified, and can honestly say FAILED.

No application version exists yet. Entries below are documentation-only
until the first build.

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
