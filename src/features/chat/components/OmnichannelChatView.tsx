import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, HelpCircle, Link2, Loader2, RefreshCw, WandSparkles, X } from 'lucide-react';
import { ChatConversation } from '../types';
import { DeviceItem } from '../../../types';
import { ConversationListPanel } from './ConversationListPanel';
import { ChatStreamPanel } from './ChatStreamPanel';
import { ChatCustomerSidebar } from './ChatCustomerSidebar';
import { ChatSummaryCarousel } from './ChatSummaryCarousel';
import {
  PancakeBranchOption,
  PancakeChatSummary,
  PancakeChatStaffOption,
  PancakeChannelStatus,
  PancakeWebhookSetup,
  requestLinkPancakeBranch,
  requestMarkPancakeRead,
  requestPancakeChannels,
  requestPancakeChatSummary,
  requestPancakeChatStaff,
  requestPancakeConversations,
  requestPancakeMessages,
  requestRepairPancakeMessages,
  requestSendPancakeMessage,
  requestSyncPancakePage,
  requestPancakeWebhookSetup,
  requestUpdatePancakeWorkflow,
  subscribeChatConversations,
  subscribePancakeMessages
} from '../../../services/pancakeApiClient';

export interface OmnichannelChatViewProps {
  devices: DeviceItem[];
  currentBranchId?: string;
  currentUserRole?: string;
  currentUserId?: string;
  currentUserName?: string;
  onConvertToPOS: (conversation: ChatConversation, selectedDevice?: DeviceItem) => void;
}

const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER']);

