# Tích hợp Pancake Webhook qua Firebase Cloud Functions

Thư mục này chứa mã nguồn **Firebase Cloud Functions** chuyên dụng để nhận dữ liệu từ **Pancake Webhook** và đồng bộ trực tiếp vào cơ sở dữ liệu Firestore của ứng dụng PhoneHouse CRM.

## Hướng dẫn 3 bước kết nối thực tế

### Bước 1: Khởi tạo và Deploy Firebase Functions
Vì hệ thống này chạy hoàn toàn độc lập ở Backend (Cloud), bạn cần deploy đoạn code này lên dự án Firebase của bạn.
Mở Terminal/Command Prompt trên máy tính và chạy các lệnh sau:

1. Cài đặt Firebase CLI (Nếu chưa có):
   ```bash
   npm install -g firebase-tools
   ```
2. Đăng nhập vào tài khoản Google chứa dự án Firebase:
   ```bash
   firebase login
   ```
3. Khởi tạo Firebase trong thư mục gốc của dự án này:
   ```bash
   firebase init functions
   # Chọn "Use an existing project" -> Chọn dự án ai-studio-iphoneshopcrmbui...
   # Chọn Javascript, và KHÔNG overwrite file package.json / index.js đã có.
   ```
4. Deploy function lên Cloud:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```
   **Lưu ý:** Firebase Functions (Node.js) hiện tại yêu cầu tài khoản Firebase ở gói **Blaze (Pay as you go)** để có thể deploy. Firebase miễn phí 2 triệu lượt gọi function mỗi tháng nên bạn không cần lo về chi phí ban đầu.

Sau khi deploy thành công, Firebase CLI sẽ trả về cho bạn một đường dẫn URL. 
Nó sẽ có dạng tương tự như: 
`https://us-central1-ai-studio-iphoneshopcrmbui-....cloudfunctions.net/pancakeWebhook`

### Bước 2: Dán Webhook URL vào cấu hình của Pancake
1. Đăng nhập vào giao diện **Pancake**.
2. Chọn Page mà bạn muốn đồng bộ.
3. Vào **Cài đặt (Settings)** -> Chọn mục **API / Tích hợp (Tùy phiên bản Pancake có thể nằm ở Cấu hình nâng cao)**.
4. Tìm ô nhập **Webhook URL** và dán cái URL (cloudfunctions.net) lấy được ở Bước 1 vào đó.
5. Tick chọn các sự kiện bạn muốn nhận (tối thiểu là `message_created`, `conversation_created`).
6. Nhấn Lưu lại.

### Bước 3: Cấu hình API gửi tin nhắn (Tùy chọn bổ sung)
Đoạn code trong `index.js` mới chỉ thực hiện việc **Nhận tin nhắn (Nhận Webhook)** để hiển thị lên màn hình CRM. 

Để nhân viên bấm nút "Gửi" trên CRM mà tin nhắn thực sự được chuyển qua Pancake và đến tay khách hàng, bạn sẽ cần làm 1 thao tác nhỏ ở thư mục **Frontend (`src/services/...`)**:
- Lấy **Page Access Token (API Token)** do Pancake cấp.
- Khi bấm gửi tin nhắn, Frontend gọi Axios POST Request đến API của Pancake (Ví dụ: `https://pages.fm/api/v1/pages/{page_id}/conversations/{conversation_id}/messages`).
- Sau khi Pancake báo gửi thành công, bạn cập nhật lại Firestore.

Hoàn tất! Giờ đây nhân viên của bạn có thể sử dụng giao diện Omnichannel của PhoneHouse CRM, còn việc giao tiếp ngầm với Facebook/Zalo sẽ do Pancake lo hoàn toàn.
