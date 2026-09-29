# UC-03 — A normal inventory location change

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/31  
**Requirements:** INV-01 MOV-01 MOV-02  
**Master sections:** 6.5, 8.1, 9.2, 11  
**Acceptance references:** AT-02 AT-03 AT-28

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Post without Trip; history records source, destination and actor.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Inventory operator with movement.post in the affected scope.

**Trigger:** An item or asset needs its recorded physical location updated.

## Preconditions and input

Source/destination and item are tenant-scoped; stock is available; the current engine has valid authority and entitlement.

**Input:** Item or asset, positive quantity and unit, source, destination, occurred time; optional Event, Trip and note; command ID and expected version.

## Main workflow

1. Find the item manually or by optional scan and inspect its current position.
2. Enter destination and actual quantity; leave Trip empty for an ordinary location update.
3. Validate source position, permission, expected version and inventory authority.
4. Commit Movement and lines, source/destination balance effects, audit and outbox atomically.
5. Show resulting position and committed or saved-locally status.

## Text flow

```text
Select stock at A
  |
  v
Enter actual quantity and B; Trip optional
  |
  v
Validate grant + stock + authority
  |
  v
Post movement atomically
  |
  v
Show position and sync state
```

## Data changes and postconditions

One posted Movement and its MovementLines; corresponding StockPosition projections; audit/outbox. trip_id remains null when omitted. No quote, invoice or Trip is generated.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Insufficient stock, stale version or foreign-tenant destination rejects the command with no partial stock effect. A retry with the same command/payload returns the original result. A correction is a compensating movement, never deletion.

## Local engine and synchronization

Use UC-14 for loss of internet and UC-15 for delegated-authority conflicts. Do not falsely show cloud confirmation when only the local transaction committed.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-02 | Available inventory at A; user posts A→B with no Trip | Correct balances/location and audit created; no Trip required |
| AT-03 | Posted movement is wrong; authorized correction submitted | Original retained; linked compensation applied once; reason visible |
| AT-28 | Same IDs/references used across tenants | Foreign-key/authorization checks reject cross-tenant access and mutation |

Case-specific verification:

- Move an item from A to B with no Trip and confirm exact source/destination changes.
- Retry and verify one stock effect; correct it and verify linked history.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-04 — Transport is worth documenting](<UC-04_Optional_Trip.md>)
- [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>)
- [UC-14 — Internet fails during a movement](<UC-14_Offline_Movement.md>)
- [UC-15 — Two disconnected engines reserve the same asset](<UC-15_Competing_Inventory_Commitment.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)
- [UC-25 — Door count differs from planned dispatch](<UC-25_Dispatch_Count_Reconciliation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
