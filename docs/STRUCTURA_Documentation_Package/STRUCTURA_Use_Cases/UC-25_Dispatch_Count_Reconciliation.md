# UC-25 — Door count differs from planned dispatch

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, SOP v0.2  
**Requirements:** INV-01 MOV-02 IO-01 AUD-01  
**Master sections:** 7, 9.8, 16  
**Acceptance references:** AT-02 AT-18 AT-25

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Discrepancy review before posting actual quantities; retain plan and captured facts.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Door/warehouse operator captures; a user with movement.post validates/posts. A tenant may grant both capabilities to one person.

**Trigger:** Actual loaded quantities differ from the planned dispatch.

## Preconditions and input

A plan and count session are identifiable. Capturing a count does not itself post stock. Manual entry remains supported under the latest decision.

**Input:** Count-session ID, direction, item/asset, captured quantities, operator/time, optional source file; plan references and discrepancy resolution.

## Main workflow

1. Open a capture session for the dispatch direction and reference plan.
2. Record actual counts manually, via supported repeated scans or count-file upload.
3. Compare actual with planned quantities and display shortages/excesses.
4. Authorized reviewer resolves discrepancies and validates actual quantities against stock/authority.
5. Post actual movement once, linking session and plan; keep undelivered plan remainder visible.

## Text flow

```text
Planned dispatch
  |
  v
Capture actual count; no stock effect
  |
  v
Review discrepancies
  |
  v
Validate actual stock and authority
  |
  v
Post once linked to count session and plan
```

## Data changes and postconditions

Count-session evidence and review state precede Movement creation. Only validated posting changes stock; plan, captured facts and reviewer decision remain traceable.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Repeated scans increment bulk counts but duplicate individual-asset scans are flagged. Reject wrong-tenant references and impossible quantities. Reimporting the same session cannot dispatch inventory again; count evidence may not bypass movement permissions.

## Local engine and synchronization

Capture may persist on the local engine within grants; final posting still needs delegated authority. Uploaded offline scanner files are data, never executable commands.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-02 | Available inventory at A; user posts A→B with no Trip | Correct balances/location and audit created; no Trip required |
| AT-18 | Approval, payment or permission changed | Actor, time, revision and change details present; audit mutation denied |
| AT-25 | Import contains duplicates, invalid units and missing references | Preview/row errors; defined commit scope; rerun does not duplicate records |

Case-specific verification:

- Plan 10 and capture 8: before review stock is unchanged; posting moves 8 and preserves a planned remainder of 2.
- Upload the same count session again and verify no duplicate movement.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)
- [UC-24 — Import pop-up dismissed and identical file rerun](<UC-24_Reliable_Inventory_Import.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[SOP v0.2](<../STRUCTURA_References/Local_Files/S7c_PROCEDIMIENTO OPERATIVO ESTÁNDARv0.2.docx>). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
