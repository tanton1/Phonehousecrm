export const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '';

/**
 * Gửi tin nhắn thông báo đến Telegram Admin
 * @param message Nội dung tin nhắn
 */
export async function sendTelegramAlert(message: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram Bot chưa được cấu hình. Vui lòng thêm VITE_TELEGRAM_BOT_TOKEN và VITE_TELEGRAM_CHAT_ID vào file .env");
    return { success: false, error: 'Chưa cấu hình Telegram Bot' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Lỗi gửi Telegram:", data.description);
      return { success: false, error: data.description };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error("Lỗi kết nối Telegram API:", error);
    return { success: false, error };
  }
}
