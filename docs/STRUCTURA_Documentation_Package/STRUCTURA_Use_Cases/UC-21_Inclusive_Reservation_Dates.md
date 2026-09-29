# UC-21 — Inclusive return-day reservation

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, latest local guide  
**Requirements:** INV-01 REP-01  
**Master sections:** 6.5, 9.1, 17  
**Acceptance references:** AT-04 AT-31

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Return day stays reserved; following-day availability still respects actual outstanding stock.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Operations user with reservation.commit.

**Trigger:** An Event requests inventory over a rental date interval overlapping another Event’s expected return day.

## Preconditions and input

Departure and expected return are dates in the Event timezone. Usable inventory, existing reservations and actual outstanding stock are known within authority scope.

**Input:** Item/asset, quantity, departure date, expected-return date and Event timezone.

## Main workflow

1. Validate departure is not after expected return.
2. Normalize to departure-day start through day-after-return start in the Event timezone.
3. Check every overlapping interval against committed quantities without double counting stock already dispatched from the same reservation.
4. Reject excess commitment with the relevant conflict, or commit the reservation atomically.
5. Show the inclusive interval on the calendar; actual late returns continue to constrain usable stock.

## Text flow

```text
Departure and expected-return dates
  |
  v
Normalize inclusive local-day interval
  |
  v
Evaluate overlapping commitments and actual stock
  |
  v
Commit OR report conflict
  |
  v
Expected date alone never creates receipt
```

## Data changes and postconditions

Reservation and availability/calendar projections change; no physical movement occurs merely from reservation.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Expected return does not automatically post a receipt. Date-only arithmetic must use local calendar-day boundaries rather than fixed 24-hour assumptions across timezone transitions. Invalid/stale availability causes no final commitment.

## Local engine and synchronization

Commit only within delegated availability authority. Display stale/provisional information outside that scope; UC-15 handles competition.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-04 | Overlapping reservation exhausts availability; another commitment attempted | Conflict reported; no silent excess final commitment under baseline policy |
| AT-31 | Rental returns on day 14; overlapping request starts day 14 vs day 15 | Day 14 remains committed; day 15 may be available if stock is actually returned/usable |

Case-specific verification:

- A quantity returning on day 14 conflicts with another reservation beginning day 14; day 15 is eligible only when usable stock permits.
- Cross a timezone offset change and verify both endpoint dates retain their intended local-day meaning.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-13 — No visible way to create an Event](<UC-13_Create_Event.md>)
- [UC-15 — Two disconnected engines reserve the same asset](<UC-15_Competing_Inventory_Commitment.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[September 2026 operating guide](<../STRUCTURA_References/Local_Files/S7a_README_27TS_Inventario.md>). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
