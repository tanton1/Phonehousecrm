import React, { useState, useEffect, useRef } from 'react';
import { 
  ChatConversation, 
  ChatMessage, 
  ChannelConnectionConfig, 
  ChatChannelType, 
  ConversationStatus, 
  DeviceItem, 
  StoreBranch,
  Lead,
  SalesInvoice
} from '../types';
import { 
  INITIAL_CHANNEL_CONNECTIONS, 
  QUICK_RESPONSE_TEMPLATES 
} from '../data/omnichannelData';
import { subscribeToChatConversations, sendMessageToChat } from '../services/firestoreService';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Filter, 
  RefreshCw, 
  Sparkles, 
  Smartphone, 
  DollarSign, 
  Phone, 
  CheckCircle2, 
  Clock, 
  User, 
  Bot, 
  Plus, 
  SlidersHorizontal, 
  Check, 
  Copy, 
  Image as ImageIcon, 
  ExternalLink, 
  Flame, 
  Tag, 
  ShieldCheck, 
  Layers, 
  ShoppingCart, 
  ArrowRight, 
  ChevronRight, 
  Zap, 
  AlertCircle, 
  Store, 
  Share2, 
  X, 
  Info,
  Calendar,
  CheckCheck
} from 'lucide-react';

export interface OmnichannelChatViewProps {
  devices?: DeviceItem[];
  branches?: StoreBranch[];
  leads?: Lead[];
  invoices?: SalesInvoice[];
  currentUser?: any;
  onConvertChatToPOS?: (device: DeviceItem, customer: { name: string; phone: string }) => void;
  onConvertChatToLead?: (lead: Lead) => void;
  onConvertChatToTradeIn?: (customerName: string, phone: string, oldModel: string) => void;
}

