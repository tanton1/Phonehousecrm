import React, { useState, useRef, useEffect } from 'react';
import { ChatConversation, ChatMessage, QuickSnippet } from '../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Send, Smartphone, MessageSquare, Zap, ChevronLeft, ShoppingCart, Info, RefreshCw } from 'lucide-react';

export interface ChatStreamPanelProps {
  conversation: ChatConversation | null;
  onSendMessage: (convoId: string, text: string) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  loadingMessages?: boolean;
  onBack?: () => void;
  onOpenInfo?: () => void;
  onConvertToPOS?: () => void;
}

const QUICK_SNIPPETS: QuickSnippet[] = [
  { id: '1', label: 'Chào khách', category: 'GREETING', content: 'Dạ PhoneHouse xin chào anh/chị ạ! Em có thể hỗ trợ anh/chị thông tin về dòng iPhone nào ạ?' },
  { id: '2', label: 'Bảo hành VIP', category: 'WARRANTY', content: 'Dạ máy tại PhoneHouse được bảo hành 1 Đổi 1 trong 12 Tháng, bao test toàn diện pin và màn hình zin trọn đời ạ.' },
  { id: '3', label: 'Trả góp 0%', category: 'INSTALLMENT', content: 'Dạ bên em hỗ trợ trả góp 0% qua CCCD (Home Credit/HD Saison) duyệt nhanh 5 phút hoặc thẻ tín dụng không cần trả trước ạ.' },
  { id: '4', label: 'Địa chỉ shop', category: 'STORE_ADDRESS', content: 'Dạ mời anh/chị ghé trực tiếp showroom PhoneHouse để trải nghiệm máy và nhận ưu đãi phụ kiện tặng kèm ạ!' }
];

