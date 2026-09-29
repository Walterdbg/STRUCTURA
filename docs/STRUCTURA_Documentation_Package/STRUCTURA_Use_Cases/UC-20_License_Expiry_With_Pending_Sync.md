# UC-20 — License expires with pending local commands

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** ENG-01 LIC-01 LIC-02 AUD-01  
**Master sections:** 11.2–11.4, 15.2  
**Acceptance references:** AT-20 AT-22 AT-23 AT-30

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Existing data preserved, clear restricted mode, licensed features blocked per effective entitlement.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Local operator and synchronization worker; tenant administrator may renew the entitlement.

**Trigger:** Entitlement expires while locally committed commands or evidence uploads await synchronization.

## Preconditions and input

Durable local commands retain their IDs, actor, occurrence/commit times and entitlement/authority references. Exact grace duration is policy, not invented here.

**Input:** Pending commands/evidence, current entitlement, recorded prior entitlement decision and trusted time state.

## Main workflow

1. Detect expiry and enter restricted mode without deleting committed data or pending files.
2. Prevent new protected mutations and full transfer according to the effective policy.
3. Retain pending command/evidence status and allow scoped basic exports.
4. On reconnect, use only reconciliation operations explicitly permitted by the effective entitlement; otherwise retain the queue awaiting renewal.
5. After authorized reconciliation/renewal, deduplicate and validate pending commands, acknowledge valid work and expose rejected/conflicting work without erasing history.

## Text flow

```text
License expires with queued work
  |
  v
Preserve commands and evidence
  |
  v
Restrict new protected actions
  |
  v
Reconcile only if policy permits, else await renewal
  |
  v
Replay original IDs without duplicate effects
```

## Data changes and postconditions

License/sync status and audit change. Existing physical facts and outbox records are preserved. No implicit unlimited grace period or full-transfer exception is created.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Do not treat a changed local clock as renewal. Do not silently discard commands rejected by current cloud authorization. A retry after renewal keeps the original command ID and payload; a corrected command is linked separately.

## Local engine and synchronization

The signed validity window governs operations; inability to reach licensing service does not itself renew it. Reconciliation policy must be explicitly configured and cannot act as a general export bypass.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-20 | Local server crashes after commit, before cloud acknowledgment | Restart preserves command; resend produces one cloud effect |
| AT-22 | Authorization revoked while server disconnected | Defined offline validity observed; reconnect flags/evaluates commands without erasing factual local history |
| AT-23 | License inactive; authorized user requests basic vs full export | Inventory/tracking CSV/print succeeds; full export/transfer denied on UI, API and worker |
| AT-30 | Backup restored with pending outbox/evidence | Records/blobs reconciled, IDs preserved, duplicate sync prevented, entitlement enforced |

Case-specific verification:

- Expire license after local commit but before acknowledgment and verify queue/data preservation plus restricted new operations.
- Renew, replay twice and verify one converged stock/payment effect.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-11 — Local installation with inactive license](<UC-11_Inactive_License.md>)
- [UC-14 — Internet fails during a movement](<UC-14_Offline_Movement.md>)
- [UC-15 — Two disconnected engines reserve the same asset](<UC-15_Competing_Inventory_Commitment.md>)
- [UC-19 — Payment entered twice due to retry](<UC-19_Payment_Retry.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
