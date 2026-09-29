# UC-15 — Two disconnected engines reserve the same asset

**Version:** 1.2 · 29 September 2026  
**Basis:** Derived test case  
**Requirements:** INV-01 ENG-01 SEC-01  
**Master sections:** 6.5, 11.3–11.4  
**Acceptance references:** AT-04 AT-21

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Authority rules prevent competing final commitments; proposed conflict remains visible.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Operations users on cloud and local engines attempting reservation.commit or movement.post.

**Trigger:** Disconnected engines attempt competing final commitments for the same stock or asset.

## Preconditions and input

The resource has a known authority scope/epoch. Cloud and local views may have different freshness; a proposal is not a committed reservation.

**Input:** Resource/interval/quantity, command IDs, expected versions, deployment authority and current availability projection.

## Main workflow

1. Resolve the authority scope for the requested resource.
2. Allow only the authoritative engine to evaluate and finalize its stock commitment.
3. Keep other-engine requests explicitly deferred/proposed or reject them with a reason; do not display final success.
4. Synchronize commands and detect any stale/invalid authority or version.
5. Resolve conflicts explicitly; transfer authority only after acknowledged handover and reconciliation.

## Text flow

```text
Competing commitment requests
  |
  v
Resolve resource authority/epoch
  |
  v
Authoritative writer validates stock
  |
  v
Other writer defers/rejects final commit
  |
  v
Reconcile before authority handover
```

## Data changes and postconditions

Only valid authoritative reservations/movements affect availability. Conflict/proposal records remain distinguishable from posted inventory facts.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Do not use last-write-wins, silently oversell an individual asset or automatically steal authority during outage. Expired/invalid authority fails closed for final commitment. Metadata merge rules cannot be reused for stock transactions.

## Local engine and synchronization

No engine may claim globally current availability it cannot observe. Local work continues only within its delegated scope; conflicting scope remains unavailable for final writes elsewhere.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-04 | Overlapping reservation exhausts availability; another commitment attempted | Conflict reported; no silent excess final commitment under baseline policy |
| AT-21 | Concurrent offline/cloud commands target delegated inventory | Non-authoritative final commitment refused/deferred; no last-write-wins stock corruption |

Case-specific verification:

- Attempt to reserve one asset on two engines and verify at most one final authoritative commitment.
- Attempt authority handover with pending commands and verify reconciliation is required.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>)
- [UC-14 — Internet fails during a movement](<UC-14_Offline_Movement.md>)
- [UC-21 — Inclusive return-day reservation](<UC-21_Inclusive_Reservation_Dates.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

Derived engineering test case from the master specification; not represented as a recovered historical discussion. Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
