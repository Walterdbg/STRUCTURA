# UC-19 — Payment entered twice due to retry

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** COM-04 AUD-01  
**Master sections:** 6.2, 8.3, 18.1  
**Acceptance references:** AT-15 AT-16 AT-18

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

One payment, one balance change; original result returned.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Commercial user with payment.record for the invoice.

**Trigger:** A payment command is retried after a timeout or repeated submission.

## Preconditions and input

Invoice balance and currency are known; manual settlement recording is authorized. This is not a bank reconciliation operation.

**Input:** Invoice ID/version, payment amount/currency, occurrence time, optional reference and stable command ID.

## Main workflow

1. Validate permission, amount, currency and current outstanding balance.
2. Record PaymentRecord and audit/outbox in one transaction.
3. Recalculate recorded paid and outstanding from valid payments/reversals.
4. On identical command retry, return the stored result without a second payment.
5. Use a linked reversal for an authorized correction instead of deleting the record.

## Text flow

```text
Payment command received
  |
  v
Validate amount + invoice + grant
  |
  v
Commit once under command ID
  |
  v
Retry returns original result
  |
  v
Recompute balance from payments/reversals
```

## Data changes and postconditions

One PaymentRecord per accepted command and one balance effect. Quote approval, Event state and stock are not altered by settlement.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Same command ID with different payload is rejected. Concurrency conflicts require refresh; unsupported overpayment returns validation. Do not deduplicate unrelated legitimate payments solely because their amounts match.

## Local engine and synchronization

Only an authoritative, entitled payment path may finally record settlement. A local draft/proposal cannot claim global payment finality when concurrent invoice changes remain unresolved; the same immutable/idempotent rules apply on sync.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-15 | Invoice 100; payment 40, retry same command, then 60 | Balance 60 after first/retry; zero after final; statuses partial then paid |
| AT-16 | Decimal quantities, discounts and taxes with declared rounding | Deterministic totals across local/cloud/print; no floating-point drift |
| AT-18 | Approval, payment or permission changed | Actor, time, revision and change details present; audit mutation denied |

Case-specific verification:

- For total 100, record 40, retry it, then record 60 with a new ID: paid totals 100 and outstanding zero.
- Repeat the original ID with amount 50 and verify conflict without a balance change.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-02 — Quote contains only part of eventual event bill](<UC-02_Independent_Invoice.md>)
- [UC-16 — Acceptance followed by quote edit](<UC-16_Revise_Accepted_Quote.md>)
- [UC-20 — License expires with pending local commands](<UC-20_License_Expiry_With_Pending_Sync.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
