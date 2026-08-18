export type ChatChannel = 'FACEBOOK' | 'ZALO' | 'TIKTOK' | 'WEB';

export interface ChatMessage {
  id: string;
  sender: 'CUSTOMER' | 'STAFF' | 'BOT';
  senderName: string;
  content: string;
  timestamp: string;
  attachments?: string[];
  productCard?: {
    model: string;
    price: number;
    color?: string;
    storage?: string;
    imei?: string;
  };
}

export interface ChatConversation {
  id: string;
  channel: ChatChannel;
  customerName: string;
  customerPhone?: string;
  avatarUrl?: string;
  lastMessageSnippet: string;
  lastMessageTime: string;
  unreadCount: number;
  assignedStaff?: string;
  interestedModel?: string;
  suggestedPrice?: number;
  messages: ChatMessage[];
}

export interface QuickSnippet {
  id: string;
  label: string;
  content: string;
  category: 'GREETING' | 'PRICE' | 'WARRANTY' | 'INSTALLMENT' | 'STORE_ADDRESS';
}
