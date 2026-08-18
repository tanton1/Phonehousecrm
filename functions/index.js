const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// API Webhook chuyên dụng nhận dữ liệu từ Pancake
exports.pancakeWebhook = functions.https.onRequest(async (req, res) => {
  // Pancake sẽ bắn Webhook dưới dạng phương thức POST
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const payload = req.body;
    
    // Pancake gửi data dạng body, kiểm tra trường event
    const event = payload.event || payload.type;
    
    // Xử lý sự kiện Có tin nhắn mới (hoặc tin nhắn từ nhân viên trả lời qua Pancake)
    if (event === "message_created" || event === "messages") {
      // Pancake struct phụ thuộc phiên bản API, ta lấy các field cơ bản
      const pageId = payload.page_id || payload.page_info?.id || "UNKNOWN_PAGE";
      const convId = payload.conversation_id || payload.thread_id;
      const messageData = payload.message || payload.message_data;
      const customerData = payload.customer || payload.sender;

      if (!convId || !messageData) {
        return res.status(400).send("Bad Request: Missing required conversation or message data");
      }

      // Tạo ID cuộc hội thoại map với Firebase của chúng ta
      const fbConvId = `CONV_PC_${convId}`;
      const nowStr = new Date().toISOString();

      // Kiểm tra xem tin nhắn đến từ Khách (Customer) hay Nhân viên (Staff)
      const isFromCustomer = messageData.from_customer || messageData.is_customer;
      
      const newMsg = {
        id: messageData.id || `MSG_${Date.now()}`,
        conversationId: fbConvId,
        sender: isFromCustomer ? "CUSTOMER" : "STAFF",
        senderName: isFromCustomer ? (customerData?.name || customerData?.full_name || "Khách hàng") : "Nhân viên (via Pancake)",
        content: messageData.message || (messageData.attachments ? "[Hình ảnh/File]" : ""),
        timestamp: messageData.inserted_at || messageData.created_time || nowStr,
        type: messageData.attachments?.length > 0 ? "image" : "text",
        status: "delivered"
      };

      const convRef = db.collection("chat_conversations").doc(fbConvId);

      // Chạy Transaction để đọc & ghi đồng thời, tránh đụng độ dữ liệu nếu nhận nhiều tin nhắn cùng lúc
      await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(convRef);
        
        if (!docSnap.exists) {
          // Chưa có hội thoại -> Tạo mới
          const newConv = {
            id: fbConvId,
            channel: "FACEBOOK", // Mặc định FB, nếu Pancake trả về nền tảng khác có thể map sau
            channelAccountName: `Pancake Page ID: ${pageId}`,
            channelExternalId: pageId,
            customer: {
              name: customerData?.name || customerData?.full_name || "Khách hàng",
              phone: customerData?.phone || customerData?.phone_number || "",
              avatar: customerData?.avatar_url || customerData?.profile_pic || "",
            },
            lastMessage: {
              content: newMsg.content,
              timestamp: newMsg.timestamp,
              sender: newMsg.sender,
              unread: isFromCustomer
            },
            unreadCount: isFromCustomer ? 1 : 0,
            status: "NEW",
            assignedStaff: {
              id: "SYSTEM_PANCAKE",
              name: "Chưa phân công"
            },
            tags: ["Từ Pancake"],
            createdAt: nowStr,
            updatedAt: nowStr,
            messages: [newMsg]
          };
          transaction.set(convRef, newConv);
        } else {
          // Đã có hội thoại -> Nối tin nhắn vào mảng hiện tại và cập nhật Last Message
          const convData = docSnap.data();
          const updatedMessages = [...(convData.messages || []), newMsg];
          const newUnreadCount = isFromCustomer ? (convData.unreadCount || 0) + 1 : 0;
          
          const updatePayload = {
            lastMessage: {
              content: newMsg.content,
              timestamp: newMsg.timestamp,
              sender: newMsg.sender,
              unread: isFromCustomer
            },
            unreadCount: newUnreadCount,
            updatedAt: nowStr,
            messages: updatedMessages
          };

          // Nếu Pancake có cập nhật SĐT, thì lưu bổ sung
          const phone = customerData?.phone || customerData?.phone_number;
          if (phone && !convData.customer?.phone) {
            updatePayload["customer.phone"] = phone;
          }

          transaction.update(convRef, updatePayload);
        }
      });
      
      return res.status(200).send({ success: true, message: "Pancake message processed and synced to Firestore" });
    }

    // Nếu là các event khác (vd: conversation_updated, customer_updated) -> return OK để Pancake ko gọi lại
    return res.status(200).send({ success: true, message: `Ignored event type: ${event}` });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).send("Internal Server Error");
  }
});
