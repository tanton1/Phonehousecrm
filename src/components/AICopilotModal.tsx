import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw, X, Lightbulb, Zap } from 'lucide-react';

interface AICopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AICopilotModal: React.FC<AICopilotModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; time: string }>>([
    {
      sender: 'assistant',
      text: 'Chào bạn! Mình là AI Trợ Lý Vận Hành & Bán Hàng chuyên biệt cho Shop iPhone. Bạn cần hỗ trợ gì hôm nay? (Ví dụ: Soạn kịch bản chốt khách mua 16 Pro Max, cách xử lý khi khách chê pin 83%, tư vấn chính sách bảo hành 1 đổi 1 hay cấu hình Frappe Docker?)',
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = {
      sender: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/ask-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend })
      });
      const data = await res.json();
      
      const assistantMsg = {
        sender: 'assistant' as const,
        text: data.answer || 'Để tối ưu doanh thu cho shop: Hãy áp dụng chính sách Thu Cũ Đổi Mới (Trade-in) trợ giá 500k - 1tr và gói Bảo hành VIP 1 đổi 1 12 tháng.',
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Để tối ưu tỷ lệ chốt sale: Hãy nhấn mạnh chính sách Bảo Hành 1 Đổi 1 trong 30 ngày đầu, tặng kèm gói cường lực KingKong trọn đời và hỗ trợ trả góp 0% qua CCCD.',
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    'Khách chê iPhone 13 Pro Max dễ bị lỗi trắng màn hình thì tư vấn sao?',
    'Cách giải thích sự khác biệt giữa hàng VN/A và LL/A (Mỹ)?',
    'Khách muốn thu cũ 11 Pro Max lên 15 Pro, kịch bản chốt nhanh?',
    'Cấu hình Webhook Zalo OA vào Frappe ERPNext như thế nào?'
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white border border-orange-200 rounded-t-3xl sm:rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col h-[85vh] sm:h-[650px] max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-50 via-amber-50/60 to-white px-5 py-4 border-b border-orange-100 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20">
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-zinc-900 text-sm">iStore AI Assistant & Copilot</h3>
              <p className="text-[10px] text-zinc-500">Trí tuệ nhân tạo tư vấn chuyên biệt cho Shop iPhone</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors font-bold"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-zinc-50/50">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex space-x-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-7 h-7 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0 text-orange-600">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] sm:max-w-[78%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium shadow-md shadow-orange-500/10'
                    : 'bg-white border border-zinc-200 text-zinc-800 shadow-2xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>
                <div
                  className={`text-[9px] mt-1 text-right ${
                    m.sender === 'user' ? 'text-white/80' : 'text-zinc-400'
                  }`}
                >
                  {m.time}
                </div>
              </div>

              {m.sender === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-zinc-700 flex items-center justify-center shrink-0 text-white">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center space-x-2 text-zinc-500 text-xs pl-9">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
              <span>AI đang suy nghĩ câu trả lời tốt nhất...</span>
            </div>
          )}
        </div>

        {/* Suggested Quick Prompts */}
        <div className="px-4 py-2 bg-zinc-100/70 border-t border-zinc-200 overflow-x-auto scrollbar-none flex space-x-1.5 shrink-0">
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-[11px] bg-white hover:bg-orange-50 text-zinc-700 hover:text-orange-700 border border-zinc-200 hover:border-orange-300 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all flex items-center space-x-1 shadow-2xs"
            >
              <Lightbulb className="w-3 h-3 text-orange-500" />
              <span className="truncate max-w-[200px]">{prompt}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 sm:p-4 bg-white border-t border-zinc-200 flex items-center space-x-2 shrink-0"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Hỏi AI bất kỳ điều gì về sản phẩm, giá bán, kịch bản tư vấn..."
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="p-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md shadow-orange-500/20 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
