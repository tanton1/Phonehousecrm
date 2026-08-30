# Phân tích ứng dụng AI vào nhập liệu PhoneHouse CRM

## Kết luận kiến trúc

AI chỉ được phép tạo **bản nháp có nguồn gốc và độ tin cậy**. Mọi thao tác làm thay đổi tồn kho, tài chính, công nợ, trạng thái sửa chữa hoặc hồ sơ nhân sự vẫn phải đi qua API nghiệp vụ hiện hành sau khi người có quyền xác nhận.

Luồng chuẩn cho mọi module:

1. Nhận ảnh/audio và kiểm tra MIME, dung lượng, quyền chi nhánh.
2. Gemini trích xuất vào JSON schema riêng cho từng loại chứng từ.
3. Chuẩn hóa dữ liệu, đối chiếu master data/IMEI/SKU/đối tác.
4. Hiển thị trường không chắc, sai lệch và bản gốc cho nhân viên sửa.
5. Xác nhận bản nháp, lưu `reviewedExtraction` và audit trail.
6. Gọi API single-writer của module với idempotency key gắn với draft.

## Ma trận module hiện tại

| Ưu tiên | Module | Nguồn AI phù hợp | Bản nháp đầu ra | Kiểm soát bắt buộc | Trạng thái |
|---|---|---|---|---|---|
| P0 | POS bán hàng | Ảnh phiếu bán/đơn viết tay | Khách, IMEI/SKU, số lượng, giá, giảm giá, thanh toán | Khớp IMEI với kho, SKU với catalog, chính sách giá, tổng tiền | Đã có |
| P0 | CRM | Ghi âm tư vấn/cuộc gọi | Transcript, nhu cầu, ngân sách, lịch hẹn, next action | Tên + SĐT hợp lệ, chống tạo trùng bằng operation key | Đã có |
| P1 | Nhập hàng & kho IMEI | Hóa đơn NCC, phiếu giao hàng, ảnh tem hộp | Nhà cung cấp, danh sách IMEI, model, giá vốn, kho nhận | IMEI duy nhất, PO tồn tại, NCC/chi nhánh, tổng hóa đơn | Nên làm kế tiếp |
| P1 | Sửa chữa lẻ | Ảnh máy + ghi âm mô tả lỗi | Phiếu tiếp nhận, tình trạng ngoại quan, lỗi, phụ kiện bàn giao | Khách/IMEI, ảnh bắt buộc, checklist đầu vào, nhân viên xác nhận | Nên làm kế tiếp |
| P1 | Tài chính | Ảnh hóa đơn chi, biên lai, ảnh chuyển khoản | Thu/chi nháp, số tiền, ngày, đối tác, danh mục | Kế toán duyệt, quỹ đúng chi nhánh, chống trùng hash/số chứng từ | Chưa làm |
| P2 | Thu cũ đổi mới | Ảnh máy, ảnh pin/IMEI + mô tả bằng giọng nói | Thông tin máy và checklist thẩm định | Không cho AI quyết giá cuối; IMEI, iCloud và KCS phải xác nhận | Chưa làm |
| P2 | Linh kiện kỹ thuật | Phiếu nhập linh kiện/ảnh nhãn | SKU, số lượng, giá nhập, kho kỹ thuật | Khớp catalog, kho, PO và giới hạn số lượng | Chưa làm |
| P2 | Đối tác | Danh thiếp/hóa đơn NCC | Tên, MST, SĐT, địa chỉ, tài khoản | Tra trùng MST/SĐT, không tự tạo công nợ | Chưa làm |
| P3 | Nhân sự | Đơn nghỉ/giấy tờ nội bộ | Đơn nghỉ và thông tin hành chính nháp | Dữ liệu nhạy cảm, phân quyền HR, retention ngắn | Chỉ nên làm sau |

## Đề xuất triển khai tiếp theo

### Giai đoạn 1 — nhập hàng và sửa chữa

- Thêm schema `PURCHASE_RECEIPT` và `REPAIR_INTAKE` vào `aiCaptureDrafts`.
- Đối chiếu hàng nhập với `productMaster`, `devices`, `imeiRegistry`, `partners`, `warehouses`.
- Chỉ sau xác nhận mới gọi `/api/inventory/purchase-orders/receive` hoặc API tạo work order kỹ thuật.
- Với nhiều ảnh, cho phép một bộ chứng từ tối đa 5 ảnh nhưng vẫn giới hạn tổng dung lượng và số lượt AI.

### Giai đoạn 2 — tài chính và thu cũ

- OCR biên lai thành phiếu thu/chi nháp, hiển thị chênh lệch tổng tiền và cảnh báo chứng từ trùng SHA-256.
- Ảnh thu cũ chỉ điền checklist và nhận dạng model/IMEI; giá mua cuối vẫn do chính sách + KCS + người duyệt.

### Giai đoạn 3 — nền tảng dùng chung

- Hàng đợi draft theo chi nhánh, trạng thái `DRAFT → REVIEWED → CONFIRMED → APPLIED/REJECTED`.
- Version schema/model/prompt trên từng draft để tái hiện kết quả.
- Dashboard đo tỷ lệ trường bị sửa, thời gian tiết kiệm và chi phí AI theo module.
- Chính sách retention file gốc; tự xóa file quá hạn nhưng giữ hash và audit record theo yêu cầu kế toán.
- Bộ test vàng với ảnh mờ, IMEI sai, tiền lệch, audio nhiễu và prompt injection trong tài liệu.

## Ranh giới an toàn

- Không đưa dữ liệu toàn hệ thống vào prompt; chỉ gửi file người dùng vừa chọn và ngữ cảnh tối thiểu.
- Không dùng nội dung trong ảnh/audio như chỉ dẫn điều khiển hệ thống.
- Không tự xác nhận hóa đơn, thanh toán, giá vốn, giá thu cũ hoặc trạng thái KCS.
- Không ghi trực tiếp Firestore từ trình duyệt; adapter áp dụng draft phải gọi API server-authoritative sẵn có.
- Mọi lần áp dụng draft phải idempotent và liên kết ngược tới file/hash gốc.

