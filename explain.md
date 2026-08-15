- Chỗ trả trước chưa nhập được: Đã sửa lại state quản lý số tiền này trong màn hình thanh toán, giờ bạn có thể sửa trực tiếp số tiền hoặc hệ thống sẽ tự tính theo phần trăm.
- Lịch sử biến động: Đã thêm bảng Lịch sử Biến động công nợ trong chi tiết khách hàng và nhà cung cấp. Bảng này sẽ tự động sinh khi thanh toán, mua trả góp hoặc đối soát công nợ.
- Khách hàng kiêm NCC: 
Nếu khách đang là NCC -> hệ thống tự chuyển nhãn sang BOTH,
Tiền họ nợ sẽ cộng vào khoản nợ hiện tại, khi họ mua hàng (Trả góp) tiền sẽ tăng vào dư nợ, đồng thời ghi lại trong lịch sử biến động là Tăng công nợ (Mua nợ).
Khi mình mua hàng của họ, nếu trả góp hoặc chưa thanh toán, tiền sẽ tăng công nợ (Tăng nợ cho NCC).
Lúc thanh toán đối soát, hệ thống cho phép chọn là luồng thu (chủ yếu từ vai trò Khách) hoặc luồng chi (chủ yếu từ vai trò NCC). Quỹ sẽ tăng giảm tương ứng và lưu lịch sử đầy đủ.
