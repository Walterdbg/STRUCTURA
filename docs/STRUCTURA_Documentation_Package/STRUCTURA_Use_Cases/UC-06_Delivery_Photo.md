# UC-06 — Photo-required event/trip delivery

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/34  
**Requirements:** EVD-01 ATT-01  
**Master sections:** 8.1, 9.3, 13  
**Acceptance references:** AT-08 AT-09

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

A simple valid uploaded photo satisfies the photo requirement.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Assigned onsite/delivery user with delivery.confirm and authorized evidence capture.

**Trigger:** A delivery’s effective policy requires photo confirmation.

## Preconditions and input

The delivery exists, access is granted and its policy version is snapshotted. Photo requirement is explicit, not universal.

**Input:** Delivery ID/revision, one simple photo, capture/uploader metadata and command/upload identity.

## Main workflow

1. Open the delivery and display its effective evidence requirements.
2. Capture or select one photo and upload it to the delivery record.
3. Validate content, allowed size and durable storage; link it as DeliveryEvidence.
4. Mark the photo requirement satisfied once locally or remotely available as applicable.
5. Show proof completeness separately from physical quantities and remote upload status.

## Text flow

```text
Delivery requires photo
  |
  v
Capture/select one photo
  |
  v
Validate and store durably
  |
  v
Photo component satisfied
  |
  v
Show separate cloud-upload state
```

## Data changes and postconditions

Attachment and DeliveryEvidence plus audit are created; proof projection updates. Uploading a photo does not post a movement or imply full receipt of all planned quantities.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Failed/invalid upload remains failed or pending and cannot satisfy evidence. If a signature is explicitly required as well, the photo satisfies only the photo component. No extra angles, GPS or facial checks are inferred.

## Local engine and synchronization

Durably stored local photo may satisfy local photo evidence. Pending cloud upload is visible and retried by checksum/ID without duplicate evidence.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-08 | Photo-required delivery; user adds one valid photo | Photo requirement satisfied; no extra invented proof steps; pending remote upload shown separately |
| AT-09 | Signature required by explicit policy; confirmation lacks signature | Proof remains incomplete; captured signature references correct delivery revision |

Case-specific verification:

- Supply one valid photo and verify the photo requirement is satisfied.
- Interrupt upload before durable storage and verify no false proof-complete status.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-04 — Transport is worth documenting](<UC-04_Optional_Trip.md>)
- [UC-07 — User checks/confirms completion](<UC-07_User_Confirmation.md>)
- [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>)
- [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
