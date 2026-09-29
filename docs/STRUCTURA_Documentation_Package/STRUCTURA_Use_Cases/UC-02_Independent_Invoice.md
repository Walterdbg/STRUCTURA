# UC-02 — Quote contains only part of eventual event bill

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2  
**Requirements:** COM-01 COM-03 COM-05  
**Master sections:** 3.2, 6, 8.3, 9.4  
**Acceptance references:** AT-14 AT-16

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Invoice adds/removes/consolidates lines; quote history stays intact.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Commercial user with invoice management rights; invoice.issue is required to issue.

**Trigger:** Actual event billing includes a different scope from the quote.

## Preconditions and input

A quote may exist but is not required. The invoice has its own identity and currency. Internal/draft creation does not require finalized customer naming.

**Input:** Optional source quote revision and selected lines; new invoice designation, audience, customer/Event if known; quantities, rates, discounts and taxes.

## Main workflow

1. Create a separate invoice draft, optionally selecting an existing quote revision.
2. Copy only relevant lines and record their source revision/line links.
3. Add, remove or consolidate invoice lines for actual billing; recompute totals using the declared rounding policy.
4. Review invoice content and issue only with appropriate permission and applicable deployment validation.
5. Expose invoice settlement independently of quote acceptance and operational completion.

## Text flow

```text
Optional selected quote lines
  |
  v
Independent invoice draft
  |
  v
Add/remove/consolidate billing lines
  |
  v
Validate and issue
  |
  v
Separate payment tracking
```

## Data changes and postconditions

Create Invoice, InvoiceLine and optional CommercialSourceLink. Quote/QuoteLine/Approval snapshots stay unchanged. No movement or payment is posted by copying or issuing.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A stale source revision requires explicit refresh/selection, not silent copying of different content. Mixed currencies cannot be silently combined. Validation errors retain the draft. Unsupported issuance rules are reported explicitly.

## Local engine and synchronization

Local drafts follow entitlement/grants. Issuance is allowed only if the deployed local engine supports the required issuance policy and authority; otherwise keep the draft and explain the pending action.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-14 | Invoice copies some quote lines and adds others | Independent totals/content; source links retained; quote unchanged |
| AT-16 | Decimal quantities, discounts and taxes with declared rounding | Deterministic totals across local/cloud/print; no floating-point drift |

Case-specific verification:

- Copy two of three quote lines, add a service line, and verify invoice totals and unchanged quote.
- Create an invoice without a quote and verify that no artificial quote is generated.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-01 — Internal departmental estimate without final customer](<UC-01_Internal_Quote.md>)
- [UC-16 — Acceptance followed by quote edit](<UC-16_Revise_Accepted_Quote.md>)
- [UC-19 — Payment entered twice due to retry](<UC-19_Payment_Retry.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
