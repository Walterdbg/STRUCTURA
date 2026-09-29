# UC-23 — Equipment returned damaged, later repaired

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, guide/SOP  
**Requirements:** INV-01 MOV-02  
**Master sections:** 6.4–6.5, 9.5  
**Acceptance references:** AT-32 AT-33

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Repair excluded from availability; explicit repair-return restores stock.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Inventory user authorized to post movement into/from repair; this does not imply a full maintenance-management module.

**Trigger:** Returned equipment is unusable, then later becomes usable or is written off.

## Preconditions and input

Affected quantity/asset is present at the Event or repair source and belongs to the same tenant.

**Input:** Item/asset and quantity; source/outcome; repair location/status, occurrence time and note; prior movement reference.

## Main workflow

1. Classify damaged returned quantity as repair during return processing.
2. Post Event-to-repair movement; retain ownership but exclude it from rental availability.
3. Keep the repair stock visible separately from available warehouse stock.
4. When usable again, post an explicit repair-to-stock movement.
5. If instead written off, post explicit write-off-from-repair and preserve the reason/history.

## Text flow

```text
Damaged stock returns
  |
  v
Post to repair; exclude availability
  |
  v
Record repair completion or write-off decision
  |
  v
Post repair-to-stock OR write-off
  |
  v
Restore availability OR reduce owned stock once
```

## Data changes and postconditions

Location/condition and stock projections change; repair does not itself reduce owned total, write-off does. Rental return reconciliation can finish even while equipment remains under repair.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Reject repair return exceeding actual repair stock. A metadata condition edit alone must not fabricate a repair-to-stock movement. Duplicate command cannot make a unit available twice.

## Local engine and synchronization

Repair movements follow the same authority and durability model as other stock changes; no separate bypass for maintenance locations.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-32 | Ten units outstanding; return 6 usable, 2 consumed, 1 repair | One remains outstanding; six usable, one in repair, two removed from owned total; duplicate request changes nothing |
| AT-33 | Repair unit is returned to stock | Availability increases once with explicit repair-return movement and history |

Case-specific verification:

- Return one damaged unit to repair and verify it cannot satisfy availability.
- Post repair-to-stock twice using the same ID and verify a single restored usable unit.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)
- [UC-22 — Consumable partly returned, partly used](<UC-22_Consumable_Return_Allocation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[September 2026 operating guide](<../STRUCTURA_References/Local_Files/S7a_README_27TS_Inventario.md>). [SOP v0.2](<../STRUCTURA_References/Local_Files/S7c_PROCEDIMIENTO OPERATIVO ESTÁNDARv0.2.docx>). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
