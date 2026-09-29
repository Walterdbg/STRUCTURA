# UC-01 — Internal departmental estimate without final customer

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2 quote clarification  
**Requirements:** COM-01 COM-02 EVT-01  
**Master sections:** 3.2, 6, 8.2, 9.4, 14  
**Acceptance references:** AT-12 AT-13 AT-17

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Owner/designation sufficient; no compulsory recipient or invoice conversion.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Commercial user or operations user with quote.manage; an approver additionally needs quote.approve.

**Trigger:** A department needs a partial estimate before a final customer or Event name exists.

## Preconditions and input

A tenant membership and active entitlement exist. Responsible user and a provisional designation are available; customer and final Event name are not prerequisites.

**Input:** Responsible user; designation such as Internal Quote; optional department/Event; internal audience; currency and the currently known item/service lines.

## Main workflow

1. Create a quote with internal audience and responsible user; leave customer empty when unknown.
2. Add known inventory or service lines, quantities and monetary values; validate decimals, currency and required line fields.
3. Save the draft revision. The interface identifies it as internal and does not publish it to the portal.
4. If operational approval is needed, an authorized approver records internal approval against the exact revision.
5. An Event may reference this accepted revision when evaluating its configured authorization policy; reservation and movement remain separate commands.

## Text flow

```text
Owner + provisional designation
  |
  v
Internal quote draft
  |
  v
Optional revision-specific approval
  |
  v
Separate Event authorization check
  |
  v
No automatic invoice or portal publication
```

## Data changes and postconditions

Create Quote, QuoteLine and, when approved, Approval records. Do not create Invoice, PaymentRecord, Reservation or Movement as a side effect of saving the quote.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A missing customer is valid. Missing owner/designation or invalid line values produce field errors without losing the draft. Missing approval authority blocks acceptance, not draft creation. Editing approved content follows UC-16.

## Local engine and synchronization

Create/revise only within valid local grants and entitlement; show saved-locally status until synchronized. Portal access remains excluded before and after sync.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-12 | Internal Quote under user, no customer, partial lines | Saved/approved internally; not auto-shared; final invoice not required |
| AT-13 | Accepted quote changed | New revision created; old acceptance preserved and not applied silently to new content |
| AT-17 | Portal user guesses internal/other-customer record and file IDs | Reads/actions/exports denied; hidden totals not disclosed |

Case-specific verification:

- Save a quote without customer, then reload it and verify owner, designation and lines.
- Attempt a portal lookup of the internal quote and its attachments; access is denied.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-02 — Quote contains only part of eventual event bill](<UC-02_Independent_Invoice.md>)
- [UC-13 — No visible way to create an Event](<UC-13_Create_Event.md>)
- [UC-16 — Acceptance followed by quote edit](<UC-16_Revise_Accepted_Quote.md>)
- [UC-17 — Customer follows another customer's URL](<UC-17_Portal_Access_Isolation.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
