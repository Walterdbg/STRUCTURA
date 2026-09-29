# UC-24 — Import pop-up dismissed and identical file rerun

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, SQA report  
**Requirements:** IO-01 INV-01 AUD-01  
**Master sections:** 9.7, 16.1–16.3  
**Acceptance references:** AT-25 AT-34 AT-35 AT-36

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

No silent interruption or duplicate records; persistent job and explicit result.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Authorized import user with the underlying catalog or movement permissions for the selected import intent.

**Trigger:** A file is imported, its progress dialog is dismissed, or the file is submitted again.

## Preconditions and input

Supported source schema and mapping are selected. Catalog update, balance migration and stock-addition intents are explicit and distinct.

**Input:** File/job identity, source system/keys, field map, intended operation, duplicate policy and transactional batch scope.

## Main workflow

1. Upload and parse without executing macros; ignore blank/formula-only rows as records.
2. Preview validated rows, duplicates, unit/reference errors and source-key mapping.
3. Start a durable import job independent of the dialog lifecycle.
4. Commit visible transactional batches through the normal domain services, retaining row results and IDs.
5. On reimport, update mapped catalog metadata or deduplicate referenced stock transactions according to intent; show final counts and recoverable errors.

## Text flow

```text
Choose import intent and source keys
  |
  v
Preview validation and duplicates
  |
  v
Run durable job independent of dialog
  |
  v
Commit visible transactional batches
  |
  v
Reimport by stable keys without duplicate stock
```

## Data changes and postconditions

ImportJob, source-ID mappings, row results and appropriate catalog/movement/audit records. Closing the dialog is no domain command. Snapshot quantities are never silently added twice.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Never match only by name, regenerate barcodes from row number, or report random partial success. Explicit cancellation identifies already committed batches and remaining rows. Missing photos are warnings; unsafe content is rejected.

## Local engine and synchronization

Local import is allowed only for locally supported schema/grants/authority. Job status survives local restart; sync preserves source transaction IDs and cannot replay stock additions twice.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-25 | Import contains duplicates, invalid units and missing references | Preview/row errors; defined commit scope; rerun does not duplicate records |
| AT-34 | Operator dismisses import dialog during processing | Durable job continues or explicit cancellation occurs; no silent random partial success |
| AT-35 | Same inventory file imported twice; name is shared by distinct products | Stable source keys prevent duplicates; names alone never merge distinct items; stock additions are explicit separate movements |
| AT-36 | Legacy code begins with zero and category changes later | Barcode preserved as text; no automatic recoding; invalid/duplicate codes flagged for review |

Case-specific verification:

- Dismiss the progress dialog and reopen status: the job continues or has an explicit result, never silent interruption.
- Import identical file twice and verify stable product count; two distinct products sharing a name remain distinct.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>)
- [UC-12 — Product photo disappears or wrong product reloads](<UC-12_Product_Photo_Reload.md>)
- [UC-25 — Door count differs from planned dispatch](<UC-25_Dispatch_Count_Reconciliation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Inventory import QA report](<../STRUCTURA_References/Local_Files/S7d_Reporte SQA_Interface de carga de inventario.docx>). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
