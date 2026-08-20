import React, { useState } from 'react';
import { ChatConversation, ChatMessage } from '../types';
import { DeviceItem } from '../../../types';
import { ConversationListPanel } from './ConversationListPanel';
import { ChatStreamPanel } from './ChatStreamPanel';
import { ChatCustomerSidebar } from './ChatCustomerSidebar';

export interface OmnichannelChatViewProps {
  initialConversations?: ChatConversation[];
  devices: DeviceItem[];
  onConvertToPOS: (conversation: ChatConversation, selectedDevice?: DeviceItem) => void;
}

const DEFAULT_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'convo-fb-01',
    channel: 'FACEBOOK',
    customerName: 'Nguyễn Tiến Đạt',
    customerPhone: '0988123456',
    lastMessageSnippet: 'Shop ơi iPhone 15 Pro Max 256GB Titan bên mình còn máy đẹp không ạ?',
    lastMessageTime: 'Vừa xong',
    unreadCount: 1,
    interestedModel: 'iPhone 15 Pro Max 256GB',
    messages: [
      {
        id: 'm-1',
        sender: 'CUSTOMER',
        senderName: 'Nguyễn Tiến Đạt',
        content: 'Shop ơi iPhone 15 Pro Max 256GB Titan bên mình còn máy đẹp không ạ?',
        timestamp: '22:15'
      }
    ]
  },
  {
    id: 'convo-zalo-02',
    channel: 'ZALO',
    customerName: 'Chị Mai Linh',
    customerPhone: '0912345999',
    lastMessageSnippet: 'Gói bảo hành VIP 1 đổi 1 12 tháng bên mình áp dụng thế nào em?',
    lastMessageTime: '10 phút',
    unreadCount: 0,
    interestedModel: 'iPhone 14 Pro 128GB',
    messages: [
      {
        id: 'm-2',
        sender: 'CUSTOMER',
        senderName: 'Chị Mai Linh',
        content: 'Gói bảo hành VIP 1 đổi 1 12 tháng bên mình áp dụng thế nào em?',
        timestamp: '22:05'
      },
      {
        id: 'm-3',
        sender: 'STAFF',
        senderName: 'Tư Vấn PhoneHouse',
        content: 'Dạ gói VIP 1 đổi 1 trong 12 Tháng áp dụng đổi máy tương đương ngay lập tức nếu phát sinh bất kỳ lỗi phần cứng nào ạ!',
        timestamp: '22:07'
      }
    ]
  }
];

export const OmnichannelChatView: React.FC<OmnichannelChatViewProps> = ({
  initialConversations = DEFAULT_CONVERSATIONS,
  devices,
  onConvertToPOS
}) => {
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [mobilePanel, setMobilePanel] = useState<'LIST' | 'CHAT' | 'SIDEBAR'>('LIST');

  const activeConvo = conversations.find(c => c.id === selectedConvoId) || null;

  const handleSelectConversation = (convo: ChatConversation) => {
    setSelectedConvoId(convo.id);
    setMobilePanel('CHAT');
    // Mark as read
    setConversations(prev =>
      prev.map(c => (c.id === convo.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleSendMessage = (convoId: string, text: string) => {
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'STAFF',
      senderName: 'Tư Vấn PhoneHouse',
      content: text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setConversations(prev =>
      prev.map(c => {
        if (c.id === convoId) {
          return {
            ...c,
            lastMessageSnippet: text,
            lastMessageTime: 'Vừa xong',
            messages: [...c.messages, newMsg]
          };
        }
        return c;
      })
    );
  };

  const handleSendProductCard = (convoId: string, device: DeviceItem) => {
    const newMsg: ChatMessage = {
      id: `msg-card-${Date.now()}`,
      sender: 'STAFF',
      senderName: 'Tư Vấn PhoneHouse',
      content: `Dạ bên em đang có sẵn máy ${device.model} (${device.storage} - ${device.color}) tình trạng Pin ${device.batteryHealth || 100}%, giá cực tốt ạ:`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      productCard: {
        model: device.model,
        price: device.sellPrice || 0,
        color: device.color,
        storage: device.storage,
        batteryHealth: device.batteryHealth || 100
      }
    };

    setConversations(prev =>
      prev.map(c => {
        if (c.id === convoId) {
          return {
            ...c,
            lastMessageSnippet: `Đã gửi báo giá ${device.model}`,
            lastMessageTime: 'Vừa xong',
            messages: [...c.messages, newMsg]
          };
        }
        return c;
      })
    );
  };

  return (
    <div className="h-[calc(100vh-140px)] min-h-[580px]">
      {/* Mobile Master-Detail Views (lg:hidden) */}
      <div className="lg:hidden h-full">
        {mobilePanel === 'LIST' && (
          <ConversationListPanel
            conversations={conversations}
            selectedConversationId={selectedConvoId}
            onSelectConversation={handleSelectConversation}
          />
        )}

        {mobilePanel === 'CHAT' && (
          <ChatStreamPanel
            conversation={activeConvo}
            onSendMessage={handleSendMessage}
            onBack={() => setMobilePanel('LIST')}
            onOpenInfo={() => setMobilePanel('SIDEBAR')}
            onConvertToPOS={() => {
              if (activeConvo) onConvertToPOS(activeConvo);
            }}
          />
        )}

        {mobilePanel === 'SIDEBAR' && (
          <div className="h-full flex flex-col">
            <div className="bg-white p-2.5 border-b border-zinc-200 flex items-center justify-between">
              <button
                onClick={() => setMobilePanel('CHAT')}
                className="text-xs font-bold text-[#ff4b16] flex items-center space-x-1 cursor-pointer"
              >
                <span>❮ Quay lại đoạn chat</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ChatCustomerSidebar
                conversation={activeConvo}
                devices={devices}
                onSendProductCard={handleSendProductCard}
                onConvertToPOS={onConvertToPOS}
              />
            </div>
          </div>
        )}
      </div>

      {/* Desktop 3-Column Layout (hidden lg:grid) */}
      <div className="hidden lg:grid grid-cols-[300px_1fr_300px] gap-3.5 h-full">
        {/* Panel 1: Conversation List */}
        <ConversationListPanel
          conversations={conversations}
          selectedConversationId={selectedConvoId}
          onSelectConversation={handleSelectConversation}
        />

        {/* Panel 2: Chat Stream */}
        <ChatStreamPanel
          conversation={activeConvo}
          onSendMessage={handleSendMessage}
        />

        {/* Panel 3: Customer & Quotation Sidebar */}
        <ChatCustomerSidebar
          conversation={activeConvo}
          devices={devices}
          onSendProductCard={handleSendProductCard}
          onConvertToPOS={onConvertToPOS}
        />
      </div>
    </div>
  );
};
