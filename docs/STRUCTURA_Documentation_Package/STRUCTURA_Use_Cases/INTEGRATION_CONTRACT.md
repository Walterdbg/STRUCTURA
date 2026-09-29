# STRUCTURA use-case integration contract

**Version:** 1.2 · 29 September 2026  
**Scope:** UC-01–UC-25, the Section 10 document set.

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>)

## Authority and composition

The master specification owns business requirements and global policies. This contract owns shared interaction guarantees; individual use-case documents elaborate their named scenarios. A use-case example cannot override a locked requirement, introduce a compulsory Trip, require a final customer, or turn payment into approval. The source/derived classification in each document is preserved. Gaps in answers 32/33/36 remain gaps rather than fabricated policies.

Implement each business operation once in its owning domain service. UI, local server, imports, portal and integrations invoke that same service. Related use cases are composable actions, not mandatory steps unless the configured policy actually requires them.

## Shared command protocol

Commands use tenant and actor derived from authentication, globally unique command ID, aggregate ID, expected version, payload schema version, occurrence time and deployment identity. Protected local commands also carry validated entitlement and authority references. Same ID plus same payload returns the stored result; same ID plus different payload fails. UI navigation, grouping and viewing have no hidden mutation effects.

Persist domain mutations, audit and durable outbox atomically. An acknowledgment identifies the record/version and distinguishes saved locally, cloud acknowledged, pending, conflict and rejected. An interrupted request cannot be interpreted as proof of failure or success without retrieving its command result. Retain user input on recoverable errors.

## Domain ownership and side effects

| Owner | Authoritative change | Consumers / prohibition |
|---|---|---|
| Inventory | Posted movements and reservation commitments | Stock reports are projections; Trips, files, invoices and status edits cannot directly change balances |
| Delivery | Actual received quantities and evidence completeness | Physical quantities, proof and remote file availability remain separate |
| Commercial | Quote revisions/acceptance, independent invoices, payments/reversals | Approval is revision-specific; payment does not move stock or approve quotes |
| Attachment service | Durable content/reference and parent-scoped metadata | Parent grants apply to previews, downloads, portal and exports |
| Maps | Event geometry and preferred paths | Geometry editing never posts inventory movements |
| Local/sync | Durable replication and authority status | No last-write-wins for movements, payments or acceptance |
| Platform | Entitlement and measured capacity | Tenant invoice balances are not subscription balances |

## Inventory quantity contract

For each Event inventory line, retain planned quantity separately from cumulative actual dispatch. Physical outstanding quantity is dispatched quantity minus reconciled usable, consumed and repair-return allocations. All allocations are bounded by actual outstanding stock. Reserved-but-undispatched remainder is a different quantity; it must be explicitly fulfilled or released, not mislabeled as an unreturned unit.

Warehouse usable return increases available stock; consumption reduces owned stock; repair remains owned but unavailable. Repair-to-stock restores availability once. Expected return dates never manufacture receipts. Reservations include departure and expected-return dates; normalize to local departure-day start and the day-after-return start. Availability must avoid double-counting a dispatched reservation and its associated movement.

The explicit posting command may update fulfillment projections atomically. A free-form status edit cannot post stock. After dispatch, cancellation is not a substitute for return/correction. Rental fulfillment closes only when actual dispatched stock is reconciled and any unused plan/reservation remainder is resolved. Overall Event service/commercial closure remains distinct.

## Permissions and publication

Every entry point checks tenant, record scope, action capability and entitlement. Role names are presets, not bypasses. The master’s example capability list is not exhaustive: managing invoice drafts, Trips or count sessions still requires explicit domain permission. A view grant does not imply export or mutation.

Customer assignment does not publish internal records. Portal access requires explicit customer-facing sharing and action scope, including linked files and aggregate totals. Internal quotes remain private even when an Event later acquires a customer.

## Offline and license boundary

Only a reachable local server with valid entitlement/grants and resource authority can acknowledge a local operational commit. Browser-only offline persistence is not promised. Non-authoritative engines retain proposals or reject final commitments. Cloud acceptance deduplicates commands and validates authority/version; rejection never destroys the local factual history.

Expiry preserves commands and files, blocks new protected operations under policy, permits authorized basic inventory/tracking CSV/print and denies full transfer. Reconciliation during restriction is only whatever the explicitly configured license policy allows; there is no implicit full-export or perpetual-grace exception. After renewal, replay original command IDs. File and business-record acknowledgments remain distinct.

## Evidence, failures and observability

Confirmation, photo and signature are independent evidence types. One valid photo satisfies a photo requirement; a user check cannot replace an explicitly required signature. Record effective policy version and target revision. Pending remote upload does not imply the photo is remotely available. Managed/external storage and capacity values remain distinguishable.

Expose validation, permission, entitlement, version, availability, proof, provider and sync failures distinctly. Audit actor, action, revision, times, deployment and command correlation without secrets. Background jobs preserve state independently of a modal. Partial batches and cancellations report committed scope explicitly.

## Cross-document journeys

| Journey | Composition | Integration invariant |
|---|---|---|
| Internal planning to billing | UC-13 → UC-01 → UC-16 when needed → UC-02 → UC-19 | Quote remains independent; approval and payment stay separate |
| Dispatch to return | UC-21 → UC-25 → UC-03/UC-18 → UC-22/UC-23 | Plan, actual dispatch, outstanding and repair quantities are distinct |
| Transport and proof | UC-04 with UC-05 → UC-06/UC-07 using UC-09 | Trip optional; map/evidence cannot double-post stock |
| Local continuity | UC-03 → UC-14 with UC-15; UC-20 if entitlement expires | One authoritative committed effect, durable retry, no silent history loss |
| Files and portal | UC-09/UC-10/UC-12 with UC-17 | Parent visibility and provider access both enforced |
| Migration and count intake | UC-24 → UC-08 or UC-25 | Stable source IDs; catalog update is not stock receipt |

## Change control and verification

Keep UC/AT/requirement IDs stable. Update the master, affected cases and this contract together when a shared invariant changes. The case index provides requirement and acceptance mapping. Case-specific checks supplement the master’s AT suite and are not falsely presented as historical business decisions. Test source cases and derived cases through the same service/API and local paths where applicable.
