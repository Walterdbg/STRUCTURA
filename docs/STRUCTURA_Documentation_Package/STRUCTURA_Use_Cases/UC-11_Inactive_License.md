# UC-11 — Local installation with inactive license

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/40  
**Requirements:** LIC-01 LIC-02 ENG-01  
**Master sections:** 11.1, 15.1–15.2, 16  
**Acceptance references:** AT-23

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Full transfer denied; basic inventory/tracking CSV/print remains available to authorized user.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Authenticated user with export.basic; full export additionally needs export.full and active entitlement.

**Trigger:** A local or online installation has an inactive or expired license.

## Preconditions and input

Existing records remain intact. License state is verified by the engine; access is still permission-scoped.

**Input:** Requested operation/export profile, tenant/user scope, entitlement decision and policy version.

## Main workflow

1. Evaluate entitlement at the service boundary and show restricted mode.
2. Allow the authorized basic inventory/tracking CSV or printable projection.
3. Reject full schema/relationship export, deployment transfer and other unlicensed protected actions.
4. Recheck export access when the worker executes and when output is downloaded.
5. Keep license renewal/diagnostics available without deleting stored records.

## Text flow

```text
Entitlement inactive
  |
  v
Enter restricted mode
  |
  v
Basic export request OR protected request
  |
  v
Permit scoped CSV/print OR deny full transfer
  |
  v
Preserve data and renewal access
```

## Data changes and postconditions

May create a scoped basic ExportJob/output and audit. No destructive data change occurs at expiry; no unrestricted full-data bundle is generated.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

A generic API, pagination path or queued job cannot bypass restricted-mode policy. Missing user permissions still block basic exports. Clock rollback cannot manufacture renewed entitlement.

## Local engine and synchronization

Validate signed local entitlement against trusted time handling. Existing outbox commands are preserved under UC-20; disconnection alone does not grant perpetual operation.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-23 | License inactive; authorized user requests basic vs full export | Inventory/tracking CSV/print succeeds; full export/transfer denied on UI, API and worker |

Case-specific verification:

- With inactive license, run both basic and full exports through UI, direct API and worker; only permitted basic output succeeds.
- Verify ordinary records and pending evidence remain stored after restriction.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-10 — Large file stays in customer repository](<UC-10_External_Repository_File.md>)
- [UC-20 — License expires with pending local commands](<UC-20_License_Expiry_With_Pending_Sync.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion, answer 40](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
