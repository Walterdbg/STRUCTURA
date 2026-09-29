# UC-18 — Partial delivery and partial return

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** INV-01 MOV-02 EVD-01  
**Master sections:** 6.4–6.5, 8.1, 9.3, 9.5  
**Acceptance references:** AT-29 AT-32

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Quantities conserved; unfinished remainder remains visible.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Authorized dispatcher/receiver; movement.post and delivery.confirm apply to their respective commands.

**Trigger:** Only part of a planned quantity is delivered or returned.

## Preconditions and input

Event inventory line, reservation and actual posted outbound references are distinguishable. Quantities returned cannot exceed actual outstanding dispatched quantity.

**Input:** Planned quantity, actual dispatched/received quantities, outbound line reference and return outcome quantities.

## Main workflow

1. Post only actual outbound quantities; keep any undelivered plan remainder separate.
2. Record delivery received quantities and proof completeness separately.
3. On return, allocate actual outstanding stock across usable, consumed and repair outcomes.
4. Post those outcome movements atomically and recompute outstanding quantities.
5. Keep partial fulfillment visible; close rental fulfillment only after all dispatched units are reconciled and remaining plan/reservation lines are explicitly fulfilled or released.

## Text flow

```text
Plan quantity
  |
  v
Post actual dispatch only
  |
  v
Keep undelivered plan remainder separate
  |
  v
Reconcile dispatched stock by outcome
  |
  v
Close only after stock and plan remainder resolved
```

## Data changes and postconditions

Movements and ReturnAllocations change stock/condition projections. Reserved-but-undispatched quantities are not mistaken for physically outstanding returns. Payment status remains independent.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Reject over-return or outcome sums exceeding outstanding stock. Cancellation after dispatch is rejected; use reconciliation/correction. A missing photo does not erase actual posted delivery quantities.

## Local engine and synchronization

Outcome commands require the same local stock authority and durable outbox as movement commands. Conflicting returns cannot be summed without validation.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-29 | Partial return followed by attempted Event cancellation | Cancellation rejected after dispatch; only usable returned quantities available; outstanding stock history retained |
| AT-32 | Ten units outstanding; return 6 usable, 2 consumed, 1 repair | One remains outstanding; six usable, one in repair, two removed from owned total; duplicate request changes nothing |

Case-specific verification:

- Plan 10, dispatch 6 and return 4 usable: 2 are physically outstanding, while 4 remain a separate undelivered plan remainder.
- Retry a return command and verify no second receipt.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-21 — Inclusive return-day reservation](<UC-21_Inclusive_Reservation_Dates.md>)
- [UC-22 — Consumable partly returned, partly used](<UC-22_Consumable_Return_Allocation.md>)
- [UC-23 — Equipment returned damaged, later repaired](<UC-23_Repair_And_Return_To_Stock.md>)
- [UC-25 — Door count differs from planned dispatch](<UC-25_Dispatch_Count_Reconciliation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
