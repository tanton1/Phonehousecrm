# Kiến Trúc Mục Tiêu (Target State Architecture) - PhoneHouse CRM

**Mục tiêu**: Chuẩn hóa hệ thống quản trị bán lẻ chuỗi theo mô hình Enterprise Modular Monolith / SaaS Ready.

---

## 1. Kiến Trúc Phân Lớp Mục Tiêu (Target Modular Architecture)

```mermaid
graph TD
    subgraph "Frontend Layer (React 19 + Tailwind Design System)"
        UI_Shell[AppShell & 6-Cluster Navigation]
        F_POS[features/pos - POS Cockpit 3 Cột]
        F_INV[features/inventory - Location Journey & PO Wizard]
        F_FIN[features/finance - Banking Ledger & Partner 360]
        F_CRM[features/crm - Lead Kanban & SLA Automation]
        F_WAR[features/warranty - Tech Workbench & Repair Flow]
        F_HR[features/attendance - Biometric & Shift SOP Checklist]
        SharedUI[shared/ui - Button, Input, Modal, DataTable, Timeline]
    end

    subgraph "Backend API Layer (Express + Node.js Services)"
        MW[Middleware: Auth, RoleGuard, BranchGuard, Idempotency]
        R_POS[routes/posCheckout.ts]
        R_REF[routes/invoiceRefund.ts]
        R_ATT[routes/attendance.ts]
        R_AI[routes/executiveAI.ts]
        SVC[services: checkoutService, inventoryLedger, financeService, geofenceService]
    end

    subgraph "Data Storage & Integration"
        FS[(Firestore Enterprise Database)]
        GCS[(Cloud Storage - Hóa đơn & Mẫu khuôn mặt)]
        GEMINI[Gemini 2.5 Flash Multimodal Engine]
        TEL[Telegram Channel Alert Dispatcher]
    end

    UI_Shell --> SharedUI
    F_POS --> R_POS
    F_INV --> FS
    F_FIN --> R_REF
    F_CRM --> FS
    F_WAR --> FS
    F_HR --> R_ATT

    MW --> R_POS
    MW --> R_REF
    MW --> R_ATT
    R_POS --> SVC
    R_REF --> SVC
    R_ATT --> SVC
    SVC --> FS
    SVC --> GEMINI
    SVC --> TEL
```

---

## 2. Các Quy Chuẩn Nghiệp Vụ Bất Biến (Invariant Principles)
1. **Single Writer Pattern**: Các nghiệp vụ tác động đa collection (Bán hàng, Đổi trả, Chuyển quỹ, Nhập hàng) bắt buộc qua Server Transaction API.
2. **Strict Partner Accounting**:
   - `CUSTOMER`: Chỉ tăng `totalSpent`. Công nợ luôn = 0 đối với đơn trả góp tài chính.
   - `FINANCE_PARTNER`: Ghi nhận toàn bộ khoản giải ngân trả góp chưa thanh toán (`outstandingDebt`).
   - `SUPPLIER`: Khớp chính xác `supplierId` khi trả nợ, không dùng fallback.
3. **Traceable Inventory Lifecycle**:
   - Mỗi máy có định danh `IMEI` (15 số thực tế), lưu trữ vết chuyển kho `stockMovements` và `LocationBadge`.
4. **Biometric & Network Attendance**:
   - Mốc thời gian lấy theo giờ server, xác thực Egress IP chi nhánh và không cho client tự gán `SUCCESS` khi máy chủ AI offline.
