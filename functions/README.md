# ĐÃ NGỪNG SỬ DỤNG — KHÔNG DEPLOY

Firebase Function Pancake cũ đã bị vô hiệu hóa vì không xác thực chữ ký và lưu tin nhắn theo mảng không giới hạn.

- Không chạy `firebase deploy --only functions` từ thư mục này.
- Webhook hợp lệ nằm trong Express API của PhoneHouseCRM.
- `firebase.json` cố ý không khai báo Functions.
- `index.js` chỉ còn phản hồi `410 LEGACY_PANCAKE_WEBHOOK_RETIRED` để tránh khôi phục nhầm đường webhook cũ.
