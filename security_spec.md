# Security Specification (Phase 0)

## 1. Data Invariants

1.  **Branch Isolation**: A user can only access (read/write) records (devices, leads, invoices, etc.) if the record's `branchId` matches the user's `branchId`.
2.  **Cross-Branch Access**: A user with the role `ADMIN` or `MANAGER` can access data across any branch.
3.  **Authentication Requirement**: Unauthenticated access is completely forbidden. All actions require a verified email (or valid auth token).
4.  **Immutability**: A user cannot modify their own role or `branchId` (only `ADMIN` can update other users).
5.  **Strict Schema**: Every collection strictly validates incoming documents against defined keys and data types (no ghost fields).
6.  **Id Poisoning Guard**: Document IDs must conform to a strict string size.

## 2. The "Dirty Dozen" Payloads

1.  **Identity Spoofing**: Attempt to update another user's profile (`role` or `branchId`).
2.  **Branch Data Leak**: A `SALES` user in `BR-01` attempts to list invoices belonging to `BR-02`.
3.  **Shadow Update**: Include a `GhostField: true` in an invoice payload.
4.  **Cross-Branch Create**: A `SALES` user in `BR-01` tries to create a Lead assigned to `BR-02`.
5.  **Denial of Wallet**: Create a document with an ID of 2,000 characters.
6.  **Unauthenticated Access**: Attempt to read devices without an auth token.
7.  **Data Poisoning (Type Mismatch)**: Update a device's `sellPrice` with a 1MB string instead of a number.
8.  **Self-Escalation**: A `SALES` user updates their own user profile to set `role = "ADMIN"`.
9.  **Missing Required Fields**: Create a new Trade-In without `customerName`.
10. **State Shortcutting**: Bypass validation checks for `TradeInAppraisal` by providing only `status = "completed"`.
11. **Admin Override Test**: An `ADMIN` successfully updates a document in a branch they don't explicitly belong to.
12. **System Config Tampering**: A `SALES` user attempts to update global settings or branch configurations.

## 3. The Test Runner

(To be implemented via ESLint security rule checker for Firestore rules)
