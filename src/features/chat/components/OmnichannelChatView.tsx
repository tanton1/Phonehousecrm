import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, HelpCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import { ChatConversation } from '../types';
import { DeviceItem } from '../../../types';
import { ConversationListPanel } from './ConversationListPanel';
import { ChatStreamPanel } from './ChatStreamPanel';
import { ChatCustomerSidebar } from './ChatCustomerSidebar';
import {
  PancakeBranchOption,
  PancakeChannelStatus,
  requestLinkPancakeBranch,
  requestMarkPancakeRead,
  requestPancakeChannels,
  requestPancakeConversations,
  requestPancakeMessages,
  requestSendPancakeMessage,
  requestSyncPancakePage
} from '../../../services/pancakeApiClient';

export interface OmnichannelChatViewProps {
  devices: DeviceItem[];
  currentBranchId?: string;
  currentUserRole?: string;
  onConvertToPOS: (conversation: ChatConversation, selectedDevice?: DeviceItem) => void;
}

const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER']);

function friendlyError(error: unknown) {
  const message = String((error as any)?.message || error || 'Không thể kết nối Pancake.');
  if (message.includes('PANCAKE_PAGE_TOKEN_NOT_CONFIGURED')) return 'Chưa có Page Access Token. Hãy thêm PANCAKE_PAGE_ACCESS_TOKEN trong Vercel rồi Redeploy.';
  if (message.includes('PANCAKE_TOKEN_INVALID')) return 'Page Access Token không hợp lệ hoặc đã được tạo lại trên Pancake.';
  if (message.includes('PANCAKE_BRANCH_AMBIGUOUS')) return 'Có nhiều chi nhánh phù hợp. Hãy chọn đúng chi nhánh CRM để gắn với Page.';
  if (message.includes('PANCAKE_BRANCH_NOT_FOUND')) return 'Page chưa được gắn với chi nhánh CRM. Hãy chọn chi nhánh bên dưới.';
  if (message.includes('PANCAKE_RATE_LIMITED')) return 'Pancake đang giới hạn tần suất. Vui lòng chờ một chút rồi thử lại.';
  if (message.includes('PANCAKE_API_TIMEOUT')) return 'Pancake phản hồi quá chậm. Vui lòng thử lại.';
  return message;
}

