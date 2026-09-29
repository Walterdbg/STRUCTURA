# UC-09 — Attach a file to its operational record

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/38  
**Requirements:** ATT-01 SEC-01  
**Master sections:** 6.2, 13, 18  
**Acceptance references:** AT-05 AT-10 AT-17

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Parent-scoped attachment, no separate paper-document process.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** User with attachment.manage for the parent record and appropriate parent access.

**Trigger:** A staff member needs to attach supporting material to a business record.

## Preconditions and input

Parent record exists in the same tenant. Effective file limits, storage mode and visibility are known.

**Input:** Parent type/ID, file or external reference, filename/type, visibility and upload identity.

## Main workflow

1. Open the parent record and choose Attach.
2. Select managed upload or supported repository reference; preserve parent scope.
3. Validate permissions, content/type/size and configured capacity before final acceptance.
4. Persist attachment metadata and content/reference with an explicit availability state.
5. Allow authorized preview/download from the parent; report missing/failed content clearly.

## Text flow

```text
Open authorized parent record
  |
  v
Choose file or reference
  |
  v
Validate scope + content + capacity
  |
  v
Store attachment with explicit state
  |
  v
Authorize preview/download through parent
```

## Data changes and postconditions

Attachment record and audit change. File storage and measured managed bytes update only as appropriate. Attachment presence does not automatically approve or complete the parent workflow.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A failed upload never displays as available. Cross-tenant parent references and unauthorized downloads are denied. Replacing accepted evidence follows an append/version path rather than silent overwrite.

## Local engine and synchronization

Managed local files are durable before saved-locally acknowledgment; cloud availability is separate. External references may be stored offline only if authorized locally, with unresolved availability clearly shown.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-05 | Photo saved to item A; user loads item B then A | Correct photo reappears only on A; failed upload never reports complete |
| AT-10 | External large file linked; repository unavailable later | No mandatory managed copy; clear unavailable status, record and metadata preserved |
| AT-17 | Portal user guesses internal/other-customer record and file IDs | Reads/actions/exports denied; hidden totals not disclosed |

Case-specific verification:

- Attach to record A and verify it is neither exposed on unrelated record B nor accessible to unauthorized users.
- Retry an interrupted upload and verify one logical attachment/evidence association.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-10 — Large file stays in customer repository](<UC-10_External_Repository_File.md>)
- [UC-12 — Product photo disappears or wrong product reloads](<UC-12_Product_Photo_Reload.md>)
- [UC-17 — Customer follows another customer's URL](<UC-17_Portal_Access_Isolation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
