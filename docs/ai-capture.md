# AI nhập liệu ảnh và ghi âm

Tính năng nằm trong **Xem thêm → AI nhập liệu**.

- Bốn luồng: phiếu bán hàng, hội thoại CRM, phiếu nhập hàng và tiếp nhận sửa chữa.
- Ảnh phiếu: JPG/PNG/WEBP/HEIC, tối đa 3 MB; ghi âm: MP3/WAV/M4A/OGG/WEBM, tối đa 3 MB.
- Gemini chỉ tạo bản nháp. Nhân viên phải kiểm tra, sửa và bấm **Xác nhận bản nháp**.
- Với phiếu bán, nút **Mở POS để đối chiếu** tự tìm IMEI/SKU trong tồn kho đang tải; dòng không khớp không được tự tạo.
- AI không tự ghi hóa đơn, thu tiền, công nợ hoặc lead CRM.
- Với ghi âm hội thoại, sau khi xác nhận và bổ sung đủ tên + số điện thoại 10 số, nhân viên có thể bấm **Tạo lead CRM** để tạo lead và task phản hồi qua API CRM hiện hành.
- Với phiếu nhập hàng, nút **Mở phiếu nhập hàng** điền trước NCC, ngày/số chứng từ, thanh toán, giảm giá, ghi chú, SKU, IMEI và giá nhập. Dòng chưa khớp Product Master hoặc NCC được cảnh báo; chỉ nút xác nhận nhập kho trong form nghiệp vụ mới tạo phiếu/tồn/công nợ.
- Với tiếp nhận sửa chữa, nút **Mở tiếp nhận sửa chữa** điền trước khách, máy, nhóm lỗi, ngoại hình, phụ kiện, giá dự kiến, hẹn trả và transcript. KTV, kho KTV và việc kỹ thuật vẫn do nhân viên chọn; AI không tự tạo work order.

Máy chủ lưu hash, metadata, kết quả AI và bản đã nhân viên chỉnh sửa trong `aiCaptureDrafts`. File gốc được lưu private trong Cloud Storage tại `ai-captures/{uid}/...` khi Storage đã cấu hình. Nếu Storage tạm thời chưa sẵn sàng, việc phân tích vẫn trả bản nháp nhưng `storageSaved=false` để người vận hành biết.

API Capture dùng chung đúng cấu hình **Cài đặt → Thông báo Telegram & AI** (key mã hóa trong Firestore, base URL và model). Nếu chưa có cấu hình cơ sở dữ liệu, máy chủ tự dùng biến môi trường hiện hành:

```text
GEMINI_API_KEY=...
GEMINI_CAPTURE_MODEL=gemini-2.5-flash
```

`GET /api/ai/capture/status` chỉ trả trạng thái configured, provider, model và nguồn cấu hình; không trả API key. Các endpoint đều yêu cầu Firebase Auth và vai trò bán hàng/quản lý/CSKH. API có rate limit riêng và giới hạn MIME/kích thước trước khi gửi dữ liệu sang nhà cung cấp AI.
