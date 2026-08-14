# Security Specification & Threat Model for iStore CRM

## 1. Data Invariants
1. **Device Inventory Integrity**: Every device in `/devices/{deviceId}` must have a valid 15-digit numeric IMEI, non-negative price, valid condition, and allowed status (`in_stock`, `sold`, `reserved`, `trade_in_pending`, `under_repair`).
2. **Lead Tracking**: Every CRM lead in `/leads/{leadId}` must contain valid customer contact name and phone number with length constraints (max 100 chars for name, max 30 for phone).
3. **Trade-In Valuation**: Every appraisal in `/tradeIns/{tradeInId}` must have non-negative numerical valuation values and valid status (`pending_inspection`, `customer_accepted`, `completed_swapped`, `customer_rejected`).
4. **Warranty Service**: Every ticket in `/warrantyTickets/{ticketId}` must reference an IMEI and valid service status (`received`, `inspecting`, `waiting_parts`, `repairing`, `ready`, `delivered`).
5. **Sales Invoices**: Completed POS invoices in `/invoices/{invoiceId}` must have non-negative total and final amounts with recognized payment methods (`cash`, `bank_transfer`, `mpos_card`, `installment_hd_saison`).

## 2. The "Dirty Dozen" Threat Payloads
1. **Payload 1 (Ghost Field Injection)**: Attempt to inject `isSuperAdmin: true` into a `/devices/{deviceId}` record. -> Blocked by validation helper.
2. **Payload 2 (Invalid IMEI Format)**: Attempt to save device with IMEI `"12345ABCDE"` (non-numeric, too short). -> Blocked by regex & size guard.
3. **Payload 3 (Negative Price Poisoning)**: Attempt to save device with `sellPrice: -5000000`. -> Blocked by `sellPrice >= 0` check.
4. **Payload 4 (Buffer Overflow Attack on Customer Name)**: Attempt to save lead with 50KB character string name. -> Blocked by `name.size() <= 100` check.
5. **Payload 5 (Unrecognized Status Shortcut)**: Attempt to update ticket status to `"bypassed_warranty"`. -> Blocked by status enum gate.
6. **Payload 6 (Corrupt Trade-In Base Value)**: Attempt to write `baseValuation: -1000000`. -> Blocked by range guard.
7. **Payload 7 (Denial of Wallet Document ID Injection)**: Attempt to create doc with 10KB string ID. -> Blocked by `isValidId(docId)`.
8. **Payload 8 (Terminal State Tampering)**: Attempt to change invoice after final checkout without admin privileges. -> Blocked by immutable constraints.
9. **Payload 9 (Blanket Query Scraping)**: Attempting to bypass filtered queries without authentication context. -> Blocked by authentication & field validation.
10. **Payload 10 (Spoofed Payment Method)**: Attempt to write invoice with `paymentMethod: "crypto_token_unverified"`. -> Blocked by paymentMethod enum gate.
11. **Payload 11 (Battery Health Out of Range)**: Attempt to write `batteryHealth: 150` or `-20`. -> Blocked by range `0 <= batteryHealth && batteryHealth <= 100`.
12. **Payload 12 (Direct Root Collection Write Bypass)**: Attempt to write to arbitrary root `/root/secret` collection. -> Blocked by default deny rule `match /{document=**} { allow read, write: if false; }`.
