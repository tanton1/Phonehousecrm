export type ChatChannel = 'FACEBOOK' | 'INSTAGRAM' | 'ZALO' | 'TIKTOK' | 'WHATSAPP' | 'WEB';

export interface ChatMessage {
  id: string;
  sender: 'CUSTOMER' | 'STAFF' | 'BOT';
  senderName: string;
  content: string;
  timestamp: string;
  attachments?: string[];
  externalMessageId?: string;
  messageKind?: 'MESSAGE' | 'COMMENT';
  productCard?: {
    model: string;
    price: number;
    color?: string;
    storage?: string;
    batteryHealth?: number;
    imei?: string;
  };
}

export interface ChatConversation {
  id: string;
  pageId?: string;
  pageName?: string;
  externalConversationId?: string;
  branchId?: string;
  branchName?: string;
  conversationType?: 'INBOX' | 'COMMENT';
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
