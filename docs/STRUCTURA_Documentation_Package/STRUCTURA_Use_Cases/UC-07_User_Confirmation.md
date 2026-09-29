# UC-07 — User checks/confirms completion

**Version:** 1.2 · 29 September 2026  
**Basis:** Source fragment, S2/33  
**Requirements:** EVD-01 EVD-02  
**Master sections:** 3, 8.1, 13  
**Acceptance references:** AT-08 AT-09 AT-18

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Confirmation supported; exact original trigger remains G.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Assigned user with delivery.confirm or the capability governing the configured confirmation target.

**Trigger:** A configured action can be acknowledged by a user check/confirmation.

## Preconditions and input

The action and target revision are known. The original question 33 context is unavailable; this case does not create a universal confirmation rule.

**Input:** Target ID/revision, confirmation decision, actor and occurrence time; optional note supported by the target.

## Main workflow

1. Display the target and the action the user is confirming.
2. Evaluate the effective policy to determine whether a simple confirmation is sufficient.
3. Record the explicit acknowledgment against the target revision.
4. Update only the confirmation/proof facet covered by this acknowledgment.
5. Display any independently required photo or signature that remains outstanding.

## Text flow

```text
Configured acknowledgment action
  |
  v
Show exact target revision
  |
  v
Check effective evidence policy
  |
  v
Record user confirmation
  |
  v
Keep other required evidence outstanding
```

## Data changes and postconditions

DeliveryEvidence of confirmation type, or the target’s equivalent confirmation record, and audit are appended. A check is not a signature, payment, stock movement or approval of unrelated commercial content.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A missing photo/signature cannot be bypassed by a simple check when that component is explicitly required. Stale targets or missing permissions reject the acknowledgment. Duplicate command returns the same record.

## Local engine and synchronization

Use valid cached grants and entitlement; preserve actor/time and saved-locally status. Sync cannot turn a check into a different evidence type.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-08 | Photo-required delivery; user adds one valid photo | Photo requirement satisfied; no extra invented proof steps; pending remote upload shown separately |
| AT-09 | Signature required by explicit policy; confirmation lacks signature | Proof remains incomplete; captured signature references correct delivery revision |
| AT-18 | Approval, payment or permission changed | Actor, time, revision and change details present; audit mutation denied |

Case-specific verification:

- Under a confirmation-only configured policy, record actor/time and satisfy that component.
- Under explicit signature-required policy, show the missing signature after a simple check.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
