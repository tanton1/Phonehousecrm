# UAT & Release Checklist - PhoneHouse CRM

Checklist này là điều kiện bắt buộc trước khi merge bất kỳ PR hoặc deploy phiên bản Production nào.

---

## 🛡️ Release 1: Core Safety & Accounting
- [x] **POS Concurrency**: Hai thu ngân cùng mở 1 cây máy và checkout $\rightarrow$ Chỉ 1 người thành công, 1 người nhận thông báo `DEVICE_ALREADY_SOLD`.
- [x] **Idempotency Guard**: Thu ngân double-click F9 hoặc spam nút thanh toán $\rightarrow$ Chỉ tạo duy nhất 1 hóa đơn, quỹ chỉ tăng 1 lần.
- [x] **Stock Guard**: Phụ kiện tồn 1 cái, 2 khách cùng mua $\rightarrow$ Đơn thứ 2 bị chặn với `INSUFFICIENT_STOCK`.
- [x] **Trả góp Kế toán**: Đơn trả góp Home Credit $\rightarrow$ Home Credit nhận nợ, khách hàng nợ = 0, doanh số `totalSpent` tăng đúng bằng tổng tiền đơn hàng.
- [x] **Quỹ & Sổ quỹ**: Mọi giao dịch POS bắt buộc mang `fundId` chính xác, không dùng fallback `funds[0]`.
- [x] **Refund Ledger**: Hóa đơn mới hoàn đúng `paymentFundId`, hóa đơn legacy bắt buộc Admin chọn Quỹ xác nhận.
- [x] **Chấm công 3 lớp**:
  - Không cho auto-enroll Face ID.
  - Backend AI Face ngắt kết nối $\rightarrow$ Báo `ERROR`, không tự động `SUCCESS`.
  - GPS cửa hàng chưa cấu hình $\rightarrow$ Báo `ERROR`, không tự lấy vị trí nhân viên.
  - Lấy giờ server cho check-in, cấm sửa giờ điện thoại.
  - Khóa điểm danh lặp lại trong ngày.

---

## 🛒 Release 2: Sales UI & Cockpit
- [ ] **AppShell**: 6 cụm danh mục hiển thị đầy đủ trên Desktop & Mobile.
- [ ] **POS Cockpit**: Layout 3 cột hiển thị sắc nét trên màn hình POS 1366x768 và 1920x1080.
- [ ] **Keyboard Shortcuts**: `F2` (Chọn máy), `F4` (Khách hàng), `F8` (Giảm giá), `F9` (Thanh toán), `ESC` (Hủy modal).
- [ ] **Thermal Print K80**: Phiếu in hóa đơn hiển thị đầy đủ QR chuyển khoản, IMEI và bảo hành.

---

## 📦 Release 3: Inventory & Warehouse
- [ ] **Kho IMEI**: View Switcher (Table $\leftrightarrow$ Card Grid) hoạt động mượt mà.
- [ ] **Location Chip**: Hiển thị chính xác vị trí máy (Kho Tổng, Chi Nhánh, KTV, QC).
- [ ] **PO Wizard**: Nhập hàng bắt buộc scan đủ IMEI, không tự sinh IMEI giả.
- [ ] **Chuyển kho**: Timeline chuyển kho có xác nhận xuất/nhận theo từng IMEI.

---

## 💰 Release 4: Finance & CRM
- [ ] **Sổ quỹ Banking**: Hiển thị số dư đầu kỳ, thu, chi, số dư cuối kỳ, chênh lệch đối soát.
- [ ] **Công nợ 360°**: Tra cứu đầy đủ lịch sử mua hàng, công nợ NCC và công nợ tài chính.
- [ ] **CRM Kanban**: Kéo thả trạng thái Lead kèm cảnh báo quá hạn SLA.

---

## 🔧 Release 5: Operations & HR
- [ ] **Trade-in**: Định giá 12 bước, AI talk-track script và xác nhận duyệt giá 3 cấp.
- [ ] **Bảo hành Kanban**: Luồng nhận máy $\rightarrow$ Kiểm tra $\rightarrow$ Báo giá $\rightarrow$ Sửa $\rightarrow$ QC $\rightarrow$ Trả khách.
- [ ] **Phân quyền Ma trận**: Ma trận phân quyền chi tiết theo từng hành vi nghiệp vụ.