export const ChatStreamPanel: React.FC<ChatStreamPanelProps> = ({
  conversation,
  onSendMessage,
  onRefresh,
  loadingMessages = false,
  onBack,
  onOpenInfo,
  onConvertToPOS
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  if (!conversation) {
    return (
      <div className="bg-white border border-zinc-200/80 rounded-2xl flex flex-col items-center justify-center h-full p-8 text-center text-zinc-400 shadow-2xs">
        <MessageSquare className="w-12 h-12 stroke-1 text-zinc-300 mb-2" />
        <h4 className="text-sm font-bold text-zinc-700">Chọn một cuộc hội thoại</h4>
        <p className="text-xs text-zinc-400 mt-1 max-w-xs">
          Chọn khách hàng từ danh sách bên trái để xem tin nhắn và tư vấn bán hàng.
        </p>
      </div>
    );
  }

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(conversation.id, inputText.trim());
      setInputText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleApplySnippet = (snippet: QuickSnippet) => {
    setInputText(snippet.content);
  };

  const visibleMessages = conversation.messages.filter(message =>
    Boolean(message.content?.trim()) || Boolean(message.attachments?.length) || Boolean(message.productCard)
  );

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl flex flex-col h-full overflow-hidden shadow-2xs">
      {/* 1. Chat Header */}
      <div className="p-3 sm:p-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 gap-2">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="lg:hidden p-1.5 -ml-1 rounded-xl hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer"
              title="Quay lại danh sách"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center shrink-0">
            {conversation.customerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-zinc-900 truncate">{conversation.customerName}</h4>
            <p className="text-[10px] text-zinc-400 font-mono truncate">
              Kênh: <span className="font-bold text-zinc-600">{conversation.channel}</span>
              {conversation.customerPhone && ` • SĐT: ${conversation.customerPhone}`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {onRefresh && (
            <button
              onClick={() => void onRefresh()}
              disabled={loadingMessages}
              className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50"
              title="Làm mới tin nhắn từ Pancake"
            >
              <RefreshCw className={`h-4 w-4 ${loadingMessages ? 'animate-spin' : ''}`} />
            </button>
          )}
          {onConvertToPOS && (
            <button
              onClick={onConvertToPOS}
              className="lg:hidden flex items-center space-x-1 text-[11px] font-bold bg-[#ff4b16] text-white px-2.5 py-1.5 rounded-xl shadow-xs active:scale-95 cursor-pointer"
              title="Tạo đơn POS ngay"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>POS</span>
            </button>
          )}

          {onOpenInfo && (
            <button
              onClick={onOpenInfo}
              className="lg:hidden p-1.5 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
              title="Xem thông tin báo giá"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-lg font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff4b16]" />
            <span>{conversation.channel}</span>
          </div>
        </div>
      </div>

      {/* 2. Chat Stream Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] scrollbar-thin scrollbar-thumb-zinc-200">
        {loadingMessages && visibleMessages.length === 0 && (
          <div className="py-8 text-center text-xs font-semibold text-zinc-400">Đang tải lịch sử hội thoại…</div>
        )}
        {!loadingMessages && visibleMessages.length === 0 && (
          <div className="py-8 text-center text-xs font-semibold text-zinc-400">Chưa có tin nhắn được đồng bộ.</div>
        )}
        {visibleMessages.map(msg => {
          const isStaff = msg.sender === 'STAFF';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[75%] p-3 rounded-2xl text-xs space-y-1.5 ${
                  isStaff
                    ? 'bg-[#ff4b16] text-white rounded-br-xs shadow-2xs'
                    : 'bg-zinc-100 text-zinc-800 rounded-bl-xs'
                }`}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                {msg.attachments?.length ? (
                  <div className="grid gap-2 pt-1">
                    {msg.attachments.map((attachment, index) => (
                      <a key={`${attachment}-${index}`} href={attachment} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-black/10 bg-white/80 text-[10px] font-bold text-blue-700">
                        {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(attachment)
                          ? <img src={attachment} alt="Ảnh trong hội thoại" className="max-h-56 w-full object-cover" />
                          : <span className="block truncate px-2 py-2">Mở tệp đính kèm</span>}
                      </a>
                    ))}
                  </div>
                ) : null}

                {/* Product Card if attached */}
                {msg.productCard && (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs mt-1.5 ${
                    isStaff ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-zinc-200 text-zinc-900'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-4 h-4" />
                      <div>
                        <span className="font-bold block">{msg.productCard.model}</span>
                        <span className="text-[10px] opacity-80 font-mono">
                          {msg.productCard.storage} • {msg.productCard.color}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono font-black">
                      {msg.productCard.price.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                )}
              </div>

              <span className="text-[9px] text-zinc-400 font-mono mt-1 px-1">
                {msg.senderName} • {(() => {
                  const date = new Date(msg.timestamp);
                  return Number.isNaN(date.getTime()) ? msg.timestamp : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                })()}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Quick Snippets Bar */}
      <div className="px-3.5 py-2 border-t border-zinc-100 bg-zinc-50/70 flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
        <Zap className="w-3.5 h-3.5 text-[#ff4b16] shrink-0" />
        {QUICK_SNIPPETS.map(snip => (
          <button
            key={snip.id}
            onClick={() => handleApplySnippet(snip)}
            className="px-2.5 py-1 bg-white hover:bg-orange-50 border border-zinc-200/80 hover:border-orange-200 rounded-lg text-[11px] font-semibold text-zinc-700 hover:text-[#ff4b16] shrink-0 transition-colors cursor-pointer shadow-2xs"
          >
            {snip.label}
          </button>
        ))}
      </div>

      {/* 4. Input Area */}
      <div className="p-3 border-t border-zinc-100 flex items-center space-x-2 bg-white">
        <input
          type="text"
          placeholder="Nhập tin nhắn tư vấn khách hàng..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#ff4b16]"
        />

        <Button
          variant="primary"
          size="md"
          isLoading={isSending}
          onClick={handleSend}
          leftIcon={<Send className="w-3.5 h-3.5" />}
        >
          Gửi
        </Button>
      </div>
    </div>
  );
};