export const OmnichannelChatView: React.FC<OmnichannelChatViewProps> = ({
  devices,
  currentBranchId,
  currentUserRole,
  onConvertToPOS
}) => {
  const isManager = MANAGER_ROLES.has(String(currentUserRole || '').toUpperCase());
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [channels, setChannels] = useState<PancakeChannelStatus[]>([]);
  const [branchOptions, setBranchOptions] = useState<PancakeBranchOption[]>([]);
  const [mappingBranchId, setMappingBranchId] = useState('');
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'LIST' | 'CHAT' | 'SIDEBAR'>('LIST');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeConvo = conversations.find(conversation => conversation.id === selectedConvoId) || null;
  const activeChannel = useMemo(() => channels.find(channel => channel.branchId === currentBranchId) || channels[0], [channels, currentBranchId]);

  const loadConversations = useCallback(async (showSpinner = false, branchIdOverride = '') => {
    if (showSpinner) setLoading(true);
    try {
      const page = await requestPancakeConversations({ branchId: branchIdOverride || activeChannel?.branchId || currentBranchId, limit: 100 });
      setConversations(current => page.items.map(item => {
        const previous = current.find(old => old.id === item.id);
        return { ...item, messages: previous?.messages || [] };
      }));
      setSelectedConvoId(current => current && page.items.some(item => item.id === current) ? current : page.items[0]?.id || null);
      setError('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [activeChannel?.branchId, currentBranchId]);

  const loadChannelsAndConversations = useCallback(async () => {
    setLoading(true);
    const [channelResult, conversationResult] = await Promise.allSettled([
      requestPancakeChannels(),
      requestPancakeConversations({ branchId: currentBranchId, limit: 100 })
    ]);
    if (channelResult.status === 'fulfilled') {
      setChannels(channelResult.value.channels);
      setBranchOptions(channelResult.value.branches || []);
    }
    else setError(friendlyError(channelResult.reason));
    if (conversationResult.status === 'fulfilled') {
      setConversations(conversationResult.value.items);
      setSelectedConvoId(current => current || conversationResult.value.items[0]?.id || null);
    } else setError(friendlyError(conversationResult.reason));
    setLoading(false);
  }, [currentBranchId]);

  useEffect(() => { void loadChannelsAndConversations(); }, [loadChannelsAndConversations]);

  useEffect(() => {
    if (activeChannel?.status !== 'CONFIG_ERROR' || mappingBranchId || !branchOptions.length) return;
    const compact = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = compact(activeChannel.branchName);
    const matching = branchOptions.filter(branch => {
      const name = compact(branch.name);
      const code = compact(branch.code);
      return name === target || code === target || name.includes(target);
    });
    if (matching.length === 1) setMappingBranchId(matching[0].id);
    else if (currentBranchId && branchOptions.some(branch => branch.id === currentBranchId)) setMappingBranchId(currentBranchId);
  }, [activeChannel, branchOptions, currentBranchId, mappingBranchId]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadConversations(false); }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  const loadMessages = useCallback(async (conversation: ChatConversation) => {
    setLoadingMessages(true);
    try {
      const result = await requestPancakeMessages(conversation.id, true);
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, messages: result.items } : item));
      if (result.warning && !result.items.length) setError(friendlyError(result.warning));
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    const selected = conversations.find(conversation => conversation.id === selectedConvoId);
    if (selected && selected.messages.length === 0) void loadMessages(selected);
    // Messages are loaded once for each newly selected conversation; polling preserves the loaded array.
  }, [selectedConvoId, loadMessages]);

  const handleSelectConversation = (conversation: ChatConversation) => {
    const alreadySelected = conversation.id === selectedConvoId;
    setSelectedConvoId(conversation.id);
    setMobilePanel('CHAT');
    setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
    if (alreadySelected && conversation.messages.length === 0) void loadMessages(conversation);
    if (conversation.unreadCount > 0) {
      void requestMarkPancakeRead(conversation.id).catch(caught => setError(friendlyError(caught)));
    }
  };

  const handleSendMessage = async (conversationId: string, text: string) => {
    try {
      const result = await requestSendPancakeMessage(conversationId, text);
      setConversations(current => current.map(conversation => {
        if (conversation.id !== conversationId) return conversation;
        const exists = conversation.messages.some(message => message.id === result.message.id);
        return {
          ...conversation,
          messages: exists ? conversation.messages : [...conversation.messages, result.message],
          lastMessageSnippet: result.message.content,
          lastMessageTime: result.message.timestamp,
          unreadCount: 0
        };
      }));
      setError('');
    } catch (caught) {
      setError(friendlyError(caught));
      throw caught;
    }
  };

  const handleSendProductCard = async (conversationId: string, device: DeviceItem) => {
    const text = [
      `Dạ PhoneHouse đang có ${device.model} ${device.storage || ''} ${device.color || ''}.`,
      `Tình trạng pin ${device.batteryHealth || 100}%.`,
      `Giá bán: ${(device.sellPrice || 0).toLocaleString('vi-VN')}đ.`
    ].join(' ');
    try { await handleSendMessage(conversationId, text); } catch { /* Error banner is already updated. */ }
  };

  const handleSync = async () => {
    if (!activeChannel) return setError('Chưa có Page Pancake được cấu hình.');
    if (activeChannel.status === 'MISSING_TOKEN') return setError(`Hãy thêm ${activeChannel.requiredTokenEnv || 'PANCAKE_PAGE_ACCESS_TOKEN'} trong Vercel rồi Redeploy.`);
    if (activeChannel.status === 'CONFIG_ERROR' && !mappingBranchId) return setError('Hãy chọn chi nhánh CRM cần nhận hội thoại Pancake.');
    setSyncing(true);
    setError('');
    setNotice(activeChannel.status === 'CONFIG_ERROR' ? 'Đang gắn Page với chi nhánh đã chọn…' : 'Đang lấy hội thoại trong 30 ngày gần nhất…');
    try {
      let targetBranchId = activeChannel.branchId || currentBranchId || '';
      if (activeChannel.status === 'CONFIG_ERROR') {
        const linked = await requestLinkPancakeBranch(activeChannel.pageId, mappingBranchId);
        targetBranchId = linked.branchId;
        setChannels(current => current.map(channel => channel.pageId === linked.pageId
          ? { ...channel, ...linked, status: linked.status, error: undefined }
          : channel));
        setNotice('Đã gắn Page. Đang lấy hội thoại trong 30 ngày gần nhất…');
      }
      let cursor: string | null | undefined;
      let imported = 0;
      for (let page = 0; page < 50; page += 1) {
        const result = await requestSyncPancakePage(activeChannel.pageId, cursor);
        imported += result.imported;
        cursor = result.nextCursor;
        setNotice(`Đã đồng bộ ${imported} hội thoại…`);
        if (result.done || !cursor) break;
      }
      setNotice(`Đã đồng bộ ${imported} hội thoại từ ${activeChannel.pageName}.`);
      await loadConversations(false, targetBranchId);
    } catch (caught) {
      setNotice('');
      setError(friendlyError(caught));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[580px] flex-col gap-2">
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black text-zinc-900">
            <Link2 className="h-4 w-4 text-[#ff4b16]" />
            <span className="truncate">{activeChannel?.pageName || 'Pancake Inbox'}</span>
            <span className={`h-2 w-2 rounded-full ${activeChannel?.status === 'READY' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-500">
            {activeChannel?.status === 'READY'
              ? `${activeChannel.branchName} · tin nhắn và bình luận · ${activeChannel.historyDays} ngày`
              : activeChannel?.status === 'MISSING_TOKEN'
                ? `Chờ thiết lập ${activeChannel.requiredTokenEnv}`
                : 'Đang kiểm tra cấu hình kết nối'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span title="Tin nhắn được nhận qua webhook và gửi trực tiếp bằng API Pancake; token chỉ lưu trên server." className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-500"><HelpCircle className="h-4 w-4" /></span>
          <button onClick={() => void loadConversations(true)} disabled={loading} className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 disabled:opacity-50" title="Làm mới"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          {isManager && activeChannel?.status !== 'CONFIG_ERROR' && <button onClick={() => void handleSync()} disabled={syncing} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#ff4b16] px-3 text-[11px] font-black text-white disabled:opacity-50">{syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Đồng bộ 30 ngày</button>}
        </div>
      </section>

      {isManager && activeChannel?.status === 'CONFIG_ERROR' && (
        <section className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black text-amber-950">Chọn chi nhánh nhận hội thoại</p>
                <span title="Tên Page chỉ để hiển thị. Hệ thống cần lưu đúng ID chi nhánh CRM để đồng bộ và nhận webhook." className="text-amber-700"><HelpCircle className="h-3.5 w-3.5" /></span>
              </div>
              <p className="mt-0.5 text-[10px] font-semibold text-amber-800">{activeChannel.pageName} · Page ID {activeChannel.pageId}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <select value={mappingBranchId} onChange={event => setMappingBranchId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-zinc-900 outline-none focus:border-[#ff4b16]">
                  <option value="">Chọn chi nhánh CRM…</option>
                  {branchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` (${branch.code})` : ''}</option>)}
                </select>
                <button onClick={() => void handleSync()} disabled={syncing || !mappingBranchId} className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ff4b16] px-4 text-[11px] font-black text-white disabled:opacity-50">
                  {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Gắn & đồng bộ 30 ngày
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {(error || notice) && <div className={`flex shrink-0 items-start gap-2 rounded-xl px-3 py-2 text-[11px] font-bold ${error ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-blue-200 bg-blue-50 text-blue-700'}`}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error || notice}</span></div>}

      <div className="min-h-0 flex-1">
        {loading && !conversations.length ? (
          <div className="grid h-full place-items-center rounded-2xl border border-zinc-200 bg-white"><div className="text-center text-xs font-bold text-zinc-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#ff4b16]" />Đang tải hộp thư…</div></div>
        ) : (
          <>
            <div className="h-full lg:hidden">
              {mobilePanel === 'LIST' && <ConversationListPanel conversations={conversations} selectedConversationId={selectedConvoId} onSelectConversation={handleSelectConversation} />}
              {mobilePanel === 'CHAT' && <ChatStreamPanel conversation={activeConvo} onSendMessage={handleSendMessage} onBack={() => setMobilePanel('LIST')} onOpenInfo={() => setMobilePanel('SIDEBAR')} onConvertToPOS={() => activeConvo && onConvertToPOS(activeConvo)} loadingMessages={loadingMessages} />}
              {mobilePanel === 'SIDEBAR' && <div className="flex h-full flex-col"><div className="flex items-center justify-between border-b border-zinc-200 bg-white p-2.5"><button onClick={() => setMobilePanel('CHAT')} className="text-xs font-bold text-[#ff4b16]">❮ Quay lại đoạn chat</button></div><div className="flex-1 overflow-y-auto"><ChatCustomerSidebar conversation={activeConvo} devices={devices} onSendProductCard={handleSendProductCard} onConvertToPOS={onConvertToPOS} /></div></div>}
            </div>
            <div className="hidden h-full grid-cols-[300px_1fr_300px] gap-3.5 lg:grid">
              <ConversationListPanel conversations={conversations} selectedConversationId={selectedConvoId} onSelectConversation={handleSelectConversation} />
              <ChatStreamPanel conversation={activeConvo} onSendMessage={handleSendMessage} loadingMessages={loadingMessages} />
              <ChatCustomerSidebar conversation={activeConvo} devices={devices} onSendProductCard={handleSendProductCard} onConvertToPOS={onConvertToPOS} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
