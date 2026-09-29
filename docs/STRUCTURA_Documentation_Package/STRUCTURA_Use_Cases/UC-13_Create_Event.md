# UC-13 — No visible way to create an Event

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S3  
**Requirements:** EVT-01 INV-01  
**Master sections:** 2.1–2.3, 6.4, 8.1, 9.1  
**Acceptance references:** AT-01

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Direct Event creation is available to permitted staff.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Staff user with event.manage in the tenant scope.

**Trigger:** A user begins planning an internal or customer-facing Event.

## Preconditions and input

The user has valid access and entitlement. Final customer identity and final name may be unknown.

**Input:** Provisional designation and responsible user; optional customer/department; Event date, departure/expected-return dates when relevant, timezone, location and notes.

## Main workflow

1. Provide a visible Create Event action in the Event interface.
2. Accept a provisional designation and owner without forcing a final customer.
3. Validate supplied dates and preserve separate Event, departure and return fields.
4. Persist a draft Event with stable ID.
5. Open the Event workspace for inventory, services, quotes and map planning through separately authorized actions.

## Text flow

```text
Create Event action
  |
  v
Provisional designation + owner
  |
  v
Validate separate dates/timezone
  |
  v
Save draft with stable ID
  |
  v
Plan inventory/services without forced customer
```

## Data changes and postconditions

Event and audit/outbox are created. Saving a draft alone commits no inventory, creates no Trip and issues no invoice.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Invalid date ranges identify their fields; missing final customer is not a validation failure. Failed persistence leaves the form recoverable. Repeated submission under one command ID returns the same Event.

## Local engine and synchronization

Local creation is supported within valid grants/entitlement using globally unique IDs. Show saved-locally until cloud acknowledgment.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-01 | No final Event/customer name; authorized user creates Event | Stable Event saved with provisional designation/owner; customer remains optional |

Case-specific verification:

- Create and reload an internal Event with no final customer.
- Verify event date, departure and expected return are not collapsed into one date.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-01 — Internal departmental estimate without final customer](<UC-01_Internal_Quote.md>)
- [UC-05 — “tarima uno” and mobile toilets on an event map](<UC-05_Event_Map.md>)
- [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>)
- [UC-21 — Inclusive return-day reservation](<UC-21_Inclusive_Reservation_Dates.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Inventory prototype discussion](https://chatgpt.com/c/6aa1a499-2740-83e8-bcfd-49f5ae27287c). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
