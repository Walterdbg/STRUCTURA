# UC-14 — Internet fails during a movement

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** ENG-01 MOV-01 AUD-01  
**Master sections:** 9.2, 11.1–11.4  
**Acceptance references:** AT-19 AT-20 AT-30

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Durable local posting within authority; retry sync does not duplicate stock effects.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Local inventory operator with movement.post, valid cached grant and inventory authority.

**Trigger:** Internet fails while onsite staff need to record a movement.

## Preconditions and input

Local server and database are reachable; entitlement remains valid; affected inventory authority is delegated to this engine.

**Input:** Normal movement payload plus command ID, deployment ID, expected version, authority epoch and occurrence time.

## Main workflow

1. Validate the movement through the same domain rules used online.
2. Atomically commit movement, balance effects, audit and durable outbox locally.
3. Acknowledge saved locally and display pending synchronization.
4. When connectivity returns, replay the command with unchanged ID and payload.
5. Cloud deduplicates, validates authority, records acknowledgment and returns canonical version; local outbox becomes acknowledged.

## Text flow

```text
Internet lost; local server reachable
  |
  v
Validate entitlement + authority
  |
  v
Commit movement + audit + outbox
  |
  v
Show saved locally
  |
  v
Reconnect and deduplicate before acknowledgment
```

## Data changes and postconditions

One local business transaction and eventually one converged cloud transaction. Retry after a lost acknowledgment does not create a second stock effect.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

If the local server is unreachable, do not claim saved. A crash before commit yields no committed movement; after commit, recovery preserves outbox. Cloud rejection/conflict keeps the local factual record visible rather than erasing it.

## Local engine and synchronization

This is local-server continuity, not autonomous browser storage. License expiry follows UC-20; authority conflict follows UC-15.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-19 | Internet lost, local server and entitlement valid | Authorized local operation persists without cloud and shows pending sync |
| AT-20 | Local server crashes after commit, before cloud acknowledgment | Restart preserves command; resend produces one cloud effect |
| AT-30 | Backup restored with pending outbox/evidence | Records/blobs reconciled, IDs preserved, duplicate sync prevented, entitlement enforced |

Case-specific verification:

- Disconnect internet, post locally, restart the server before acknowledgment and reconnect; exactly one converged movement exists.
- Verify audit occurrence and cloud receipt times remain distinct.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-15 — Two disconnected engines reserve the same asset](<UC-15_Competing_Inventory_Commitment.md>)
- [UC-20 — License expires with pending local commands](<UC-20_License_Expiry_With_Pending_Sync.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
