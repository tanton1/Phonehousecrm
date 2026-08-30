# AI nhập liệu phiếu bán hàng và hội thoại

Tính năng nằm trong **Xem thêm → AI nhập liệu**.

- Ảnh phiếu: JPG/PNG/WEBP/HEIC, tối đa 3 MB.
- Ghi âm: MP3/WAV/M4A/OGG/WEBM, tối đa 3 MB.
- Gemini chỉ tạo bản nháp. Nhân viên phải kiểm tra, sửa và bấm **Xác nhận bản nháp**.
- Với phiếu bán, nút **Mở POS để đối chiếu** tự tìm IMEI/SKU trong tồn kho đang tải; dòng không khớp không được tự tạo.
- Không có bước nào tự ghi hóa đơn, thu tiền, công nợ hoặc lead CRM.

Máy chủ lưu hash, metadata, kết quả AI và bản đã nhân viên chỉnh sửa trong `aiCaptureDrafts`. File gốc được lưu private trong Cloud Storage tại `ai-captures/{uid}/...` khi Storage đã cấu hình. Nếu Storage tạm thời chưa sẵn sàng, việc phân tích vẫn trả bản nháp nhưng `storageSaved=false` để người vận hành biết.

Biến môi trường:

```text
GEMINI_API_KEY=...
GEMINI_CAPTURE_MODEL=gemini-2.5-flash
```

Các endpoint đều yêu cầu Firebase Auth và vai trò bán hàng/quản lý/CSKH. API có rate limit riêng và giới hạn MIME/kích thước trước khi gửi dữ liệu sang Gemini.

