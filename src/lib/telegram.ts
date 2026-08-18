/**
 * Gửi tin nhắn thông báo an toàn đến Telegram Admin qua Server Endpoint
 * @param message Nội dung tin nhắn
 */
export async function sendTelegramAlert(message: string) {
  try {
    const response = await fetch('/api/telegram/send-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message
      }),
    });

    const data = await response.json();
    if (!data.success) {
      console.warn("Telegram Alert Notice:", data.message || data.error);
      return { success: false, error: data.error };
    }
    
    return { success: true, data: data.result };
  } catch (error) {
    console.error("Lỗi gửi Telegram qua Server API:", error);
    return { success: false, error };
  }
}
