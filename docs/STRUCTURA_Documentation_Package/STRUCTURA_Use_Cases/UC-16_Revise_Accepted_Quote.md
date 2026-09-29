# UC-16 — Acceptance followed by quote edit

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** COM-02 AUD-01  
**Master sections:** 6.2, 8.2, 14  
**Acceptance references:** AT-13 AT-18

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

New revision; original acceptance never implicitly covers changed content.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** User with quote.manage; acceptance of the new revision requires quote.approve or enabled authenticated customer acceptance.

**Trigger:** Prices, quantities or scope need changing after a quote was accepted.

## Preconditions and input

An accepted immutable quote revision and its Approval exist. Any operation authorized from it records that revision.

**Input:** Original quote/revision, changed line content, expected version and new revision command ID.

## Main workflow

1. Open the accepted quote and choose revision rather than modifying its accepted snapshot.
2. Create a new draft revision with proposed changes and recomputed totals.
3. Preserve the earlier quote content and acceptance evidence.
4. Display the new revision as requiring its own acceptance when policy requires approval.
5. Re-evaluate future operational authorization against the exact revision selected; never rewrite the basis of past movements.

## Text flow

```text
Accepted quote needs change
  |
  v
Create new draft revision
  |
  v
Preserve old content + approval
  |
  v
Accept new revision if required
  |
  v
Future operations reference exact approved revision
```

## Data changes and postconditions

New Quote revision/lines and audit. Earlier Approval stays attached to earlier revision. Invoices and stock transactions remain unchanged unless separate authorized commands occur.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Stale edits produce a version conflict. Replaying approval of the old revision cannot approve the new one. Portal acceptance must name the exact shared revision, not whatever is currently latest.

## Local engine and synchronization

Local revisions use unique IDs and optimistic concurrency; sync conflicts are explicit. No last-write-wins merging of accepted commercial content.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-13 | Accepted quote changed | New revision created; old acceptance preserved and not applied silently to new content |
| AT-18 | Approval, payment or permission changed | Actor, time, revision and change details present; audit mutation denied |

Case-specific verification:

- Accept quantity 10, revise to 12 and verify original approval still identifies 10.
- Attempt acceptance with a stale revision and verify no silent approval of the replacement.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-01 — Internal departmental estimate without final customer](<UC-01_Internal_Quote.md>)
- [UC-02 — Quote contains only part of eventual event bill](<UC-02_Independent_Invoice.md>)
- [UC-17 — Customer follows another customer's URL](<UC-17_Portal_Access_Isolation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
