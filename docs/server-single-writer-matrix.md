# Server single-writer migration matrix

| Domain | Authoritative writer | Browser status |
| --- | --- | --- |
| Attendance, leave requests, shift board, daily checklist, handover and payroll | `/api/attendance`, `/api/payroll` | Server-only; manager reads are branch-scoped |
| Funds and cash transactions | `/api/finance` | Server-only |
| POS invoices and stock deduction | `/api/pos` | Server-only |
| Purchase receipt, device import and device metadata | `/api/inventory` | Server-only; direct delete is intentionally unavailable |
| Device and inter-branch transfers | `/api/inventory-transfers` | Server-only |
| Technical work, parts, QC and cost | `/api/technical` | Server-only |
| Product Master | `/api/catalog` | Server-only |
| CRM lead workflow | `/api/crm` | Server-only; legacy direct-write adapters removed |
| Channel messages and read state | provider/chat APIs | Server-only |
| Users | `/api/users` | Server-only |
| Branches, warehouses and company settings | `/api/configuration` | Server-only; branch deletion archives after dependency checks |
| Partners and partner metadata | `/api/partners` | Server-only; debt fields remain finance/purchase owned |
| Trade-in appraisal and approved valuation | `/api/trade-ins`, consumed by `/api/pos` | Server-only; employee draft and manager-approved price are separated |
| SOP templates | `/api/configuration/sop-templates` | Server-only; deletion archives templates already referenced by checklist history |
| Repair-service price list | `/api/configuration/repair-services` | Server-only |
| POS accessory projections and balances | receipt/POS/inventory APIs | Server-only; unused product CRUD adapters removed |
| Custom receipt/payment categories | `/api/configuration/finance-categories` | Server-only shared configuration; no per-browser `localStorage` copy |
| Trade-in consumption during POS checkout | `/api/trade-ins`, `/api/pos` | Approved appraisal, exact IMEI and receiving warehouse are locked together in one checkout transaction |

Every migrated collection must have `allow write: if false` in Firestore Rules. Remove its legacy adapter from `firestoreService.ts` after its final screen uses the API. CI blocks new direct-write files.

Large feature pages are loaded on demand from `App.tsx`. This keeps the initial application bundle small without changing the server-authoritative data boundaries above.

When an ADMIN selects **Toàn hệ thống**, `App.tsx` does not open realtime listeners on whole operational collections. It reads `/api/admin/operational-snapshot`, capped at 200 records per domain with exact server-side counts. Selecting a concrete branch restores branch-scoped realtime queries. Individual feature pages should continue migrating from this bounded compatibility snapshot to their own cursor APIs.

Operational Firestore listeners in `firestoreService.ts` fail closed when `branchId` is empty or `ALL`. The retired unscoped device, warranty, spare-part, legacy chat, weekly schedule and legacy CRM listeners were removed; those domains now use their authoritative API or the scoped chat stream.
