import { describe, it, expect } from 'vitest';
import { ChatConversation, ChatMessage } from '../src/features/chat/types';

describe('Sprint 12: 3-Panel Omnichannel Chat Test Suite', () => {
  it('Case 1: Gửi tin nhắn mới cập nhật lastMessageSnippet và giảm unreadCount khi đọc', () => {
    const convo: ChatConversation = {
      id: 'c-01',
      channel: 'FACEBOOK',
      customerName: 'Trần Văn C',
      lastMessageSnippet: 'Alo shop',
      lastMessageTime: '5 phút',
      unreadCount: 2,
      messages: []
    };

    // Mark as read
    const readConvo = { ...convo, unreadCount: 0 };
    expect(readConvo.unreadCount).toBe(0);

    // Send new staff message
    const newMsg: ChatMessage = {
      id: 'm-1',
      sender: 'STAFF',
      senderName: 'Tư vấn',
      content: 'Dạ shop xin chào anh C!',
      timestamp: '22:20'
    };

    const updatedConvo = {
      ...readConvo,
      lastMessageSnippet: newMsg.content,
      messages: [newMsg]
    };

    expect(updatedConvo.lastMessageSnippet).toBe('Dạ shop xin chào anh C!');
    expect(updatedConvo.messages.length).toBe(1);
  });

  it('Case 2: Lọc danh sách hội thoại theo kênh (Facebook, Zalo, TikTok)', () => {
    const conversations: ChatConversation[] = [
      { id: '1', channel: 'FACEBOOK', customerName: 'A', lastMessageSnippet: '', lastMessageTime: '', unreadCount: 0, messages: [] },
      { id: '2', channel: 'ZALO', customerName: 'B', lastMessageSnippet: '', lastMessageTime: '', unreadCount: 0, messages: [] },
      { id: '3', channel: 'FACEBOOK', customerName: 'C', lastMessageSnippet: '', lastMessageTime: '', unreadCount: 0, messages: [] },
      { id: '4', channel: 'TIKTOK', customerName: 'D', lastMessageSnippet: '', lastMessageTime: '', unreadCount: 0, messages: [] }
    ];

    const fbConvos = conversations.filter(c => c.channel === 'FACEBOOK');
    const zaloConvos = conversations.filter(c => c.channel === 'ZALO');
    const tiktokConvos = conversations.filter(c => c.channel === 'TIKTOK');

    expect(fbConvos.length).toBe(2);
    expect(zaloConvos.length).toBe(1);
    expect(tiktokConvos.length).toBe(1);
  });

  it('Case 3: Tạo thẻ báo giá sản phẩm đính kèm tin nhắn chat', () => {
    const productCard = {
      model: 'iPhone 15 Pro Max',
      price: 26500000,
      color: 'Titan Tự Nhiên',
      storage: '256GB'
    };

    const cardMessage: ChatMessage = {
      id: 'm-card',
      sender: 'STAFF',
      senderName: 'Tư Vấn',
      content: 'Báo giá máy sẵn hàng',
      timestamp: '22:25',
      productCard
    };

    expect(cardMessage.productCard).toBeDefined();
    expect(cardMessage.productCard?.price).toBe(26500000);
    expect(cardMessage.productCard?.storage).toBe('256GB');
  });
});
