# UC-17 — Customer follows another customer's URL

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** PRT-01 SEC-01 ATT-01  
**Master sections:** 7, 13–14, 18  
**Acceptance references:** AT-17 AT-28

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Denied, including attachments, exports and aggregate queries.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Authenticated customer portal user; sharing is managed by staff with portal.share.

**Trigger:** A portal request targets an internal record or another customer’s record/file.

## Preconditions and input

Portal membership and explicit share scope exist. Customer assignment alone does not publish an Event’s entire record graph.

**Input:** Authenticated identity, requested record/file/job ID and intended action.

## Main workflow

1. Resolve tenant and customer/record scope from authenticated identity, never from trusted client parameters alone.
2. Check explicit record sharing and allowed action before returning content.
3. Apply the same checks to linked attachments, reports, totals and export downloads.
4. Deny out-of-scope requests without leaking hidden content or aggregate values.
5. When a share is revoked, deny subsequent protected access and preserve sharing audit history.

## Text flow

```text
Portal requests record/file/job
  |
  v
Resolve authenticated tenant/customer
  |
  v
Check explicit share + action scope
  |
  v
Allow scoped content OR deny
  |
  v
Apply same boundary to totals and downloads
```

## Data changes and postconditions

No unauthorized business mutation or content disclosure. Authorized quote acceptance, if enabled, references exact shared revision and does not record payment.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A guessed ID, copied URL, cached job ID or different API route cannot bypass scope. Internal audience is never published merely by customer assignment. Direct storage links must not provide permanent unrestricted access.

## Local engine and synchronization

The baseline does not promise an offline customer portal. Staff local grants do not become customer portal grants; attachment caches remain permission-scoped.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-17 | Portal user guesses internal/other-customer record and file IDs | Reads/actions/exports denied; hidden totals not disclosed |
| AT-28 | Same IDs/references used across tenants | Foreign-key/authorization checks reject cross-tenant access and mutation |

Case-specific verification:

- Request another customer’s invoice, attachment and export ID through direct routes and verify denial.
- Check a summary report cannot reveal totals from hidden records.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-01 — Internal departmental estimate without final customer](<UC-01_Internal_Quote.md>)
- [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>)
- [UC-16 — Acceptance followed by quote edit](<UC-16_Revise_Accepted_Quote.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