export const OmnichannelChatView: React.FC<OmnichannelChatViewProps> = ({
  devices = [],
  branches = [],
  leads = [],
  invoices = [],
  currentUser,
  onConvertChatToPOS,
  onConvertChatToLead,
  onConvertChatToTradeIn
}) => {
  // Main Data States
  const [channels, setChannels] = useState<ChannelConnectionConfig[]>(INITIAL_CHANNEL_CONNECTIONS);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');

  useEffect(() => {
    const unsubscribe = subscribeToChatConversations((data) => {
      setConversations(data);
      if (data.length > 0 && !activeConversationId) {
        setActiveConversationId(data[0].id);
      }
    });
    return () => unsubscribe();
  }, [activeConversationId]);

  // Filters & Search
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<'ALL' | ChatChannelType>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | ConversationStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Chat Input State
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // Sync Animation & Notification State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Modal / Drawer States
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState<boolean>(false);
  const [isQuickTemplateOpen, setIsQuickTemplateOpen] = useState<boolean>(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState<boolean>(false);
  const [isTradeInModalOpen, setIsTradeInModalOpen] = useState<boolean>(false);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  // TradeIn Calculation helper in chat
  const [tradeInForm, setTradeInForm] = useState({
    oldModel: 'iPhone 14 Pro Max 256GB Deep Purple',
    batteryHealth: 87,
    estimatedPrice: 17200000,
    targetModel: 'iPhone 16 Pro Max 256GB Desert Titan',
    targetPrice: 34490000
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Active selected conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0];

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // Handle Synchronize All Channels
  const handleSyncChannels = () => {
    setIsSyncing(true);
    setSyncNotice('Đang kết nối API Facebook Meta, Zalo OA, TikTok Shop, Web Widget...');

    setTimeout(() => {
      setIsSyncing(false);
      setSyncNotice('✅ Đã đồng bộ thành công 6 kênh dữ liệu! Cập nhật 12 tin nhắn mới nhất.');
      
      // Update channel sync times
      setChannels(channels.map(c => ({
        ...c,
        lastSyncedAt: 'Vừa xong (Realtime)'
      })));

      setTimeout(() => setSyncNotice(null), 4000);
    }, 1200);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeConversation) return;

    const newMsg: ChatMessage = {
      id: `MSG_${Date.now()}`,
      conversationId: activeConversation.id,
      sender: 'STAFF',
      senderName: currentUser?.displayName || 'Tuấn Bán Hàng',
      senderAvatar: currentUser?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
      status: 'sending'
    };

    setInputText('');
    setIsSending(true);

    try {
      await sendMessageToChat(activeConversation.id, newMsg);
      // Giả lập độ trễ báo qua Pancake (nếu gọi API)
      setTimeout(async () => {
        setIsSending(false);
      }, 500);
    } catch (err) {
      console.error(err);
      setIsSending(false);
    }
  };

  // Handle AI Reply Generation
  const handleGenerateAiReply = () => {
    if (!activeConversation) return;
    setIsAiGenerating(true);

    setTimeout(() => {
      let suggestedReply = '';
      const custName = activeConversation.customer.name;
      const prod = activeConversation.interestedProduct?.model || 'iPhone 16 Pro Max';

      if (activeConversation.channel === 'FACEBOOK') {
        suggestedReply = `Dạ em chào anh ${custName} ạ! Cây ${prod} bản VN/A bên em đang có sẵn 3 máy tại PhoneHouse Cầu Giấy. Đối với cây ${activeConversation.tradeInOffer?.oldModel || 'máy cũ'}, bên em đang có chương trình trợ giá thu cũ lên đời thêm 2.000.000đ trực tiếp vào giá máy mới. Chiều nay tầm 15h hay 17h anh Nam tiện ghé qua shop để các bạn kỹ thuật kiểm tra và chuyển dữ liệu miễn phí luôn ạ?`;
      } else if (activeConversation.channel === 'ZALO') {
        suggestedReply = `Dạ PhoneHouse chào chị ${custName} ạ! Với cây ${prod}, bên em hỗ trợ duyệt hồ sơ trả góp 0% online qua thẻ Vietcombank trong 5 phút. Chị chỉ cần thanh toán mỗi tháng khoảng ${(Math.round(24500000 / 12)).toLocaleString('vi-VN')}đ (kỳ hạn 12 tháng) không phụ phí. Em gửi chị link đăng ký duyệt trước nhé ạ!`;
      } else if (activeConversation.channel === 'TIKTOK') {
        suggestedReply = `Dạ chào bạn ${custName} ạ! Combo quà tặng Live Stream củ sạc 20W Anker + Dán cường lực KingKong trọn đời bên mình vẫn đang giữ cho bạn khi chốt giữ máy hôm nay ạ. Bạn cho mình xin địa chỉ hoặc chi nhánh muốn ghé nhận máy nhé!`;
      } else {
        suggestedReply = `Dạ chào anh/chị ạ! Cây ${prod} tình trạng Zin Keng bên em cam kết bảo hành 12 tháng phần cứng toàn diện, 1 đổi 1 trong 30 ngày. Em có thể giữ máy cho anh/chị ghé trải nghiệm trong chiều nay nhé ạ!`;
      }

      setInputText(suggestedReply);
      setIsAiGenerating(false);
    }, 700);
  };

  // Send Product Card from Inventory
  const handleSendProductCard = (device: DeviceItem) => {
    if (!activeConversation) return;

    const newMsg: ChatMessage = {
      id: `MSG_PROD_${Date.now()}`,
      conversationId: activeConversation.id,
      sender: 'STAFF',
      senderName: currentUser?.displayName || 'Tuấn Bán Hàng',
      content: `Gửi thông tin thiết bị: ${device.model} (${device.color} - ${device.storage})`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      type: 'product_card',
      productData: {
        name: `${device.model} ${device.storage} ${device.color}`,
        price: device.sellPrice,
        image: device.imageUrl || 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300',
        imei: device.imei,
        storage: device.storage,
        condition: device.condition,
        inStock: device.status === 'in_stock',
        warehouseName: device.warehouse || 'Kho Chi Nhánh Cầu Giấy'
      },
      status: 'delivered'
    };

    setConversations(conversations.map(c => {
      if (c.id === activeConversation.id) {
        return {
          ...c,
          messages: [...c.messages, newMsg],
          lastMessage: {
            content: `[Báo giá] ${device.model} - ${device.sellPrice.toLocaleString('vi-VN')}đ`,
            timestamp: newMsg.timestamp,
            sender: 'STAFF',
            unread: false
          }
        };
      }
      return c;
    }));

    setIsProductPickerOpen(false);
  };

  // Send Trade-In Quote Card
  const handleSendTradeInQuote = () => {
    if (!activeConversation) return;

    const gap = Math.max(0, tradeInForm.targetPrice - tradeInForm.estimatedPrice);
    const monthly = Math.round(gap / 12);

    const newMsg: ChatMessage = {
      id: `MSG_QUOTE_${Date.now()}`,
      conversationId: activeConversation.id,
      sender: 'STAFF',
      senderName: currentUser?.displayName || 'Tuấn Bán Hàng',
      content: `Bảng định giá Thu Cũ Đổi Mới trợ giá 2.000.000đ`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      type: 'quote_card',
      quoteData: {
        oldDeviceName: tradeInForm.oldModel,
        tradeInEstimated: tradeInForm.estimatedPrice,
        newDeviceName: tradeInForm.targetModel,
        newDevicePrice: tradeInForm.targetPrice,
        priceGap: gap,
        installmentMonthly: monthly
      },
      status: 'delivered'
    };

    setConversations(conversations.map(c => {
      if (c.id === activeConversation.id) {
        return {
          ...c,
          messages: [...c.messages, newMsg],
          tradeInOffer: {
            oldModel: tradeInForm.oldModel,
            estimatedPrice: tradeInForm.estimatedPrice,
            status: 'EVALUATING'
          },
          lastMessage: {
            content: `[Bảng Thu Cũ] Bù chênh lệch: ${gap.toLocaleString('vi-VN')}đ`,
            timestamp: newMsg.timestamp,
            sender: 'STAFF',
            unread: false
          }
        };
      }
      return c;
    }));

    setIsTradeInModalOpen(false);
  };

  // Filter Conversations
  const filteredConversations = conversations.filter(c => {
    const matchesChannel = selectedChannelFilter === 'ALL' || c.channel === selectedChannelFilter;
    const matchesStatus = selectedStatusFilter === 'ALL' || c.status === selectedStatusFilter;
    const matchesSearch = 
      c.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.customer.phone && c.customer.phone.includes(searchQuery)) ||
      (c.interestedProduct?.model && c.interestedProduct.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.lastMessage.content.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesChannel && matchesStatus && matchesSearch;
  });

  // Channel helper icons & badges
  const getChannelBadge = (channel: ChatChannelType) => {
    switch (channel) {
      case 'FACEBOOK':
        return <span className="bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />Facebook</span>;
      case 'ZALO':
        return <span className="bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />Zalo OA</span>;
      case 'TIKTOK':
        return <span className="bg-black/10 text-zinc-900 border border-zinc-400/40 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-black" />TikTok</span>;
      case 'WEB':
        return <span className="bg-orange-500/10 text-orange-600 border border-orange-300 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />LiveChat</span>;
      case 'SHOPEE':
        return <span className="bg-[#EE4D2D]/10 text-[#EE4D2D] border border-[#EE4D2D]/30 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#EE4D2D]" />Shopee</span>;
      case 'INSTAGRAM':
        return <span className="bg-[#E4405F]/10 text-[#E4405F] border border-[#E4405F]/30 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#E4405F]" />Instagram</span>;
      default:
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{channel}</span>;
    }
  };

  const getStatusBadge = (status: ConversationStatus) => {
    switch (status) {
      case 'NEW':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Mới Nhận</span>;
      case 'IN_PROGRESS':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Đang Tư Vấn</span>;
      case 'APPOINTMENT_SET':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Đã Hẹn Shop</span>;
      case 'DEPOSIT_PAID':
        return <span className="bg-orange-50 text-orange-800 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Đã Đặt Cọc</span>;
      case 'WON':
        return <span className="bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Đã Chốt Sale</span>;
      case 'CLOSED':
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Đã Đóng</span>;
      default:
        return null;
    }
  };

  const totalUnreadCount = conversations.reduce((acc, cur) => acc + cur.unreadCount, 0);

  return (
    <div className="w-full space-y-4 font-sans animate-fadeIn">
      
      {/* 1. TOP UNIFIED OMNICHANNEL BAR */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Identity */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-500/20 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  OMNICHANNEL CRM
                </span>
                <span className="bg-orange-50 text-[#FF4B16] border border-orange-200 text-[11px] font-black px-2 py-0.5 rounded-md">
                  Đồng Bộ Đa Kênh Tức Thời
                </span>
                {totalUnreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                    {totalUnreadCount} tin mới
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-black text-zinc-900 mt-0.5">
                Hộp Thư Chat Đa Kênh Hợp Nhất (Omnichannel Inbox)
              </h1>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync All Channels Button */}
            <button
              onClick={handleSyncChannels}
              disabled={isSyncing}
              className={`bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-xs font-black px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer ${
                isSyncing ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang Quét Đa Kênh...' : '⚡ Đồng Bộ Đa Kênh'}</span>
            </button>

            {/* Channels Configuration Button */}
            <button
              onClick={() => setIsChannelSettingsOpen(true)}
              className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-zinc-600" />
              <span>Kết Nối Kênh ({channels.filter(c => c.status === 'CONNECTED').length}/6)</span>
            </button>
          </div>
        </div>

        {/* Sync Notice Alert if available */}
        {syncNotice && (
          <div className="mt-3 p-2.5 bg-orange-50 border border-orange-200 text-orange-900 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-600 shrink-0" />
              <span>{syncNotice}</span>
            </div>
            <button onClick={() => setSyncNotice(null)} className="text-orange-700 hover:text-orange-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Channel Status Quick Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pt-3 mt-3 border-t border-zinc-100 pb-0.5 scrollbar-thin">
          <span className="text-[11px] font-bold text-zinc-400 shrink-0 uppercase tracking-wider">
            Kênh Đang Hoạt Động:
          </span>
          {channels.map(chan => (
            <div
              key={chan.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-700 shrink-0 shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <strong className="font-bold text-[11px]">{chan.name.split(' ')[0]}</strong>
              <span className="text-[10px] text-zinc-400">({chan.totalMessagesSynced})</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 3-COLUMN OMNICHANNEL WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[calc(100vh-230px)] min-h-[640px]">
        
        {/* ============================================================== */}
        {/* LEFT COLUMN: CONVERSATION LIST (4 COLS)                         */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col overflow-hidden h-full">
          
          {/* Header & Search */}
          <div className="p-3 border-b border-zinc-100 space-y-2.5 bg-zinc-50/50 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm khách hàng, SĐT, máy quan tâm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-orange-500 shadow-2xs font-medium"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Channel Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedChannelFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChannelFilter === 'ALL'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Tất cả ({conversations.length})
              </button>
              <button
                onClick={() => setSelectedChannelFilter('FACEBOOK')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChannelFilter === 'FACEBOOK'
                    ? 'bg-[#F97316] text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Facebook
              </button>
              <button
                onClick={() => setSelectedChannelFilter('ZALO')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChannelFilter === 'ZALO'
                    ? 'bg-[#F97316] text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Zalo OA
              </button>
              <button
                onClick={() => setSelectedChannelFilter('TIKTOK')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChannelFilter === 'TIKTOK'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                TikTok
              </button>
              <button
                onClick={() => setSelectedChannelFilter('WEB')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChannelFilter === 'WEB'
                    ? 'bg-[#FF4B16] text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Web
              </button>
            </div>
          </div>

          {/* Conversation List Scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 custom-scrollbar">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-xs">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p>Không tìm thấy cuộc hội thoại nào phù hợp.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = activeConversationId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id);
                      // Mark as read
                      setConversations(conversations.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
                    }}
                    className={`p-3 transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-orange-50/70 border-l-4 border-l-[#FF4B16]'
                        : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar & Channel Badge */}
                      <div className="relative shrink-0">
                        <img
                          src={conv.customer.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                          alt={conv.customer.name}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-200"
                        />
                        {/* Channel source badge dot */}
                        <div className="absolute -bottom-1 -right-1">
                          {getChannelBadge(conv.channel)}
                        </div>
                      </div>

                      {/* Info & Snippet */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className={`text-xs font-black truncate ${isSelected ? 'text-zinc-900' : 'text-zinc-800'}`}>
                            {conv.customer.name}
                          </h4>
                          <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
                            {conv.lastMessage.timestamp}
                          </span>
                        </div>

                        {/* Interested Product or Tags */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {conv.interestedProduct && (
                            <span className="text-[10px] font-bold text-[#FF4B16] bg-orange-50 px-1.5 py-0.2 rounded truncate">
                              📱 {conv.interestedProduct.model}
                            </span>
                          )}
                          {conv.customer.isVip && (
                            <span className="text-[9px] font-black text-orange-700 bg-orange-100 px-1 py-0.2 rounded">
                              VIP
                            </span>
                          )}
                        </div>

                        {/* Last message snippet */}
                        <p className={`text-xs truncate mt-1 ${
                          conv.unreadCount > 0 ? 'font-bold text-zinc-900' : 'text-zinc-500'
                        }`}>
                          {conv.lastMessage.sender === 'STAFF' && <span className="text-zinc-400">Bạn: </span>}
                          {conv.lastMessage.sender === 'AI_BOT' && <span className="text-orange-500">AI: </span>}
                          {conv.lastMessage.content}
                        </p>
                      </div>

                      {/* Unread Counter Badge */}
                      {conv.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* CENTER COLUMN: ACTIVE CHAT CONVERSATION (5 COLS)                */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col overflow-hidden h-full">
          
          {activeConversation ? (
            <>
              {/* Chat Top Header */}
              <div className="p-3 sm:px-4 sm:py-3 border-b border-zinc-100 bg-zinc-50/70 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={activeConversation.customer.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                      alt={activeConversation.customer.name}
                      className="w-10 h-10 rounded-full object-cover border border-zinc-200"
                    />
                    <div className="absolute -bottom-1 -right-1">
                      {getChannelBadge(activeConversation.channel)}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black text-zinc-900 truncate">
                        {activeConversation.customer.name}
                      </h3>
                      {getStatusBadge(activeConversation.status)}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 truncate mt-0.5">
                      <span>Nguồn: <strong>{activeConversation.channelAccountName}</strong></span>
                      {activeConversation.customer.phone && (
                        <span className="text-zinc-700 font-bold font-mono">
                          • {activeConversation.customer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Status Change */}
                <select
                  value={activeConversation.status}
                  onChange={(e) => {
                    const newStatus = e.target.value as ConversationStatus;
                    setConversations(conversations.map(c => c.id === activeConversation.id ? { ...c, status: newStatus } : c));
                  }}
                  className="text-xs font-bold bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-zinc-800 shadow-2xs focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  <option value="NEW">Mới Nhận</option>
                  <option value="IN_PROGRESS">Đang Tư Vấn</option>
                  <option value="APPOINTMENT_SET">Đã Hẹn Shop</option>
                  <option value="DEPOSIT_PAID">Đã Giữ Cọc</option>
                  <option value="WON">Đã Chốt Sale</option>
                  <option value="CLOSED">Đã Đóng</option>
                </select>
              </div>

              {/* Chat Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/30 custom-scrollbar">
                {/* AI Summary Banner at Top */}
                {activeConversation.aiSummary && (
                  <div className="p-2.5 rounded-xl bg-orange-50/80 border border-orange-200 text-xs text-orange-950 flex items-start gap-2 shadow-2xs">
                    <Sparkles className="w-4 h-4 text-[#FF4B16] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-extrabold text-[#FF4B16] block">AI Phân Tích Nhu Cầu & Tâm Lý Khách:</strong>
                      <p className="text-[11px] text-zinc-700 mt-0.5 leading-relaxed">
                        {activeConversation.aiSummary}
                      </p>
                    </div>
                  </div>
                )}

                {activeConversation.messages.map((msg) => {
                  const isStaff = msg.sender === 'STAFF';
                  const isAi = msg.sender === 'AI_BOT';
                  const isCustomer = msg.sender === 'CUSTOMER';

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isStaff || isAi ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Avatar for customer */}
                      {isCustomer && (
                        <img
                          src={activeConversation.customer.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                          alt={msg.senderName}
                          className="w-7 h-7 rounded-full object-cover border border-zinc-200 mt-1 shrink-0"
                        />
                      )}

                      <div className={`max-w-[82%] space-y-1 ${isStaff ? 'items-end' : 'items-start'}`}>
                        {/* Sender name & time */}
                        <div className={`flex items-center gap-1.5 text-[10px] text-zinc-400 ${isStaff ? 'justify-end' : 'justify-start'}`}>
                          <span>{msg.senderName}</span>
                          <span>•</span>
                          <span>{msg.timestamp}</span>
                        </div>

                        {/* Content: Text */}
                        {msg.type === 'text' && (
                          <div
                            className={`p-3 rounded-2xl text-xs leading-relaxed ${
                              isStaff
                                ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white rounded-tr-xs shadow-xs font-medium'
                                : isAi
                                ? 'bg-rose-50 text-rose-950 border border-rose-200 rounded-tr-xs font-medium'
                                : 'bg-white text-zinc-900 border border-zinc-200/80 rounded-tl-xs shadow-2xs font-medium'
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}

                        {/* Content: Product Card */}
                        {msg.type === 'product_card' && msg.productData && (
                          <div className="bg-white rounded-2xl p-3 border border-orange-200 shadow-sm space-y-2 max-w-sm">
                            <div className="flex items-center gap-3">
                              <img
                                src={msg.productData.image}
                                alt={msg.productData.name}
                                className="w-14 h-14 rounded-xl object-cover border border-zinc-100 shrink-0"
                              />
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-zinc-900 truncate">
                                  {msg.productData.name}
                                </h5>
                                <div className="text-xs font-extrabold text-[#FF4B16] font-mono mt-0.5">
                                  {msg.productData.price.toLocaleString('vi-VN')} đ
                                </div>
                                <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.2 rounded font-bold">
                                  ✓ Sẵn hàng tại {msg.productData.warehouseName}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (onConvertChatToPOS) {
                                  const dev = devices.find(d => d.model.includes(msg.productData!.name)) || {
                                    id: `DEV_POS_${Date.now()}`,
                                    imei: '358992144001',
                                    serialNo: 'SN123456',
                                    model: msg.productData!.name,
                                    storage: msg.productData!.storage || '256GB',
                                    color: 'Titan Tự Nhiên',
                                    region: 'VN/A',
                                    batteryHealth: 100,
                                    condition: 'New Seal',
                                    buyPrice: msg.productData!.price * 0.9,
                                    sellPrice: msg.productData!.price,
                                    status: 'in_stock',
                                    supplier: 'Apple Store VN',
                                    receivedDate: '2026-08-16',
                                    warrantyPeriodMonths: 12,
                                    icloudStatus: 'Clean / Đã Thoát',
                                    screenStatus: 'Zin Màn Keng'
                                  };
                                  onConvertChatToPOS(dev, {
                                    name: activeConversation.customer.name,
                                    phone: activeConversation.customer.phone || '0900000000'
                                  });
                                }
                              }}
                              className="w-full py-1.5 bg-orange-50 hover:bg-orange-100 text-[#FF4B16] text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 border border-orange-200 cursor-pointer"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Mở Đơn Bán POS Với Máy Này</span>
                            </button>
                          </div>
                        )}

                        {/* Content: Trade-in Quote Card */}
                        {msg.type === 'quote_card' && msg.quoteData && (
                          <div className="bg-gradient-to-br from-orange-50 to-orange-50/60 rounded-2xl p-3.5 border border-orange-200 shadow-sm space-y-2 max-w-sm text-xs">
                            <div className="flex items-center justify-between border-b border-orange-200/60 pb-1.5">
                              <span className="font-extrabold text-orange-900 flex items-center gap-1">
                                <RefreshCw className="w-3.5 h-3.5 text-[#FF4B16]" />
                                Bảng Định Giá Thu Cũ Đổi Mới
                              </span>
                              <span className="text-[10px] bg-orange-200/80 text-orange-900 px-1.5 py-0.2 rounded font-black">
                                Trợ giá +2.000.000đ
                              </span>
                            </div>

                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-zinc-500">Máy cũ thu lại:</span>
                                <strong className="text-zinc-800">{msg.quoteData.oldDeviceName}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-zinc-500">Định giá tạm tính:</span>
                                <span className="text-orange-700 font-bold font-mono">
                                  {msg.quoteData.tradeInEstimated?.toLocaleString('vi-VN')} đ
                                </span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-orange-200/40">
                                <span className="text-zinc-500">Lên đời máy mới:</span>
                                <strong className="text-[#FF4B16]">{msg.quoteData.newDeviceName}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-zinc-900 font-extrabold">Bù chênh lệch:</span>
                                <span className="text-rose-600 font-black font-mono text-xs">
                                  {msg.quoteData.priceGap?.toLocaleString('vi-VN')} đ
                                </span>
                              </div>
                              <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                                <span>Trả góp 0% (12 tháng):</span>
                                <span className="font-bold text-zinc-800">
                                  Chỉ {msg.quoteData.installmentMonthly?.toLocaleString('vi-VN')} đ / tháng
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Quick Action Bar */}
              <div className="px-3 pt-2 pb-1 bg-white border-t border-zinc-100 flex items-center gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
                {/* AI Reply Copilot Button */}
                <button
                  onClick={handleGenerateAiReply}
                  disabled={isAiGenerating}
                  className="px-2.5 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF4B16] border border-orange-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs active:scale-95 transition-all"
                  title="AI tự động soạn câu trả lời chốt deal dựa trên ngữ cảnh chat"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                  <span>{isAiGenerating ? 'AI Đang Soạn...' : 'AI Gợi Ý Câu Trả Lời'}</span>
                </button>

                {/* Send Product Card */}
                <button
                  onClick={() => setIsProductPickerOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Gửi báo giá sản phẩm trực tiếp từ kho"
                >
                  <Smartphone className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Gửi Thẻ Báo Giá</span>
                </button>

                {/* Send Trade-In Appraisal Card */}
                <button
                  onClick={() => setIsTradeInModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Gửi bảng tính Thu Cũ Đổi Mới và bù chênh lệch"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                  <span>Bảng Thu Cũ</span>
                </button>

                {/* Quick Response Templates */}
                <button
                  onClick={() => setIsQuickTemplateOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Chọn câu trả lời mẫu có sẵn"
                >
                  <Zap className="w-3.5 h-3.5 text-orange-500" />
                  <span>Mẫu Trả Lời</span>
                </button>
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-zinc-100 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Nhập tin nhắn phản hồi khách hàng đa kênh (Enter để gửi)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500 shadow-2xs font-medium"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className={`bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white p-2.5 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer ${
                    !inputText.trim() ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs p-8 text-center">
              Chọn một cuộc trò chuyện để bắt đầu tương tác đa kênh.
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: CUSTOMER 360 & SALES CONTEXT (3 COLS)            */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col overflow-hidden h-full">
          
          {activeConversation ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              
              {/* Customer Profile Card */}
              <div className="text-center pb-3 border-b border-zinc-100">
                <img
                  src={activeConversation.customer.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                  alt={activeConversation.customer.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-orange-400 mx-auto shadow-xs"
                />
                <h3 className="text-sm font-black text-zinc-900 mt-2">
                  {activeConversation.customer.name}
                </h3>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  {getChannelBadge(activeConversation.channel)}
                  {activeConversation.customer.isVip && (
                    <span className="bg-orange-100 text-orange-900 text-[10px] font-black px-1.5 py-0.2 rounded">
                      ⭐ VIP
                    </span>
                  )}
                </div>

                {activeConversation.customer.phone && (
                  <a
                    href={`tel:${activeConversation.customer.phone}`}
                    className="inline-flex items-center gap-1 text-xs text-[#FF4B16] font-bold font-mono hover:underline mt-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{activeConversation.customer.phone}</span>
                  </a>
                )}
              </div>

              {/* 360 Stats */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] text-zinc-400 font-bold block">Tổng Chi Tiêu</span>
                  <strong className="text-xs font-black text-zinc-900 font-mono">
                    {(activeConversation.customer.totalSpent || 0).toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-[10px] text-zinc-400 font-bold block">Số Đơn Đã Mua</span>
                  <strong className="text-xs font-black text-zinc-900">
                    {activeConversation.customer.orderCount || 0} Đơn
                  </strong>
                </div>
              </div>

              {/* Interested Device & Store Location */}
              <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 space-y-1.5 text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4B16] block">
                  Thiết Bị Quan Tâm
                </span>
                <strong className="text-zinc-900 font-bold block">
                  {activeConversation.interestedProduct?.model || 'iPhone 16 Pro Max 256GB'}
                </strong>
                {activeConversation.interestedProduct?.budget && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Ngân sách:</span>
                    <span className="text-orange-600 font-bold font-mono">
                      {activeConversation.interestedProduct.budget.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] pt-1 border-t border-orange-200/50">
                  <span className="text-zinc-500">Chi nhánh:</span>
                  <strong className="text-zinc-800">{activeConversation.branchName || 'PhoneHouse Cầu Giấy'}</strong>
                </div>
              </div>

              {/* Trade-in Status if any */}
              {activeConversation.tradeInOffer && (
                <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-900">
                      Thu Cũ Đang Định Giá
                    </span>
                    <span className="text-[10px] bg-orange-200 text-orange-900 px-1.5 py-0.2 rounded font-bold">
                      Pin {activeConversation.tradeInOffer.batteryHealth || 87}%
                    </span>
                  </div>
                  <strong className="text-zinc-900 font-bold block">
                    {activeConversation.tradeInOffer.oldModel}
                  </strong>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Định giá:</span>
                    <span className="text-orange-700 font-bold font-mono">
                      {activeConversation.tradeInOffer.estimatedPrice.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons: POS / CRM Lead / Trade-In */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Chuyển Đổi Nhanh 1-Chạm
                </span>

                {/* Convert to POS Sale */}
                <button
                  onClick={() => {
                    if (onConvertChatToPOS) {
                      const dev = devices[0] || {
                        id: `DEV_POS_${Date.now()}`,
                        imei: '358992144001',
                        serialNo: 'SN123456',
                        model: activeConversation.interestedProduct?.model || 'iPhone 16 Pro Max 256GB Desert',
                        storage: '256GB',
                        color: 'Desert Titan',
                        region: 'VN/A',
                        batteryHealth: 100,
                        condition: 'New Seal',
                        buyPrice: 31000000,
                        sellPrice: 34490000,
                        status: 'in_stock',
                        supplier: 'Apple Store VN',
                        receivedDate: '2026-08-16',
                        warrantyPeriodMonths: 12,
                        icloudStatus: 'Clean / Đã Thoát',
                        screenStatus: 'Zin Màn Keng'
                      };
                      onConvertChatToPOS(dev, {
                        name: activeConversation.customer.name,
                        phone: activeConversation.customer.phone || '0900000000'
                      });
                    }
                  }}
                  className="w-full py-2 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Chốt Đơn Bán POS</span>
                </button>

                {/* Convert to Trade-In Ticket */}
                <button
                  onClick={() => {
                    if (onConvertChatToTradeIn) {
                      onConvertChatToTradeIn(
                        activeConversation.customer.name,
                        activeConversation.customer.phone || '',
                        activeConversation.tradeInOffer?.oldModel || 'iPhone 14 Pro Max 256GB'
                      );
                    }
                  }}
                  className="w-full py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                  <span>Tạo Phiếu Thu Cũ Đổi Mới</span>
                </button>

                {/* Convert to CRM Lead */}
                <button
                  onClick={() => {
                    if (onConvertChatToLead) {
                      const newLead: Lead = {
                        id: `LEAD_${Date.now()}`,
                        name: activeConversation.customer.name,
                        phone: activeConversation.customer.phone || '0900000000',
                        source: (activeConversation.channel === 'FACEBOOK' ? 'Facebook Ads' : activeConversation.channel === 'ZALO' ? 'Zalo OA' : 'TikTok') as any,
                        interestedModel: activeConversation.interestedProduct?.model || 'iPhone 16 Pro Max',
                        budget: activeConversation.interestedProduct?.budget || 30000000,
                        tradeInRequirose: Boolean(activeConversation.tradeInOffer),
                        tradeInModel: activeConversation.tradeInOffer?.oldModel || '',
                        status: 'contacted',
                        assignedStaff: activeConversation.assignedStaff.name,
                        followUpDate: new Date().toISOString().split('T')[0],
                        createdAt: new Date().toISOString().split('T')[0],
                        notes: `Đồng bộ từ ${activeConversation.channelAccountName}: ${activeConversation.lastMessage.content}`
                      };
                      onConvertChatToLead(newLead);
                    }
                  }}
                  className="w-full py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-[#FF4B16]" />
                  <span>Lưu Vào CRM Lead Bán Hàng</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs p-4 text-center">
              Chưa có thông tin khách hàng.
            </div>
          )}
        </div>

      </div>

      {/* ================================================================= */}
      {/* MODAL 1: CHANNELS CONNECTION SETTINGS (Cấu hình Kết Nối Kênh)     */}
      {/* ================================================================= */}
      {isChannelSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#FF4B16]" />
                <h3 className="text-base font-black text-zinc-900">
                  Cấu Hình Kết Nối Kênh & Webhook Đa Kênh
                </h3>
              </div>
              <button onClick={() => setIsChannelSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Hệ thống tự động lắng nghe Webhook thời gian thực từ Meta Pages, Zalo OA OpenAPI, TikTok Shop Partner API và nhúng LiveChat Widget.
            </p>

            <div className="space-y-3">
              {channels.map((chan) => (
                <div key={chan.id} className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-white border border-zinc-200 flex items-center justify-center font-black text-xs" style={{ color: chan.color }}>
                        {chan.channel[0]}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-zinc-900">{chan.name}</h4>
                        <span className="text-[11px] text-zinc-500">{chan.accountHandle}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Đã Kết Nối
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-200/60">
                    <div>
                      <span className="text-zinc-400 text-[10px] block">Webhook URL Nhận Tin Nhắn:</span>
                      <code className="text-[11px] text-zinc-700 bg-white px-2 py-1 rounded border border-zinc-200 font-mono block truncate mt-0.5">
                        {chan.webhookUrl}
                      </code>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-700 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={chan.autoAiReply}
                          onChange={(e) => {
                            setChannels(channels.map(c => c.id === chan.id ? { ...c, autoAiReply: e.target.checked } : c));
                          }}
                          className="rounded text-orange-500 focus:ring-orange-400"
                        />
                        <span>AI Tự Trả Lời Khi Vắng Mặt</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-100 flex justify-end gap-2">
              <button
                onClick={() => setIsChannelSettingsOpen(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 cursor-pointer"
              >
                Lưu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: QUICK RESPONSE TEMPLATES (Kịch bản Trả Lời Nhanh)       */}
      {/* ================================================================= */}
      {isQuickTemplateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-black text-zinc-900">
                  Mẫu Câu Trả Lời Nhanh (Quick Templates)
                </h3>
              </div>
              <button onClick={() => setIsQuickTemplateOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {QUICK_RESPONSE_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setInputText(tpl.content.replace('{price}', '34.490.000').replace('{model}', 'iPhone 16 Pro Max').replace('{color}', 'Desert Titan').replace('{branch}', 'Cầu Giấy').replace('{phone}', activeConversation?.customer.phone || 'quý khách'));
                    setIsQuickTemplateOpen(false);
                  }}
                  className="p-3.5 rounded-2xl bg-zinc-50 hover:bg-orange-50/70 border border-zinc-200 hover:border-orange-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-zinc-900 group-hover:text-[#FF4B16]">
                      {tpl.title}
                    </h4>
                    <span className="text-[10px] bg-zinc-200/80 group-hover:bg-orange-100 text-zinc-600 group-hover:text-orange-700 px-2 py-0.5 rounded-md font-bold">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-2 leading-relaxed">
                    {tpl.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: PRODUCT PICKER MODAL (Chọn Sản Phẩm Từ Kho Để Báo Giá)   */}
      {/* ================================================================= */}
      {isProductPickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#FF4B16]" />
                <h3 className="text-base font-black text-zinc-900">
                  Chọn Máy Từ Kho Để Gửi Báo Giá & Tồn Kho Tức Thời
                </h3>
              </div>
              <button onClick={() => setIsProductPickerOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(devices.length > 0 ? devices.slice(0, 8) : [
                {
                  id: 'DEV_01',
                  model: 'iPhone 16 Pro Max 256GB',
                  storage: '256GB',
                  color: 'Desert Titan',
                  condition: 'New Seal',
                  sellPrice: 34490000,
                  warehouse: 'Kho Cầu Giấy'
                },
                {
                  id: 'DEV_02',
                  model: 'iPhone 15 Pro Max 256GB',
                  storage: '256GB',
                  color: 'Titan Tự Nhiên',
                  condition: 'Like New 99%',
                  sellPrice: 24500000,
                  warehouse: 'Kho Cầu Giấy'
                },
                {
                  id: 'DEV_03',
                  model: 'iPhone 14 Pro Max 128GB',
                  storage: '128GB',
                  color: 'Tím Deep Purple',
                  condition: 'Like New 99%',
                  sellPrice: 17900000,
                  warehouse: 'Kho Trần Duy Hưng'
                },
                {
                  id: 'DEV_04',
                  model: 'iPhone 13 128GB Midnight',
                  storage: '128GB',
                  color: 'Midnight',
                  condition: 'Like New 99%',
                  sellPrice: 11900000,
                  warehouse: 'Kho Cầu Giấy'
                }
              ]).map((dev: any) => (
                <div
                  key={dev.id}
                  onClick={() => handleSendProductCard(dev)}
                  className="p-3 rounded-2xl bg-zinc-50 hover:bg-orange-50 border border-zinc-200 hover:border-orange-300 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <h5 className="text-xs font-black text-zinc-900">{dev.model}</h5>
                    <div className="text-[11px] text-zinc-500">{dev.color} • {dev.condition}</div>
                    <div className="text-xs font-extrabold text-[#FF4B16] font-mono mt-0.5">
                      {dev.sellPrice.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <button className="px-2.5 py-1 bg-white hover:bg-orange-500 hover:text-white border border-zinc-200 rounded-xl text-[11px] font-bold text-zinc-700 transition-all shadow-2xs">
                    Gửi Card
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: TRADE-IN VALUATION BUILDER (Bảng Tính Thu Cũ Bù Chênh)    */}
      {/* ================================================================= */}
      {isTradeInModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-black text-zinc-900">
                  Tạo Bảng Tính Thu Cũ Đổi Mới Gửi Khách
                </h3>
              </div>
              <button onClick={() => setIsTradeInModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">Máy cũ của khách:</label>
                <input
                  type="text"
                  value={tradeInForm.oldModel}
                  onChange={(e) => setTradeInForm({ ...tradeInForm, oldModel: e.target.value })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Định giá máy cũ (VNĐ):</label>
                  <input
                    type="number"
                    step="500000"
                    value={tradeInForm.estimatedPrice}
                    onChange={(e) => setTradeInForm({ ...tradeInForm, estimatedPrice: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-orange-700"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Máy muốn lên đời:</label>
                  <input
                    type="text"
                    value={tradeInForm.targetModel}
                    onChange={(e) => setTradeInForm({ ...tradeInForm, targetModel: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Giá máy mới (VNĐ):</label>
                <input
                  type="number"
                  step="500000"
                  value={tradeInForm.targetPrice}
                  onChange={(e) => setTradeInForm({ ...tradeInForm, targetPrice: Number(e.target.value) })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#FF4B16]"
                />
              </div>

              {/* Preview Gap */}
              <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200 flex items-center justify-between text-xs">
                <span className="font-bold text-orange-900">Số tiền khách cần bù:</span>
                <strong className="text-base font-black text-rose-600 font-mono">
                  {Math.max(0, tradeInForm.targetPrice - tradeInForm.estimatedPrice).toLocaleString('vi-VN')} đ
                </strong>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex justify-end gap-2">
              <button
                onClick={() => setIsTradeInModalOpen(false)}
                className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSendTradeInQuote}
                className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-500 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 cursor-pointer"
              >
                Gửi Bảng Định Giá Vào Chat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
