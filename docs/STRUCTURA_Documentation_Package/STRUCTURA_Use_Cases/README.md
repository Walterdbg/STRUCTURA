# STRUCTURA use-case documents

**Version:** 1.2 · 29 September 2026  
**Coverage:** One document for each of the 25 cases in Section 10.

[Master specification](<../STRUCTURA_Implementation_Specification.md>) · [Shared integration contract](<INTEGRATION_CONTRACT.md>)

Read the master requirements and shared contract before implementing a case. The table below links each scenario to its requirements and existing acceptance criteria; each document adds a complete workflow, preconditions, inputs, effects, failure behavior and local-engine handling.

| Case document | Requirements | Master acceptance tests |
|---|---|---|
| [UC-01 — Internal departmental estimate without final customer](<UC-01_Internal_Quote.md>) | COM-01 COM-02 EVT-01 | AT-12 AT-13 AT-17 |
| [UC-02 — Quote contains only part of eventual event bill](<UC-02_Independent_Invoice.md>) | COM-01 COM-03 COM-05 | AT-14 AT-16 |
| [UC-03 — A normal inventory location change](<UC-03_Location_Movement.md>) | INV-01 MOV-01 MOV-02 | AT-02 AT-03 AT-28 |
| [UC-04 — Transport is worth documenting](<UC-04_Optional_Trip.md>) | TRP-01 MOV-01 | AT-06 AT-02 |
| [UC-05 — “tarima uno” and mobile toilets on an event map](<UC-05_Event_Map.md>) | MAP-01 | AT-07 |
| [UC-06 — Photo-required event/trip delivery](<UC-06_Delivery_Photo.md>) | EVD-01 ATT-01 | AT-08 AT-09 |
| [UC-07 — User checks/confirms completion](<UC-07_User_Confirmation.md>) | EVD-01 EVD-02 | AT-08 AT-09 AT-18 |
| [UC-08 — Normal UI operation without scanning](<UC-08_Manual_Inventory_UI.md>) | INV-01 MOV-01 | AT-02 AT-36 |
| [UC-09 — Attach a file to its operational record](<UC-09_Record_Attachment.md>) | ATT-01 SEC-01 | AT-05 AT-10 AT-17 |
| [UC-10 — Large file stays in customer repository](<UC-10_External_Repository_File.md>) | EXT-01 ATT-01 CAP-01 | AT-10 AT-24 |
| [UC-11 — Local installation with inactive license](<UC-11_Inactive_License.md>) | LIC-01 LIC-02 ENG-01 | AT-23 |
| [UC-12 — Product photo disappears or wrong product reloads](<UC-12_Product_Photo_Reload.md>) | INV-02 ATT-01 | AT-05 |
| [UC-13 — No visible way to create an Event](<UC-13_Create_Event.md>) | EVT-01 INV-01 | AT-01 |
| [UC-14 — Internet fails during a movement](<UC-14_Offline_Movement.md>) | ENG-01 MOV-01 AUD-01 | AT-19 AT-20 AT-30 |
| [UC-15 — Two disconnected engines reserve the same asset](<UC-15_Competing_Inventory_Commitment.md>) | INV-01 ENG-01 SEC-01 | AT-04 AT-21 |
| [UC-16 — Acceptance followed by quote edit](<UC-16_Revise_Accepted_Quote.md>) | COM-02 AUD-01 | AT-13 AT-18 |
| [UC-17 — Customer follows another customer's URL](<UC-17_Portal_Access_Isolation.md>) | PRT-01 SEC-01 ATT-01 | AT-17 AT-28 |
| [UC-18 — Partial delivery and partial return](<UC-18_Partial_Delivery_Return.md>) | INV-01 MOV-02 EVD-01 | AT-29 AT-32 |
| [UC-19 — Payment entered twice due to retry](<UC-19_Payment_Retry.md>) | COM-04 AUD-01 | AT-15 AT-16 AT-18 |
| [UC-20 — License expires with pending local commands](<UC-20_License_Expiry_With_Pending_Sync.md>) | ENG-01 LIC-01 LIC-02 AUD-01 | AT-20 AT-22 AT-23 AT-30 |
| [UC-21 — Inclusive return-day reservation](<UC-21_Inclusive_Reservation_Dates.md>) | INV-01 REP-01 | AT-04 AT-31 |
| [UC-22 — Consumable partly returned, partly used](<UC-22_Consumable_Return_Allocation.md>) | INV-01 MOV-02 | AT-32 AT-29 |
| [UC-23 — Equipment returned damaged, later repaired](<UC-23_Repair_And_Return_To_Stock.md>) | INV-01 MOV-02 | AT-32 AT-33 |
| [UC-24 — Import pop-up dismissed and identical file rerun](<UC-24_Reliable_Inventory_Import.md>) | IO-01 INV-01 AUD-01 | AT-25 AT-34 AT-35 AT-36 |
| [UC-25 — Door count differs from planned dispatch](<UC-25_Dispatch_Count_Reconciliation.md>) | INV-01 MOV-02 IO-01 AUD-01 | AT-02 AT-18 AT-25 |

The 25-case catalog is the requested Section 10 expansion, not a claim that it covers every module in the broader specification. Master acceptance criteria for services, integration adapters, reporting and other modules remain applicable even when they do not have a dedicated Section 10 case.
