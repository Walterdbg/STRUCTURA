# UC-04 — Transport is worth documenting

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/31  
**Requirements:** TRP-01 MOV-01  
**Master sections:** 2.2, 6.2, 8.1, 9.3  
**Acceptance references:** AT-06 AT-02

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Optional Trip groups operations without changing movement fundamentals.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Operations manager permitted to manage Trips; movement.post remains separately required for stock changes.

**Trigger:** Physical transport is useful to organize and record.

## Preconditions and input

Trip creation is optional; deliveries/movements belong to the same tenant. A movement has at most one optional Trip in the baseline.

**Input:** Trip designation, schedule, notes and optional route; selected movement/delivery references.

## Main workflow

1. Create the transport Trip without making it a prerequisite for other movements.
2. Associate relevant operations, validating tenant and existing Trip association.
3. Optionally select the Event route or POIs and applicable evidence settings.
4. Record individual dispatch/delivery outcomes through their own commands.
5. Complete the Trip while preserving each operation’s partial, complete or failed outcome.

## Text flow

```text
Transport grouping useful
  |
  v
Create optional Trip
  |
  v
Link existing/planned operations
  |
  v
Record each actual outcome
  |
  v
Complete Trip without reposting stock
```

## Data changes and postconditions

Trip metadata and nullable Movement.trip_id associations change. Linking or completing a Trip does not itself change stock, invoice status or delivery proof completeness.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Reject a cross-tenant link and conflicting existing Trip assignment. Cancelling a planned Trip does not reverse posted movements; use explicit movement corrections if physical facts need correction.

## Local engine and synchronization

Trip metadata uses optimistic concurrency. Stock operations still require delegated authority; an offline Trip cannot authorize a competing inventory writer.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-06 | Existing movements grouped into Trip and Trip completed | No duplicate stock mutation; individual delivery outcomes preserved |
| AT-02 | Available inventory at A; user posts A→B with no Trip | Correct balances/location and audit created; no Trip required |

Case-specific verification:

- Group already posted movements and verify balances do not change.
- Complete a Trip containing a partial delivery; the delivery remains partial.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-05 — “tarima uno” and mobile toilets on an event map](<UC-05_Event_Map.md>)
- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
