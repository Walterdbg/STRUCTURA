# UC-10 — Large file stays in customer repository

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/40  
**Requirements:** EXT-01 ATT-01 CAP-01  
**Master sections:** 13, 15.3, 16  
**Acceptance references:** AT-10 AT-24

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Store authorized external reference and metadata; avoid mandatory managed copy.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Authorized record user; repository connection provisioning requires the tenant’s integration administration authority.

**Trigger:** A large file should remain in the customer’s repository instead of mandatory STRUCTURA storage.

## Preconditions and input

A supported tenant repository connection/reference is available with appropriate access. External file access is governed by both parent permissions and provider permissions.

**Input:** Parent record, provider/resource reference, display name and permitted metadata; optional cache selection only where supported.

## Main workflow

1. Choose an external reference for the parent attachment.
2. Resolve the file through the adapter when online and authorized.
3. Store reference and metadata without forcing a managed copy.
4. Open content through authorized resolution; keep secrets out of the record and client payload.
5. If the provider later denies access or the file disappears, retain the reference with a clear unavailable status.

## Text flow

```text
Select tenant repository resource
  |
  v
Resolve authorized reference
  |
  v
Save metadata without mandatory copy
  |
  v
Open through provider adapter
  |
  v
Show unavailable if access later fails
```

## Data changes and postconditions

Attachment storage_mode is external; connection secrets remain separate. Meter actual managed metadata/cache/transfer independently from the external file’s nominal size.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Expired credentials, deleted files or provider outages must not be reported as successful access. No automatic public sharing or unrequested full copy is permitted. An external reference alone cannot prove that a required photo is available.

## Local engine and synchronization

Show unavailable external content unless a permitted durable cached copy exists. Retain metadata and synchronization status; do not pretend remote content is stored locally.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-10 | External large file linked; repository unavailable later | No mandatory managed copy; clear unavailable status, record and metadata preserved |
| AT-24 | Same local usage event synchronized repeatedly | One measured usage event; external bytes distinguished from managed bytes |

Case-specific verification:

- Link a large file and verify no full managed blob is created by default.
- Remove provider access and verify record preservation and an actionable error.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>)
- [UC-11 — Local installation with inactive license](<UC-11_Inactive_License.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