function friendlyError(error: unknown) {
  const message = String((error as any)?.message || error || 'Không thể kết nối hộp thư Facebook.');
  if (message.includes('META_PAGE_ACCESS_TOKEN_NOT_CONFIGURED')) return 'Chưa có Page Access Token Meta. Hãy thêm META_PAGE_ACCESS_TOKEN trong Vercel Production rồi Redeploy.';
  if (message.includes('META_API_FAILED_190')) return 'Page Access Token Meta đã hết hạn hoặc không hợp lệ. Hãy tạo lại token và cập nhật Vercel.';
  if (message.includes('META_API_FAILED_10:') || message.includes('META_API_FAILED_200:')) return 'Meta chưa cấp đủ quyền đọc/gửi tin. Hãy hoàn tất pages_messaging, pages_manage_metadata và pages_read_engagement.';
  if (message.includes('META_BRANCH_NOT_FOUND')) return 'Page Meta chưa được gắn đúng chi nhánh CRM.';
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
  currentUserId,
  currentUserName,
  onConvertToPOS
}) => {
  const isManager = MANAGER_ROLES.has(String(currentUserRole || '').toUpperCase());
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [channels, setChannels] = useState<PancakeChannelStatus[]>([]);
  const [branchOptions, setBranchOptions] = useState<PancakeBranchOption[]>([]);
  const [chatStaff, setChatStaff] = useState<PancakeChatStaffOption[]>([]);
  const [chatSummary, setChatSummary] = useState<PancakeChatSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [mappingBranchId, setMappingBranchId] = useState('');
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'LIST' | 'CHAT' | 'SIDEBAR'>('LIST');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [showWebhookSetup, setShowWebhookSetup] = useState(false);
  const [loadingWebhookSetup, setLoadingWebhookSetup] = useState(false);
  const [webhookSetup, setWebhookSetup] = useState<PancakeWebhookSetup | null>(null);
  const [workflowUpdating, setWorkflowUpdating] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeConvo = conversations.find(conversation => conversation.id === selectedConvoId) || null;
  const activeChannel = useMemo(() => channels.find(channel => channel.branchId === currentBranchId) || channels[0], [channels, currentBranchId]);
  const directMeta = activeChannel?.provider === 'META_MESSENGER';
  const providerLabel = directMeta ? 'Meta Messenger' : 'Pancake';
  const pageDisconnected = activeChannel?.connectionStatus === 'DISCONNECTED';
  const webhookReceiving = activeChannel?.webhookStatus === 'RECEIVING' && !pageDisconnected;

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

  const loadSummary = useCallback(async (branchIdOverride = '') => {
    const branchId = branchIdOverride || activeChannel?.branchId || currentBranchId || '';
    if (!branchId) return;
    setLoadingSummary(true);
    try {
      setChatSummary(await requestPancakeChatSummary(branchId, 30));
    } catch (caught) {
      console.warn('[Pancake summary]', caught);
    } finally {
      setLoadingSummary(false);
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
      setConversations(current => conversationResult.value.items.map(item => {
        const previous = current.find(old => old.id === item.id);
        return { ...item, messages: previous?.messages || [] };
      }));
      setSelectedConvoId(current => current || conversationResult.value.items[0]?.id || null);
    } else setError(friendlyError(conversationResult.reason));
    setLoading(false);
  }, [currentBranchId]);

  useEffect(() => { void loadChannelsAndConversations(); }, [loadChannelsAndConversations]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void requestPancakeChannels()
        .then(result => {
          setChannels(result.channels);
          setBranchOptions(result.branches || []);
        })
        .catch(caught => console.warn('[Pancake channel health]', caught));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const branchId = activeChannel?.branchId || currentBranchId;
    if (!branchId) return;
    void requestPancakeChatStaff(branchId)
      .then(result => setChatStaff(result.items))
      .catch(caught => console.warn('[Pancake staff]', caught));
  }, [activeChannel?.branchId, currentBranchId]);

  useEffect(() => {
    void loadSummary();
    const timer = window.setInterval(() => { void loadSummary(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadSummary]);

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
    if (directMeta && webhookReceiving) return undefined;
    const timer = window.setInterval(() => { void loadConversations(false); }, 15_000);
    return () => window.clearInterval(timer);
  }, [directMeta, loadConversations, webhookReceiving]);

  useEffect(() => {
    const branchId = activeChannel?.branchId || currentBranchId;
    if (!branchId) return undefined;
    return subscribeChatConversations(branchId, items => {
      setConversations(current => items.map(item => {
        const previous = current.find(old => old.id === item.id);
        return { ...item, messages: previous?.messages || [] };
      }));
      setSelectedConvoId(current => current && items.some(item => item.id === current) ? current : items[0]?.id || null);
    }, caught => console.warn('[Chat conversation realtime]', caught));
  }, [activeChannel?.branchId, currentBranchId]);

  const loadMessages = useCallback(async (conversationId: string, refreshFromPancake = true, showSpinner = true) => {
    if (showSpinner) setLoadingMessages(true);
    try {
      const result = await requestPancakeMessages(conversationId, refreshFromPancake);
      setConversations(current => current.map(item => item.id === conversationId ? { ...item, messages: result.items } : item));
      if (result.warning && !result.items.length) setError(friendlyError(result.warning));
    } catch (caught) {
      if (showSpinner) setError(friendlyError(caught));
    } finally {
      if (showSpinner) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvoId) void loadMessages(selectedConvoId, true, true);
  }, [selectedConvoId, loadMessages]);

  useEffect(() => {
    if (!selectedConvoId || !activeConvo?.branchId) return undefined;
    return subscribePancakeMessages(selectedConvoId, activeConvo.branchId, messages => {
      setConversations(current => current.map(item => item.id === selectedConvoId ? { ...item, messages } : item));
    }, caught => {
      console.warn('[Pancake realtime]', caught);
    });
  }, [activeConvo?.branchId, selectedConvoId]);

  // Webhook + Firestore listener is instant when Pancake calls our endpoint.
  // This slower source refresh is a safety net while webhook has not yet sent
  // an event (and also repairs historical messages saved with an old shape).
  useEffect(() => {
    if (!selectedConvoId) return undefined;
    if (directMeta && webhookReceiving) return undefined;
    const interval = webhookReceiving ? 60_000 : 20_000;
    const timer = window.setInterval(() => {
      void loadMessages(selectedConvoId, true, false);
    }, interval);
    return () => window.clearInterval(timer);
  }, [directMeta, loadMessages, selectedConvoId, webhookReceiving]);

  const handleSelectConversation = (conversation: ChatConversation) => {
    const alreadySelected = conversation.id === selectedConvoId;
    setSelectedConvoId(conversation.id);
    setMobilePanel('CHAT');
    setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
    if (alreadySelected) void loadMessages(conversation.id, true, true);
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
      void loadSummary();
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
    if (!activeChannel) return setError('Chưa có Page Facebook được cấu hình.');
    if (activeChannel.status === 'MISSING_TOKEN') return setError(`Hãy thêm ${activeChannel.requiredTokenEnv || 'PANCAKE_PAGE_ACCESS_TOKEN'} trong Vercel rồi Redeploy.`);
    if (activeChannel.status === 'CONFIG_ERROR' && !mappingBranchId) return setError(`Hãy chọn chi nhánh CRM cần nhận hội thoại ${providerLabel}.`);
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
      await Promise.all([loadConversations(false, targetBranchId), loadSummary(targetBranchId)]);
    } catch (caught) {
      setNotice('');
      setError(friendlyError(caught));
    } finally {
      setSyncing(false);
    }
  };

  const handleManualRefresh = async () => {
    await Promise.all([
      loadChannelsAndConversations(),
      loadSummary(),
      selectedConvoId ? loadMessages(selectedConvoId, true, false) : Promise.resolve()
    ]);
  };

  const handleRepairHistory = async () => {
    if (!activeChannel || repairing) return;
    setRepairing(true);
    setError('');
    setNotice('Đang sửa các tin nhắn rỗng đã đồng bộ trước đây…');
    let repaired = 0;
    let removed = 0;
    let failed = 0;
    let hasMore = true;
    try {
      // Each server request only handles a small batch, preventing long Vercel
      // requests and allowing a safe retry when Pancake rate-limits the page.
      for (let batch = 0; batch < 12 && hasMore; batch += 1) {
        const result = await requestRepairPancakeMessages(activeChannel.pageId, 5);
        repaired += result.repaired;
        removed += result.removed;
        failed += result.failed;
        hasMore = result.hasMore;
        setNotice(`Đã khôi phục ${repaired} tin nhắn, bỏ ${removed} sự kiện rỗng…`);
        if (!result.scanned || (result.repaired + result.removed === 0 && result.failed > 0)) break;
      }
      setNotice(`Hoàn tất: khôi phục ${repaired} tin nhắn, bỏ ${removed} sự kiện rỗng${failed ? `, ${failed} hội thoại sẽ thử lại sau` : ''}.`);
      await Promise.all([
        loadConversations(false),
        selectedConvoId ? loadMessages(selectedConvoId, false, false) : Promise.resolve()
      ]);
    } catch (caught) {
      setNotice('');
      setError(friendlyError(caught));
    } finally {
      setRepairing(false);
    }
  };

  const handleOpenWebhookSetup = async () => {
    if (!activeChannel) return;
    setShowWebhookSetup(true);
    setLoadingWebhookSetup(true);
    try {
      setWebhookSetup(await requestPancakeWebhookSetup(activeChannel.pageId));
      setError('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoadingWebhookSetup(false);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!webhookSetup?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(webhookSetup.callbackUrl);
      setNotice(directMeta
        ? 'Đã sao chép URL webhook Meta. Dán vào Meta Developers → Messenger → Cài đặt API Messenger.'
        : 'Đã sao chép URL webhook bảo mật. Dán URL này vào Pancake → Tools → Webhook.');
    } catch {
      setError('Trình duyệt không cho sao chép tự động. Hãy mở trang này bằng HTTPS và thử lại.');
    }
  };

  const handleUpdateWorkflow = async (
    conversationId: string,
    input: Parameters<typeof requestUpdatePancakeWorkflow>[1]
  ) => {
    setWorkflowUpdating(true);
    try {
      const updated = await requestUpdatePancakeWorkflow(conversationId, input);
      setConversations(current => current.map(conversation => conversation.id === conversationId
        ? { ...updated, messages: conversation.messages }
        : conversation));
      setError('');
      void loadSummary();
    } catch (caught) {
      setError(friendlyError(caught));
      throw caught;
    } finally {
      setWorkflowUpdating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[580px] flex-col gap-2">
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black text-zinc-900">
            <Link2 className="h-4 w-4 text-[#ff4b16]" />
            <span className="truncate">{activeChannel?.pageName || 'Facebook Inbox'}</span>
            <span className={`h-2 w-2 rounded-full ${pageDisconnected ? 'bg-rose-500' : activeChannel?.status === 'READY' && webhookReceiving ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-500">
            {activeChannel?.status === 'READY'
              ? `${activeChannel.branchName} · ${pageDisconnected ? `Page đang mất kết nối ${providerLabel}` : webhookReceiving ? 'Realtime đang hoạt động' : 'Đang chờ tin thử từ Facebook'}`
              : activeChannel?.status === 'MISSING_TOKEN'
                ? `Chờ thiết lập ${activeChannel.requiredTokenEnv}`
                : 'Đang kiểm tra cấu hình kết nối'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => void handleOpenWebhookSetup()} title={pageDisconnected
            ? `${providerLabel} báo Page đang mất kết nối. Hãy kết nối lại Page trước khi kiểm tra webhook.`
            : activeChannel?.webhookStatus === 'RECEIVING'
            ? `Webhook đã nhận sự kiện${activeChannel.lastWebhookAt ? ` lúc ${new Date(activeChannel.lastWebhookAt).toLocaleString('vi-VN')}` : ''}. Hội thoại đang mở cập nhật realtime qua Firestore.`
            : activeChannel?.webhookStatus === 'MISSING_SECRET'
              ? `Chưa cấu hình secret webhook ${providerLabel}.`
              : `Chưa nhận sự kiện webhook từ ${providerLabel}. Hãy nhắn thử từ một tài khoản Facebook có quyền thử nghiệm.`
          } className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-500"><HelpCircle className="h-4 w-4" /></button>
          <button onClick={() => void handleManualRefresh()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 disabled:opacity-50" title="Làm mới Page, hội thoại và tin nhắn đang mở"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          {isManager && activeChannel?.status !== 'CONFIG_ERROR' && <button onClick={() => void handleSync()} disabled={syncing} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#ff4b16] px-3 text-[11px] font-black text-white disabled:opacity-50">{syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}<span className="hidden sm:inline">Đồng bộ 30 ngày</span><span className="sm:hidden">Đồng bộ</span></button>}
        </div>
      </section>

      {isManager && activeChannel?.status === 'CONFIG_ERROR' && (
        <section className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black text-amber-950">Chọn chi nhánh nhận hội thoại</p>
                <span title={`Tên Page chỉ để hiển thị. Hệ thống cần lưu đúng ID chi nhánh CRM để đồng bộ từ ${providerLabel}.`} className="text-amber-700"><HelpCircle className="h-3.5 w-3.5" /></span>
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

      {activeChannel?.status === 'READY' && <ChatSummaryCarousel summary={chatSummary} loading={loadingSummary} />}

      <div className="min-h-0 flex-1">
        {loading && !conversations.length ? (
          <div className="grid h-full place-items-center rounded-2xl border border-zinc-200 bg-white"><div className="text-center text-xs font-bold text-zinc-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#ff4b16]" />Đang tải hộp thư…</div></div>
        ) : (
          <>
            <div className="h-full lg:hidden">
              {mobilePanel === 'LIST' && <ConversationListPanel conversations={conversations} selectedConversationId={selectedConvoId} onSelectConversation={handleSelectConversation} />}
              {mobilePanel === 'CHAT' && <ChatStreamPanel conversation={activeConvo} onSendMessage={handleSendMessage} onRefresh={() => selectedConvoId && loadMessages(selectedConvoId, true, true)} onBack={() => setMobilePanel('LIST')} onOpenInfo={() => setMobilePanel('SIDEBAR')} onConvertToPOS={() => activeConvo && onConvertToPOS(activeConvo)} loadingMessages={loadingMessages} />}
              {mobilePanel === 'SIDEBAR' && <div className="flex h-full flex-col"><div className="flex items-center justify-between border-b border-zinc-200 bg-white p-2.5"><button onClick={() => setMobilePanel('CHAT')} className="text-xs font-bold text-[#ff4b16]">❮ Quay lại đoạn chat</button></div><div className="flex-1 overflow-y-auto"><ChatCustomerSidebar conversation={activeConvo} devices={devices} onSendProductCard={handleSendProductCard} onConvertToPOS={onConvertToPOS} staffOptions={chatStaff} currentUserId={currentUserId} canAssignOthers={isManager} workflowUpdating={workflowUpdating} onUpdateWorkflow={handleUpdateWorkflow} /></div></div>}
            </div>
            <div className="hidden h-full grid-cols-[300px_1fr_300px] gap-3.5 lg:grid">
              <ConversationListPanel conversations={conversations} selectedConversationId={selectedConvoId} onSelectConversation={handleSelectConversation} />
              <ChatStreamPanel conversation={activeConvo} onSendMessage={handleSendMessage} onRefresh={() => selectedConvoId && loadMessages(selectedConvoId, true, true)} loadingMessages={loadingMessages} />
              <ChatCustomerSidebar conversation={activeConvo} devices={devices} onSendProductCard={handleSendProductCard} onConvertToPOS={onConvertToPOS} staffOptions={chatStaff} currentUserId={currentUserId} canAssignOthers={isManager} workflowUpdating={workflowUpdating} onUpdateWorkflow={handleUpdateWorkflow} />
            </div>
          </>
        )}
      </div>

      {showWebhookSetup && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-zinc-950">Kết nối webhook {providerLabel}</h3>
                <p className="truncate text-[10px] font-semibold text-zinc-500">{activeChannel?.pageName} · Page ID {activeChannel?.pageId}</p>
              </div>
              <button onClick={() => setShowWebhookSetup(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-600" title="Đóng"><X className="h-4 w-4" /></button>
            </header>
            <div className="overflow-y-auto p-4">
              {loadingWebhookSetup ? (
                <div className="grid min-h-48 place-items-center text-xs font-bold text-zinc-500"><Loader2 className="mb-2 h-6 w-6 animate-spin text-[#ff4b16]" />Đang kiểm tra cấu hình…</div>
              ) : webhookSetup ? (
                <div className="space-y-4">
                  <div className={`flex items-start gap-3 rounded-2xl border p-3 ${webhookSetup.connectionStatus === 'DISCONNECTED' ? 'border-rose-200 bg-rose-50' : webhookSetup.webhookStatus === 'RECEIVING' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    {webhookSetup.connectionStatus === 'DISCONNECTED' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /> : webhookSetup.webhookStatus === 'RECEIVING' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
                    <div>
                      <p className="text-xs font-black text-zinc-950">{webhookSetup.connectionStatus === 'DISCONNECTED' ? `Page đang mất kết nối ${providerLabel}` : webhookSetup.webhookStatus === 'RECEIVING' ? 'Webhook đang hoạt động' : `${providerLabel} chưa gửi sự kiện webhook`}</p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-600">{webhookSetup.lastWebhookAt ? `Nhận lần cuối ${new Date(webhookSetup.lastWebhookAt).toLocaleString('vi-VN')} · ${webhookSetup.lastWebhookEvent || 'messaging'} · kết nối ${webhookSetup.connectionStatus === 'CONNECTED' ? 'tốt' : webhookSetup.connectionStatus === 'DISCONNECTED' ? 'đã ngắt' : 'chưa xác định'}` : 'App đang dùng cơ chế dự phòng 20 giây cho đến khi hoàn tất các bước dưới đây.'}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] font-black text-zinc-900">URL bảo mật dành riêng cho PhoneHouse</p>
                    <code className="mt-2 block break-all rounded-xl bg-zinc-900 p-2.5 text-[10px] text-zinc-200">{webhookSetup.callbackUrl.replace(/secret=[^&]+/, 'secret=••••••')}</code>
                    <button onClick={() => void handleCopyWebhookUrl()} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b16] text-xs font-black text-white"><Copy className="h-4 w-4" />Sao chép URL webhook</button>
                  </div>

                  {directMeta ? (
                    <ol className="space-y-2 text-[11px] leading-5 text-zinc-700">
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>1.</b> Dán URL trên vào Meta Developers → Messenger → Cài đặt API Messenger.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>2.</b> Nhập đúng giá trị <b>META_WEBHOOK_VERIFY_TOKEN</b> rồi bấm Xác minh và lưu.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>3.</b> Đăng ký messages, message_echoes, message_reads, message_deliveries, messaging_postbacks và feed.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>Quyền:</b> Chat cần pages_messaging, pages_manage_metadata, pages_read_engagement; trả lời bình luận cần thêm pages_manage_engagement.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>4.</b> Nhắn thử Page từ tài khoản có vai trò trong App; khách thật cần Meta cấp Advanced Access.</li>
                    </ol>
                  ) : (
                    <ol className="space-y-2 text-[11px] leading-5 text-zinc-700">
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>1.</b> Kiểm tra gói Pancake còn ít nhất 1 connection slot trống cho Page này.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>2.</b> Vào Pancake với quyền Admin → Tools → Webhook, dán URL vừa sao chép.</li>
                      <li className="rounded-xl bg-zinc-50 p-2.5"><b>3.</b> Bật messaging, conversation và connect_status rồi nhắn thử.</li>
                    </ol>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <a href={webhookSetup.docsUrl} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700"><ExternalLink className="h-4 w-4" />Tài liệu {providerLabel}</a>
                    {isManager && !directMeta && <button onClick={() => void handleRepairHistory()} disabled={repairing} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 disabled:opacity-50">{repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}Sửa tin nhắn cũ</button>}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-xs font-bold text-rose-600">Không thể tải cấu hình webhook. Xem thông báo lỗi phía trên và thử lại.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
