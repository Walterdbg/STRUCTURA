# UC-05 — “tarima uno” and mobile toilets on an event map

**Version:** 1.2 · 29 September 2026  
**Basis:** Source case, S2/35  
**Requirements:** MAP-01  
**Master sections:** 6.2, 12  
**Acceptance references:** AT-07

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Use-case index](<README.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

## Outcome

Independent POIs with coordinates; preferred route visible without location hierarchy.

This document elaborates the existing scenario. Its command, permission, idempotency, audit and synchronization behavior follows the shared integration contract; it does not add a new business-policy requirement.

## Actors and trigger

**Actors:** Event-scoped user with map.edit; authorized operations users can view.

**Trigger:** The team needs delivery points and a preferred path on an Event disposition map.

## Preconditions and input

An Event/map scope exists. A map provider, if used, has suitable usage permissions; internet access is not needed to enter coordinates manually.

**Input:** POI labels, WGS84 coordinates, notes; ordered route geometry and optional POI references; optional validated GPX/GeoJSON.

## Main workflow

1. Open or create the Event map.
2. Place “tarima uno” and mobile toilets as labeled coordinate POIs.
3. Draw or import the preferred delivery path, preserving point order and segment boundaries.
4. Save map revision and associate a delivery destination or optional Trip route when useful.
5. Render saved geometry online or through locally cached permitted assets.

## Text flow

```text
Open Event map
  |
  v
Add labeled coordinate POIs
  |
  v
Draw/import preferred path
  |
  v
Save map revision
  |
  v
Use route without changing stock
```

## Data changes and postconditions

EventMap, POI and Route records/revisions change. Inventory location/quantity does not change. Category paths and warehouse hierarchy are not prerequisites.

The owning service records material mutations with actor, target/revision, occurrence and recorded times, deployment and command correlation. Retrying a committed command cannot duplicate its business effect. Consumers update projections from committed results, not from UI intent.

## Alternatives and failure handling

Invalid coordinates or malformed geometry reject the affected edit with a clear error. Missing basemap connectivity does not delete the POIs or stored route. A stale map revision uses explicit conflict handling.

## Local engine and synchronization

Cache event geometry and only provider-permitted map assets. Do not bulk-download public OSM raster tiles for offline use. Maps do not require GPS permission for manual entry.

## Acceptance and test evidence

| Master test | Given / When | Required result |
|---|---|---|
| AT-07 | User adds “tarima uno” and mobile-toilet POIs and preferred path | Coordinates/path persist; no inventory hierarchy required; offline geometry renders |

Case-specific verification:

- Save/reload both named POIs and an ordered path without creating location-tree nodes.
- Disconnect internet and verify saved geometry remains accessible on the local engine.

Record API/UI result, relevant record versions, audit/command correlation and local/cloud state where applicable. Use synthetic test data. A failed precondition must not produce the successful postcondition.

## Integration with related use cases

- [UC-04 — Transport is worth documenting](<UC-04_Optional_Trip.md>)
- [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>)
- [UC-13 — No visible way to create an Event](<UC-13_Create_Event.md>)

Related cases share domain records and contracts; linking them does not make every related action mandatory.

## Source and interpretation boundary

[Latest requirements discussion](https://chatgpt.com/c/6abba139-1e70-83e8-861e-9ef71091bf67). Latest user clarifications override superseded prototype/platform assumptions. Consult the master source register for provenance limits.
