# UC-12 — Product photo disappears or wrong product reloads

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S3  
**Requirements:** INV-02 ATT-01  
**Master sections:** 2.3, 6.4, 13, 16.1  
**Acceptance references:** AT-05

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Save/reload retains correct photo; failures explain the action that failed.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Inventory user with catalog/photo editing authority and parent-scoped attachment access.

**Trigger:** A user assigns a product photo and later reloads that product.

## Preconditions and input

Products have stable IDs; storage is available within configured limits. A blank photo is valid for a product without an image.

**Input:** Selected product ID/version and image file/reference.

## Main workflow

1. Load product A and show its existing image or an empty placeholder.
2. Choose a new photo and validate/store it through the attachment service.
3. Save the association to product A by stable ID.
4. Load product B and clear/rebind the preview to B’s attachment.
5. Reload A and render its saved available image; present storage failure distinctly from no photo.

## Text flow

```text
Load product A
  |
  v
Store photo and bind to A ID
  |
  v
Load product B with B preview
  |
  v
Reload product A
  |
  v
Show A saved photo or explicit storage error
```

## Data changes and postconditions

Product photo reference and Attachment metadata/content update with audit. No stock quantities, product IDs or unrelated photo associations change.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Navigating away before save must not attach an image to the next selected product. Failed uploads stay failed/pending. Missing migrated filenames are warnings rather than silently linking another matching display name.

## Local engine and synchronization

Store image locally before acknowledging its availability; synchronization carries parent identity and checksum. Preview must not depend on live cloud storage when the local image exists.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-05 | Photo saved to item A; user loads item B then A | Correct photo reappears only on A; failed upload never reports complete |

Case-specific verification:

- Save photo for A, switch to B and back to A, and verify each preview identity.
- Simulate failed storage and confirm the UI does not falsely report a saved image.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>)
- [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>)
- [UC-24 — Import pop-up dismissed and identical file rerun](<UC-24_Reliable_Inventory_Import.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Inventory prototype discussion](https://chatgpt.com/c/6aa1a499-2740-83e8-bcfd-49f5ae27287c). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
