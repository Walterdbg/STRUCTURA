# UC-22 — Consumable partly returned, partly used

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, latest local guide  
**Requirements:** INV-01 MOV-02  
**Master sections:** 6.4–6.5, 9.5  
**Acceptance references:** AT-32 AT-29

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Usable portion returns; consumed portion reduces owned stock; remainder stays pending.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Receiving/inventory user with movement.post for the Event stock.

**Trigger:** A consumable returns partly unused and is partly consumed.

## Preconditions and input

Actual dispatched/outstanding quantity is known. Product type does not imply all units must be consumed or all returned.

**Input:** Outbound line, usable-return quantity, consumed quantity, optional repair allocation where meaningful, occurrence time and command ID.

## Main workflow

1. Display actual outstanding quantity for the line.
2. Enter outcome quantities; validate nonnegative values and sum no greater than outstanding.
3. Post usable return to warehouse and consumed quantity to the explicit consumption endpoint.
4. Retain any unreconciled remainder as physically outstanding.
5. Recompute owned, usable and pending totals; set partial/closed fulfillment under UC-18.

## Text flow

```text
Outstanding consumable quantity
  |
  v
Enter usable/consumed/repair allocations
  |
  v
Validate sum <= actual outstanding
  |
  v
Post outcome movements once
  |
  v
Keep unreconciled remainder visible
```

## Data changes and postconditions

ReturnAllocation and movements record each outcome. Consumption reduces owned inventory once; usable return changes location and availability. Original outbound movement remains intact.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Reject negative allocations or totals above outstanding. Never assume missing units are consumed simply to close an Event. Corrections use linked movements, not edits to totals.

## Local engine and synchronization

Use delegated stock authority, atomic local posting and idempotent sync. Offline consumption cannot be posted a second time during reconciliation.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-32 | Ten units outstanding; return 6 usable, 2 consumed, 1 repair | One remains outstanding; six usable, one in repair, two removed from owned total; duplicate request changes nothing |
| AT-29 | Partial return followed by attempted Event cancellation | Cancellation rejected after dispatch; only usable returned quantities available; outstanding stock history retained |

Case-specific verification:

- Ten outstanding: six usable, two consumed, one repair leaves one outstanding, with exactly two removed from owned total.
- A fully unused consumable can return all units without forced consumption.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)
- [UC-23 — Equipment returned damaged, later repaired](<UC-23_Repair_And_Return_To_Stock.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[September 2026 operating guide](<../STRUCTURA_References/Local_Files/S7a_README_27TS_Inventario.md>). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
