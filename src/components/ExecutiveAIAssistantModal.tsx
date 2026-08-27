import React, { useState, useRef } from 'react';
import { 
  Bot, 
  Sparkles, 
  Mic, 
  MicOff, 
  Send, 
  X, 
  TrendingUp, 
  Smartphone, 
  Wallet, 
  Wrench, 
  Users, 
  RefreshCw,
  Clock,
  CheckCircle2,
  Share2
} from 'lucide-react';
import { 
  SalesInvoice, 
  DeviceItem, 
  FundAccount, 
  WarrantyTicket, 
  AttendanceRecord, 
  StaffMember 
} from '../types';
import { processExecutiveQuery, ExecutiveQueryResult } from '../services/executiveAIEngine';
import { apiJson } from '../services/apiClient';

function executiveSummaryText(value: unknown): string {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ExecutiveAIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices?: SalesInvoice[];
  devices?: DeviceItem[];
  funds?: FundAccount[];
  warrantyTickets?: WarrantyTicket[];
  attendanceRecords?: AttendanceRecord[];
  staffMembers?: StaffMember[];
}

export const ExecutiveAIAssistantModal: React.FC<ExecutiveAIAssistantModalProps> = ({
  isOpen,
  onClose,
  invoices = [],
  devices = [],
  funds = [],
  warrantyTickets = [],
  attendanceRecords = [],
  staffMembers = []
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ExecutiveQueryResult | null>(null);
  const [queryHistory, setQueryHistory] = useState<{ query: string; result: ExecutiveQueryResult; time: string }[]>([]);

  const recognitionRef = useRef<any>(null);

  if (!isOpen) return null;

  // Toggle Web Speech Recognition (Voice Input)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Trình duyệt của bạn chưa hỗ trợ Web Speech API. Bạn có thể gõ câu hỏi bằng bàn phím!');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        handleExecuteQuery(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const handleExecuteQuery = async (queryToRun?: string) => {
    const q = queryToRun || inputText;
    if (!q.trim()) return;

    setIsProcessing(true);

    try {
      // 1. Process with local Executive AI Engine
      const localResult = processExecutiveQuery(q, {
        invoices,
        devices,
        funds,
        warrantyTickets,
        attendanceRecords,
        staffMembers
      });

      // 2. Also try fetching AI synthesis from server
      try {
        const data = await apiJson<{ success: boolean; htmlResponse?: string }>('/api/ai/executive-assistant', {
          method: 'POST',
          body: JSON.stringify({
            query: q,
            context: {
              todayRevenue: localResult.rawData?.totalRev || 0,
              devicesCount: devices.filter(d => d.status === 'in_stock').length,
              fundsTotal: funds.reduce((s, f) => s + f.currentBalance, 0),
              activeTickets: warrantyTickets.filter(t => t.status !== 'delivered').length
            }
          })
        });
        if (data.success && data.htmlResponse) {
          localResult.summaryHtml = data.htmlResponse;
        }
      } catch (err) {
        // use local result seamlessly
      }

      setLastResult(localResult);
      setQueryHistory(prev => [
        { query: q, result: localResult, time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) },
        ...prev
      ]);
      setInputText('');
    } finally {
      setIsProcessing(false);
    }
  };

  const samplePrompts = [
    { label: '💰 Doanh số hôm nay', prompt: 'Hôm nay toàn hệ thống bán được bao nhiêu tiền rồi?' },
    { label: '📦 Tồn kho 16 Pro Max', prompt: 'Kiểm tra kho còn bao nhiêu cây 16 Pro Max?' },
    { label: '💼 Số dư các quỹ', prompt: 'Số dư các két tiền và tài khoản ngân hàng?' },
    { label: '🔧 Tiến độ kỹ thuật', prompt: 'Báo cáo tiến độ sửa chữa bảo hành hôm nay?' },
    { label: '👥 Chấm công nhân sự', prompt: 'Hôm nay ai đi làm muộn?' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200 max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-base flex items-center gap-1.5">
                <span>PhoneHouse Executive AI Voice Copilot</span>
                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">
                  Telegram Bot AI
                </span>
              </h3>
              <p className="text-xs text-zinc-400">Trợ lý Giám đốc Thông minh • Tra cứu tức thì bằng Giọng nói & Văn bản</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto custom-scrollbar bg-zinc-50/50">
          
          {/* Quick Prompts */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Câu hỏi nhanh cho Giám Đốc:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputText(p.prompt);
                    handleExecuteQuery(p.prompt);
                  }}
                  className="bg-white hover:bg-orange-50 border border-zinc-200 hover:border-orange-300 text-zinc-700 hover:text-orange-600 text-xs px-3 py-1.5 rounded-xl font-medium transition-all shadow-2xs"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Result Card */}
          {lastResult ? (
            <div className="bg-white rounded-2xl p-4 border border-orange-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <span className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  {lastResult.title}
                </span>
                <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-mono">
                  {new Date().toLocaleTimeString('vi-VN')}
                </span>
              </div>
              <div className="text-xs text-zinc-700 leading-relaxed font-sans whitespace-pre-line">
                {executiveSummaryText(lastResult.summaryHtml)}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-200 text-zinc-400 text-xs space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-orange-400 opacity-60 animate-pulse" />
              <p className="font-medium text-zinc-600">Bấm giữ biểu tượng Micro để nói hoặc gõ câu hỏi để tra cứu số liệu hệ thống!</p>
              <p className="text-[11px] text-zinc-400">Ví dụ: "Hôm nay bán được bao nhiêu cây máy rồi?"</p>
            </div>
          )}

          {/* History */}
          {queryHistory.length > 1 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Lịch sử tra cứu gần nhất:</span>
              <div className="space-y-1.5">
                {queryHistory.slice(1, 4).map((h, i) => (
                  <div key={i} className="bg-white p-2.5 rounded-xl border border-zinc-200 text-xs flex items-center justify-between text-zinc-600">
                    <span className="truncate pr-2 font-medium">"{h.query}"</span>
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input & Voice Controls */}
        <div className="p-4 bg-white border-t border-zinc-100 flex items-center gap-2">
          {/* Voice Input Button */}
          <button
            type="button"
            onClick={toggleListening}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-md ${
              isListening 
                ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-200' 
                : 'bg-gradient-to-br from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-orange-500/20'
            }`}
            title={isListening ? 'Đang nghe... bấm để dừng' : 'Bấm để nói bằng giọng nói'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExecuteQuery();
              }}
              placeholder={isListening ? 'Đang nghe giọng nói của bạn...' : 'Hỏi Giám Đốc AI (VD: Doanh số hôm nay, Tồn kho 16 Pro Max)...'}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={() => handleExecuteQuery()}
            disabled={isProcessing || !inputText.trim()}
            className="w-11 h-11 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm"
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
