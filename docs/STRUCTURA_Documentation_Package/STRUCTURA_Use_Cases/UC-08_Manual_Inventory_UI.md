# UC-08 — Normal UI operation without scanning

**Version:** 1.2 · 29 September 2026  
**Basis:** Source interpretation, S2/37  
**Requirements:** INV-01 MOV-01  
**Master sections:** 2.3, 3, 7, 9.2, 16.3  
**Acceptance references:** AT-02 AT-36

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Search/select/update available; no mandatory barcode architecture.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Inventory user with the capability for the selected operation; viewing alone grants no posting rights.

**Trigger:** A staff member searches, creates or updates inventory without a scanner.

## Preconditions and input

An authenticated interface is reachable. Scanning is optional unless an existing explicit tenant control applies to the particular operation.

**Input:** Search terms or selected stable record ID; edited catalog fields or movement parameters.

## Main workflow

1. Search/filter the inventory through ordinary UI controls.
2. Select the intended stable record and review details rather than relying on name alone.
3. Enter metadata edits or choose a stock-changing action.
4. Send metadata through catalog validation; route stock changes through the movement command.
5. Show saved state and retain user input after recoverable validation errors.

## Text flow

```text
Search inventory manually
  |
  v
Select stable record ID
  |
  v
Edit metadata OR choose movement
  |
  v
Validate through owning service
  |
  v
Show saved state; no scanner needed
```

## Data changes and postconditions

Catalog edits change permitted metadata. Quantity/location changes invoke UC-03; they never directly overwrite derived stock totals. Existing barcode text remains unchanged unless explicitly edited through authorized validation.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Duplicate names require disambiguation using reference/category or ID. Missing scanner hardware is not an error. Permission or data validation failures identify the affected action and keep the form usable.

## Local engine and synchronization

Normal UI is served by the local server when reachable and entitled. No standalone offline-browser database is assumed.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-02 | Available inventory at A; user posts A→B with no Trip | Correct balances/location and audit created; no Trip required |
| AT-36 | Legacy code begins with zero and category changes later | Barcode preserved as text; no automatic recoding; invalid/duplicate codes flagged for review |

Case-specific verification:

- Complete a location update entirely through search/select controls.
- Change a category and verify no automatic regeneration of an existing barcode.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-12 — Product photo disappears or wrong product reloads](<UC-12_Product_Photo_Reload.md>)
- [UC-13 — No visible way to create an Event](<UC-13_Create_Event.md>)
- [UC-24 — Import pop-up dismissed and identical file rerun](<UC-24_Reliable_Inventory_Import.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
