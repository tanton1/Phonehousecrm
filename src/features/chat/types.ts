export type ChatChannel = 'FACEBOOK' | 'INSTAGRAM' | 'ZALO' | 'TIKTOK' | 'WHATSAPP' | 'WEB';
export type ChatWorkflowStatus = 'NEW' | 'OPEN' | 'WAITING_CUSTOMER' | 'FOLLOW_UP' | 'WON' | 'LOST' | 'CLOSED';
export type ChatPriority = 'NORMAL' | 'HIGH' | 'URGENT';

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
  provider?: 'PANCAKE' | 'META_MESSENGER' | 'ZALO_OA';
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
  assignedStaffId?: string;
  assignedStaffName?: string;
  workflowStatus?: ChatWorkflowStatus;
  priority?: ChatPriority;
  firstResponseDueAt?: string;
  firstResponseAt?: string;
  firstCustomerMessageAt?: string;
  lastCustomerMessageAt?: string;
  lastStaffMessageAt?: string;
  nextFollowUpAt?: string;
  awaitingStaffReply?: boolean;
  firstResponseSeconds?: number;
  slaMet?: boolean;
  outcomeNote?: string;
  interestedModel?: string;
  suggestedPrice?: number;
  threadControlStatus?: 'OWNED' | 'OTHER_APP' | 'AVAILABLE';
  lastSendError?: string;
  messages: ChatMessage[];
}

export interface QuickSnippet {
  id: string;
  label: string;
  content: string;
  category: 'GREETING' | 'PRICE' | 'WARRANTY' | 'INSTALLMENT' | 'STORE_ADDRESS';
}
