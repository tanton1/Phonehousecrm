import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Clock3, Facebook, HelpCircle,
  Link2, Loader2, MessageCircle, Music2, Plus, Radio, RefreshCw, Save, Settings2,
  ShieldCheck, Smartphone, Trash2, Unplug, Webhook
} from 'lucide-react';
import { StoreBranch } from '../../../types';
import {
  ChannelConnection, ChannelConnectionEvent, MetaOAuthSession, TikTokOAuthSession,
  createManualMetaConnection, createManualTikTokConnection, createManualZaloConnection,
  disconnectMetaConnection, getMetaOAuthSession, getTikTokOAuthSession,
  importMetaOAuthPages, importTikTokOAuthAccount, listChannelConnectionEvents, listChannelConnections,
  startMetaOAuth, startTikTokOAuth, testMetaConnection, updateMetaConnection
} from '../../../services/channelConnectionApiClient';
import { requestSyncPancakePage } from '../../../services/pancakeApiClient';

interface Props {
  branches: StoreBranch[];
  currentUserRole?: string;
}

type Tab = 'CONNECTED' | 'ADD' | 'ROUTING' | 'SYNC' | 'LOGS';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'CONNECTED', label: 'Kênh đã kết nối' },
  { id: 'ADD', label: 'Thêm kênh' },
  { id: 'ROUTING', label: 'Gắn chi nhánh' },
  { id: 'SYNC', label: 'Đồng bộ dữ liệu' },
  { id: 'LOGS', label: 'Lịch sử hoạt động' }
];

function friendlyError(error: unknown) {
  const message = String((error as any)?.message || error || 'Không thể thực hiện.');
  if (message.includes('META_OAUTH_APP_NOT_CONFIGURED')) return 'Chưa cấu hình META_APP_ID hoặc META_APP_SECRET trên Vercel Production.';
  if (message.includes('CHANNEL_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED')) return 'Chưa có khóa bảo vệ token. Hãy thêm CHANNEL_TOKEN_ENCRYPTION_KEY trên Vercel.';
  if (message.includes('META_API_FAILED_190')) return 'Token Facebook đã hết hạn hoặc không đúng. Hãy kết nối lại Page.';
  if (message.includes('META_API_FAILED_10') || message.includes('META_API_FAILED_200')) return 'Ứng dụng Meta chưa có đủ quyền quản lý Page này.';
  if (message.includes('META_OAUTH_NO_PAGES')) return 'Tài khoản Facebook này không có Page phù hợp hoặc chưa được cấp quyền quản trị.';
  if (message.includes('ZALO_ACCESS_TOKEN_REQUIRED')) return 'Hãy nhập OA Access Token từ Zalo API Explorer.';
  if (message.includes('ZALO_REFRESH_TOKEN_REQUIRED')) return 'Access Token đã hết hạn. Hãy bổ sung Refresh Token để hệ thống tự gia hạn.';
  if (message.includes('ZALO_APP_CREDENTIALS_NOT_CONFIGURED')) return 'Thiếu Zalo App ID hoặc App Secret để tự gia hạn token.';
  if (message.includes('ZALO_WEBHOOK_SECRET_NOT_CONFIGURED')) return 'Thiếu OA Secret Key để xác thực webhook Zalo.';
  if (message.includes('ZALO_API_FAILED')) return `Zalo từ chối yêu cầu: ${message}`;
  if (message.includes('TIKTOK_OAUTH_APP_NOT_CONFIGURED')) return 'Thiếu TIKTOK_APP_ID, TIKTOK_APP_SECRET hoặc TIKTOK_AUTHORIZATION_URL trên Vercel Production.';
  if (message.includes('TIKTOK_ACCESS_TOKEN_REQUIRED')) return 'Hãy đăng nhập TikTok Business hoặc nhập Access Token.';
  if (message.includes('TIKTOK_REFRESH_TOKEN_REQUIRED')) return 'Token TikTok đã hết hạn và chưa có Refresh Token.';
  if (message.includes('TIKTOK_REPLY_WINDOW_EXPIRED')) return 'TikTok chỉ cho trả lời trong 48 giờ sau tin nhắn gần nhất của khách.';
  if (message.includes('TIKTOK_API_FAILED')) return `TikTok từ chối yêu cầu: ${message}`;
  return message;
}

function formatTime(value?: string) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa có' : date.toLocaleString('vi-VN');
}

function Help({ text }: { text: string }) {
  return <button type="button" title={text} aria-label={text} className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500"><HelpCircle className="h-3.5 w-3.5" /></button>;
}

function statusLabel(connection: ChannelConnection) {
  if (!connection.hasToken) return { label: 'Thiếu token', className: 'bg-rose-50 text-rose-700' };
  if (connection.status === 'ERROR') return { label: 'Cần kiểm tra', className: 'bg-rose-50 text-rose-700' };
  if (connection.webhookStatus === 'RECEIVING') return { label: 'Đang nhận realtime', className: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Đã kết nối', className: 'bg-blue-50 text-blue-700' };
}

export const ChannelConnectionsView: React.FC<Props> = ({ branches, currentUserRole }) => {
  const activeBranches = useMemo(() => branches.filter(branch => branch.isActive !== false), [branches]);
  const [tab, setTab] = useState<Tab>('CONNECTED');
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [events, setEvents] = useState<ChannelConnectionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ChannelConnection | null>(null);
  const [oauthSession, setOauthSession] = useState<MetaOAuthSession | null>(null);
  const [tiktokOauthSession, setTikTokOauthSession] = useState<TikTokOAuthSession | null>(null);
  const [tiktokImport, setTikTokImport] = useState({ branchId: '', displayName: '', historyDays: 30 });
  const [addProvider, setAddProvider] = useState<'META_MESSENGER' | 'ZALO_OA' | 'TIKTOK_BUSINESS'>('META_MESSENGER');
  const [oauthSelections, setOauthSelections] = useState<Record<string, { selected: boolean; branchId: string; historyDays: number; includeComments: boolean }>>({});
  const [manual, setManual] = useState({ pageId: '', pageName: '', token: '', branchId: '', historyDays: 30, includeComments: true });
  const [zalo, setZalo] = useState({ oaId: '', oaName: '', accessToken: '', refreshToken: '', appId: '', appSecret: '', webhookSecret: '', branchId: '', historyDays: 30 });
  const [tiktok, setTikTok] = useState({ businessId: '', displayName: '', accessToken: '', refreshToken: '', appId: '', appSecret: '', branchId: '', historyDays: 30 });
  const [editForm, setEditForm] = useState({ displayName: '', branchId: '', pageAccessToken: '', accessToken: '', refreshToken: '', appId: '', appSecret: '', webhookSecret: '', historyDays: 30, includeComments: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await listChannelConnections());
      setError('');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (tab !== 'LOGS') return;
    void listChannelConnectionEvents().then(setEvents).catch(caught => setError(friendlyError(caught)));
  }, [tab]);

  const openEdit = (connection: ChannelConnection) => {
    setEditing(connection);
    setEditForm({
      displayName: connection.displayName,
      branchId: connection.branchId,
      pageAccessToken: '',
      accessToken: '',
      refreshToken: '',
      appId: '',
      appSecret: '',
      webhookSecret: '',
      historyDays: connection.historyDays,
      includeComments: connection.includeComments
    });
  };

  const act = async (key: string, work: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      await load();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  };

  const beginOAuth = async () => {
    const popup = window.open('', 'phonehouse-meta-oauth', 'width=620,height=760');
    setBusy('oauth');
    setError('');
    try {
      const result = await startMetaOAuth();
      if (popup) popup.location.href = result.authorizationUrl;
      else window.location.href = result.authorizationUrl;
    } catch (caught) {
      popup?.close();
      setError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  };

  const beginTikTokOAuth = async () => {
    const popup = window.open('', 'phonehouse-tiktok-oauth', 'width=620,height=760');
    setBusy('tiktok-oauth');
    setError('');
    try {
      const result = await startTikTokOAuth();
      if (popup) popup.location.href = result.authorizationUrl;
      else window.location.href = result.authorizationUrl;
    } catch (caught) {
      popup?.close();
      setError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const type = String(event.data?.type || '');
      if (!['PHONEHOUSE_META_OAUTH_COMPLETE', 'PHONEHOUSE_TIKTOK_OAUTH_COMPLETE'].includes(type)) return;
      setBusy(type === 'PHONEHOUSE_TIKTOK_OAUTH_COMPLETE' ? 'tiktok-oauth-session' : 'oauth-session');
      try {
        if (type === 'PHONEHOUSE_TIKTOK_OAUTH_COMPLETE') {
          const session = await getTikTokOAuthSession(String(event.data.sessionId || ''));
          setTikTokOauthSession(session);
          setTikTokImport({ branchId: '', displayName: session.displayName, historyDays: 30 });
          setNotice('Đã nhận tài khoản TikTok Business. Chọn chi nhánh rồi lưu kết nối.');
        } else {
          const session = await getMetaOAuthSession(String(event.data.sessionId || ''));
          setOauthSession(session);
          setOauthSelections(Object.fromEntries(session.pages.map(page => [page.pageId, {
            selected: true,
            branchId: '',
            historyDays: 30,
            includeComments: true
          }])));
          setNotice(`Đã tìm thấy ${session.pages.length} Page. Chọn chi nhánh cho từng Page rồi lưu.`);
        }
      } catch (caught) {
        setError(friendlyError(caught));
      } finally {
        setBusy('');
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const importTikTok = async () => {
    if (!tiktokOauthSession) return;
    if (!tiktokImport.branchId) return setError('Hãy chọn chi nhánh nhận tin TikTok.');
    await act('tiktok-oauth-import', async () => {
      await importTikTokOAuthAccount(tiktokOauthSession.id, tiktokImport);
      setTikTokOauthSession(null);
      setTab('CONNECTED');
    }, 'Đã thêm TikTok Business. Bấm Kiểm tra để đăng ký webhook realtime.');
  };

  const importSelected = async () => {
    if (!oauthSession) return;
    const pages = oauthSession.pages.filter(page => oauthSelections[page.pageId]?.selected).map(page => ({
      pageId: page.pageId,
      branchId: oauthSelections[page.pageId].branchId,
      historyDays: oauthSelections[page.pageId].historyDays,
      includeComments: oauthSelections[page.pageId].includeComments
    }));
    if (!pages.length) return setError('Hãy chọn ít nhất một Page.');
    if (pages.some(page => !page.branchId)) return setError('Mỗi Page được chọn phải gắn một chi nhánh.');
    await act('oauth-import', async () => {
      await importMetaOAuthPages(oauthSession.id, pages);
      setOauthSession(null);
      setTab('CONNECTED');
    }, `Đã thêm ${pages.length} Page vào PhoneHouse CRM.`);
  };

  const syncPage = async (connection: ChannelConnection) => {
    await act(`sync-${connection.id}`, async () => {
      let cursor: string | null | undefined;
      let imported = 0;
      for (let page = 0; page < 60; page += 1) {
        const result = await requestSyncPancakePage(connection.externalAccountId, cursor);
        imported += result.imported;
        cursor = result.nextCursor;
        setNotice(`Đang đồng bộ ${connection.displayName}: ${imported} hội thoại…`);
        if (result.done || !cursor) break;
      }
      setNotice(`Đã đồng bộ ${imported} hội thoại từ ${connection.displayName}.`);
    }, `Đã đồng bộ ${connection.displayName}.`);
  };

  const summary = [
    { label: 'Facebook Page', value: connections.filter(item => item.provider === 'META_MESSENGER').length, icon: Facebook, tone: 'from-blue-600 to-blue-500' },
    { label: 'Zalo OA', value: connections.filter(item => item.provider === 'ZALO_OA').length, icon: Smartphone, tone: 'from-sky-500 to-cyan-500' },
    { label: 'TikTok Business', value: connections.filter(item => item.provider === 'TIKTOK_BUSINESS').length, icon: Music2, tone: 'from-zinc-950 to-fuchsia-600' },
    { label: 'Đang nhận realtime', value: connections.filter(item => item.webhookStatus === 'RECEIVING').length, icon: Radio, tone: 'from-emerald-600 to-emerald-500' },
    { label: 'Đã gắn chi nhánh', value: connections.filter(item => item.branchId).length, icon: Link2, tone: 'from-[#ff4b16] to-orange-400' },
    { label: 'Cần kiểm tra', value: connections.filter(item => !item.hasToken || item.status === 'ERROR').length, icon: AlertCircle, tone: 'from-zinc-800 to-zinc-600' }
  ];
  const editingIsZalo = editing?.provider === 'ZALO_OA';
  const editingIsTikTok = editing?.provider === 'TIKTOK_BUSINESS';
  const editingUsesBusinessToken = editingIsZalo || editingIsTikTok;

  if (editing) {
    return (
      <div className="-mx-3 flex min-h-[calc(100dvh-110px)] flex-col bg-[#f7f7f8] sm:-mx-5">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <button onClick={() => setEditing(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><h2 className="truncate text-base font-black text-zinc-950">Chỉnh sửa {editingIsZalo ? 'Zalo OA' : editingIsTikTok ? 'TikTok Business' : 'Facebook Page'}</h2><p className="truncate text-xs text-zinc-500">{editing.displayName} · {editing.externalAccountId}</p></div>
          <Help text="Tên có thể đổi. ID kênh giữ nguyên để không mất liên kết hội thoại cũ." />
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 pb-28">
          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-black text-zinc-700">Tên hiển thị<input value={editForm.displayName} onChange={event => setEditForm(current => ({ ...current, displayName: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#ff4b16]" /></label>
            <label className="block text-xs font-black text-zinc-700">Chi nhánh nhận tin<select value={editForm.branchId} onChange={event => setEditForm(current => ({ ...current, branchId: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#ff4b16]"><option value="">Chọn chi nhánh</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            {!editingUsesBusinessToken && <label className="block text-xs font-black text-zinc-700">Token mới <span className="font-medium text-zinc-400">(để trống nếu không đổi)</span><input type="password" value={editForm.pageAccessToken} onChange={event => setEditForm(current => ({ ...current, pageAccessToken: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#ff4b16]" /></label>}
            {editingUsesBusinessToken && <>
              <label className="block text-xs font-black text-zinc-700">Access Token mới <span className="font-medium text-zinc-400">(để trống nếu không đổi)</span><input type="password" value={editForm.accessToken} onChange={event => setEditForm(current => ({ ...current, accessToken: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label>
              <label className="block text-xs font-black text-zinc-700">Refresh Token mới <span className="font-medium text-zinc-400">(để trống nếu không đổi)</span><input type="password" value={editForm.refreshToken} onChange={event => setEditForm(current => ({ ...current, refreshToken: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-black text-zinc-700">{editingIsZalo ? 'Zalo' : 'TikTok'} App ID<input value={editForm.appId} onChange={event => setEditForm(current => ({ ...current, appId: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label><label className="block text-xs font-black text-zinc-700">App Secret mới<input type="password" value={editForm.appSecret} onChange={event => setEditForm(current => ({ ...current, appSecret: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label></div>
              {editingIsZalo && <label className="block text-xs font-black text-zinc-700">OA Secret Key mới<input type="password" value={editForm.webhookSecret} onChange={event => setEditForm(current => ({ ...current, webhookSecret: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label>}
            </>}
            <label className="block text-xs font-black text-zinc-700">Số ngày lấy lịch sử<input type="number" min={1} max={90} value={editForm.historyDays} onChange={event => setEditForm(current => ({ ...current, historyDays: Number(event.target.value) }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#ff4b16]" /></label>
            {!editingUsesBusinessToken && <label className="flex items-center justify-between rounded-xl bg-zinc-50 p-3 text-sm font-bold"><span>Đồng bộ bình luận</span><input type="checkbox" checked={editForm.includeComments} onChange={event => setEditForm(current => ({ ...current, includeComments: event.target.checked }))} className="h-5 w-5 accent-[#ff4b16]" /></label>}
          </section>
          <button onClick={() => { if (window.confirm(`Ngắt kết nối ${editing.displayName}? Hội thoại cũ vẫn được giữ lại.`)) void act('disconnect', async () => { await disconnectMetaConnection(editing.id); setEditing(null); }, 'Đã ngắt kết nối kênh.'); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700"><Trash2 className="h-4 w-4" /> Ngắt kết nối</button>
        </main>
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur sm:left-auto sm:right-0 sm:w-[calc(100%-var(--sidebar-width,0px))]">
          <div className="mx-auto flex max-w-3xl gap-2"><button onClick={() => setEditing(null)} className="h-12 flex-1 rounded-xl border border-zinc-200 text-sm font-black">Hủy</button><button disabled={busy === 'edit-save' || !editForm.branchId} onClick={() => void act('edit-save', async () => { await updateMetaConnection(editing.id, editForm); setEditing(null); }, 'Đã lưu thay đổi kênh.')} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#ff4b16] text-sm font-black text-white disabled:opacity-50">{busy === 'edit-save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thay đổi</button></div>
        </footer>
      </div>
    );
  }

  return (
    <div className="-mx-3 min-h-full bg-[#f7f7f8] px-3 pb-8 sm:-mx-5 sm:px-5">
      <section className="overflow-hidden rounded-b-[28px] bg-[linear-gradient(135deg,#161616_0%,#2c160f_55%,#ff4b16_160%)] px-4 pb-5 pt-4 text-white shadow-xl">
        <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ff4b16]"><MessageCircle className="h-6 w-6" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="text-xl font-black tracking-tight sm:text-2xl">Kênh & Kết nối</h1><Help text="Mỗi Facebook Page, Zalo OA hoặc TikTok Business được gắn đúng một chi nhánh. Tin nhắn mới tự về cùng một Inbox khi webhook hoạt động." /></div><p className="mt-1 text-xs leading-5 text-white/65">Quản lý Facebook, Zalo OA và TikTok Business trong cùng một nơi.</p></div><button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
        <div className="-mx-1 mt-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {summary.map(item => <article key={item.label} className={`min-w-[145px] snap-start rounded-2xl bg-gradient-to-br ${item.tone} p-3 shadow-lg`}><item.icon className="h-4 w-4 text-white/80" /><div className="mt-3 text-2xl font-black">{item.value}</div><div className="text-[10px] font-bold text-white/75">{item.label}</div></article>)}
        </div>
      </section>

      <nav className="sticky top-0 z-20 -mx-3 flex gap-1 overflow-x-auto border-b border-zinc-200 bg-[#f7f7f8]/95 px-3 py-2 backdrop-blur [scrollbar-width:none] sm:-mx-5 sm:px-5">
        {TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`h-9 shrink-0 rounded-full px-3 text-[11px] font-black transition ${tab === item.id ? 'bg-[#ff4b16] text-white shadow-md' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'}`}>{item.label}</button>)}
      </nav>

      {(error || notice) && <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error || notice}</span></div>}

      <main className="mt-3">
        {tab === 'CONNECTED' && <div className="space-y-3">
          {!loading && !connections.length && <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center"><Unplug className="mx-auto h-9 w-9 text-zinc-300" /><h3 className="mt-3 font-black">Chưa có kênh</h3><p className="mt-1 text-xs text-zinc-500">Thêm Facebook Page, Zalo OA hoặc TikTok Business để nhận tin về PhoneHouse CRM.</p><button onClick={() => setTab('ADD')} className="mt-4 rounded-xl bg-[#ff4b16] px-4 py-2.5 text-xs font-black text-white">Thêm kênh</button></div>}
          {connections.map(connection => { const state = statusLabel(connection); const isZalo = connection.provider === 'ZALO_OA'; const isTikTok = connection.provider === 'TIKTOK_BUSINESS'; const ChannelIcon = isZalo ? Smartphone : isTikTok ? Music2 : Facebook; return <article key={connection.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="flex items-start gap-3 p-4"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white ${isZalo ? 'bg-sky-500' : isTikTok ? 'bg-zinc-950' : 'bg-blue-600'}`}><ChannelIcon className="h-6 w-6" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black text-zinc-950">{connection.displayName}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-black ${state.className}`}>{state.label}</span></div><p className="mt-1 truncate text-[11px] text-zinc-500">{isZalo ? 'OA ID' : isTikTok ? 'Business ID' : 'Page ID'} {connection.externalAccountId}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-zinc-600"><span>🏬 {connection.branchName || 'Chưa gắn chi nhánh'}</span><span>🕒 {connection.historyDays} ngày</span><span>💬 {isZalo ? 'Tin nhắn Zalo' : isTikTok ? 'Tin nhắn TikTok' : connection.includeComments ? 'Có bình luận' : 'Chỉ tin nhắn'}</span></div>{connection.lastError && <p className="mt-2 line-clamp-2 text-[10px] font-bold text-rose-600">{friendlyError(connection.lastError)}</p>}</div><button onClick={() => openEdit(connection)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100"><Settings2 className="h-4 w-4" /></button></div><div className="grid grid-cols-3 border-t border-zinc-100"><button disabled={Boolean(busy)} onClick={() => void act(`test-${connection.id}`, () => testMetaConnection(connection.id, !isZalo), `Đã kiểm tra kết nối ${connection.displayName}.`)} className="flex h-11 items-center justify-center gap-1 border-r border-zinc-100 text-[10px] font-black text-blue-700 disabled:opacity-50">{busy === `test-${connection.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />} Kiểm tra</button><button disabled={Boolean(busy)} onClick={() => void syncPage(connection)} className="flex h-11 items-center justify-center gap-1 border-r border-zinc-100 text-[10px] font-black text-[#ff4b16] disabled:opacity-50">{busy === `sync-${connection.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {isZalo ? 'Làm mới' : 'Đồng bộ'}</button><button onClick={() => openEdit(connection)} className="flex h-11 items-center justify-center gap-1 text-[10px] font-black text-zinc-700"><Settings2 className="h-3.5 w-3.5" /> Chỉnh sửa</button></div></article>; })}
        </div>}

        {tab === 'ADD' && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200"><button onClick={() => setAddProvider('META_MESSENGER')} className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black ${addProvider === 'META_MESSENGER' ? 'bg-blue-600 text-white' : 'text-zinc-600'}`}><Facebook className="h-4 w-4" /> Facebook</button><button onClick={() => setAddProvider('ZALO_OA')} className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black ${addProvider === 'ZALO_OA' ? 'bg-sky-500 text-white' : 'text-zinc-600'}`}><Smartphone className="h-4 w-4" /> Zalo OA</button><button onClick={() => setAddProvider('TIKTOK_BUSINESS')} className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black ${addProvider === 'TIKTOK_BUSINESS' ? 'bg-zinc-950 text-white' : 'text-zinc-600'}`}><Music2 className="h-4 w-4" /> TikTok</button></div>
          {addProvider === 'META_MESSENGER' && <>
          <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm"><div className="flex gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white"><Facebook className="h-7 w-7" /></div><div><h2 className="text-sm font-black">Đăng nhập Facebook</h2><p className="mt-1 text-xs leading-5 text-zinc-600">Hệ thống tự lấy các Page bạn quản lý. Sau đó chỉ cần chọn chi nhánh cho từng Page.</p></div></div><button disabled={Boolean(busy)} onClick={() => void beginOAuth()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50">{busy.startsWith('oauth') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Đăng nhập và chọn Page</button></section>
          {oauthSession && <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Chọn Page cần thêm</h3><Help text="Một Page chỉ gắn một chi nhánh. Có thể thêm nhiều Page trong một lần." /></div><div className="mt-3 space-y-3">{oauthSession.pages.map(page => { const selection = oauthSelections[page.pageId]; return <div key={page.pageId} className="rounded-xl border border-zinc-200 p-3"><label className="flex items-start gap-3"><input type="checkbox" checked={selection?.selected || false} onChange={event => setOauthSelections(current => ({ ...current, [page.pageId]: { ...current[page.pageId], selected: event.target.checked } }))} className="mt-1 h-5 w-5 accent-[#ff4b16]" /><span className="min-w-0"><strong className="block truncate text-sm">{page.pageName}</strong><small className="text-zinc-500">{page.pageId}</small></span></label>{selection?.selected && <div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={selection.branchId} onChange={event => setOauthSelections(current => ({ ...current, [page.pageId]: { ...current[page.pageId], branchId: event.target.value } }))} className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold"><option value="">Chọn chi nhánh</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><label className="flex h-11 items-center justify-between rounded-xl bg-zinc-50 px-3 text-xs font-bold">Lấy bình luận<input type="checkbox" checked={selection.includeComments} onChange={event => setOauthSelections(current => ({ ...current, [page.pageId]: { ...current[page.pageId], includeComments: event.target.checked } }))} className="h-5 w-5 accent-[#ff4b16]" /></label></div>}</div>; })}</div><button disabled={busy === 'oauth-import'} onClick={() => void importSelected()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b16] text-sm font-black text-white disabled:opacity-50">{busy === 'oauth-import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu các Page đã chọn</button></section>}
          <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="cursor-pointer list-none p-4 text-sm font-black">Nhập Page ID và token thủ công <span className="text-zinc-400">⌄</span></summary><div className="space-y-3 border-t border-zinc-100 p-4"><input placeholder="Page ID" value={manual.pageId} onChange={event => setManual(current => ({ ...current, pageId: event.target.value }))} className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><input placeholder="Tên Page" value={manual.pageName} onChange={event => setManual(current => ({ ...current, pageName: event.target.value }))} className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><input type="password" placeholder="Page Access Token" value={manual.token} onChange={event => setManual(current => ({ ...current, token: event.target.value }))} className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><select value={manual.branchId} onChange={event => setManual(current => ({ ...current, branchId: event.target.value }))} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"><option value="">Chọn chi nhánh</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button disabled={busy === 'manual' || !manual.pageId || !manual.token || !manual.branchId} onClick={() => void act('manual', async () => { await createManualMetaConnection({ pageId: manual.pageId, pageName: manual.pageName, pageAccessToken: manual.token, branchId: manual.branchId, historyDays: manual.historyDays, includeComments: manual.includeComments }); setManual({ pageId: '', pageName: '', token: '', branchId: '', historyDays: 30, includeComments: true }); setTab('CONNECTED'); }, 'Đã thêm Facebook Page.')} className="h-11 w-full rounded-xl bg-zinc-900 text-xs font-black text-white disabled:opacity-50">Thêm bằng token</button></div></details>
          </>}
          {addProvider === 'ZALO_OA' && <section className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-500 text-white"><Smartphone className="h-6 w-6" /></div><div><h2 className="text-sm font-black">Kết nối Zalo OA</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Lấy Access Token và Refresh Token trong Zalo API Explorer. Các mã bí mật chỉ lưu dạng mã hóa trên server.</p></div><Help text="Access Token dùng để đọc/gửi tin. Refresh Token giúp hệ thống tự gia hạn. OA Secret Key dùng kiểm tra webhook có thật sự đến từ Zalo." /></div><div className="grid gap-3 sm:grid-cols-2"><input placeholder="OA ID *" value={zalo.oaId} onChange={event => setZalo(current => ({ ...current, oaId: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /><input placeholder="Tên OA" value={zalo.oaName} onChange={event => setZalo(current => ({ ...current, oaName: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /></div><input type="password" placeholder="OA Access Token *" value={zalo.accessToken} onChange={event => setZalo(current => ({ ...current, accessToken: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><input type="password" placeholder="Refresh Token" value={zalo.refreshToken} onChange={event => setZalo(current => ({ ...current, refreshToken: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input placeholder="Zalo App ID" value={zalo.appId} onChange={event => setZalo(current => ({ ...current, appId: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /><input type="password" placeholder="Zalo App Secret" value={zalo.appSecret} onChange={event => setZalo(current => ({ ...current, appSecret: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /></div><input type="password" placeholder="OA Secret Key (xác thực webhook)" value={zalo.webhookSecret} onChange={event => setZalo(current => ({ ...current, webhookSecret: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><select value={zalo.branchId} onChange={event => setZalo(current => ({ ...current, branchId: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"><option value="">Chi nhánh nhận tin *</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><div className="rounded-xl bg-sky-50 p-3 text-[11px] font-bold leading-5 text-sky-800">Webhook cần nhập trên Zalo Developers: <span className="select-all break-all">{window.location.origin}/api/zalo/webhook</span></div><button disabled={busy === 'zalo-create' || !zalo.oaId || !zalo.accessToken || !zalo.branchId} onClick={() => void act('zalo-create', async () => { await createManualZaloConnection(zalo); setZalo({ oaId: '', oaName: '', accessToken: '', refreshToken: '', appId: '', appSecret: '', webhookSecret: '', branchId: '', historyDays: 30 }); setTab('CONNECTED'); }, 'Đã thêm Zalo OA. Bước tiếp theo: bấm Kiểm tra rồi cấu hình webhook trên Zalo Developers.')} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-sm font-black text-white disabled:opacity-50">{busy === 'zalo-create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu Zalo OA</button></section>}
          {addProvider === 'TIKTOK_BUSINESS' && <div className="space-y-3">
            <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 to-fuchsia-950 p-4 text-white shadow-sm"><div className="flex gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-zinc-950"><Music2 className="h-7 w-7" /></div><div><h2 className="text-sm font-black">Đăng nhập TikTok Business</h2><p className="mt-1 text-xs leading-5 text-white/70">TikTok App phải được duyệt Business Messaging API. Token chỉ lưu mã hóa trên server.</p></div></div><button disabled={Boolean(busy)} onClick={() => void beginTikTokOAuth()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-zinc-950 disabled:opacity-50">{busy.startsWith('tiktok-oauth') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Đăng nhập TikTok Business</button></section>
            {tiktokOauthSession && <section className="space-y-3 rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm"><div><h3 className="text-sm font-black">Tài khoản đã xác nhận</h3><p className="mt-1 text-[11px] text-zinc-500">Business ID: {tiktokOauthSession.businessId}</p></div><input value={tiktokImport.displayName} onChange={event => setTikTokImport(current => ({ ...current, displayName: event.target.value }))} placeholder="Tên hiển thị" className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><select value={tiktokImport.branchId} onChange={event => setTikTokImport(current => ({ ...current, branchId: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"><option value="">Chi nhánh nhận tin *</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button disabled={busy === 'tiktok-oauth-import' || !tiktokImport.branchId} onClick={() => void importTikTok()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff4b16] text-sm font-black text-white disabled:opacity-50">{busy === 'tiktok-oauth-import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu tài khoản TikTok</button></section>}
            <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm"><summary className="cursor-pointer list-none p-4 text-sm font-black">Nhập token thủ công <span className="text-zinc-400">⌄</span></summary><div className="space-y-3 border-t border-zinc-100 p-4"><div className="grid gap-3 sm:grid-cols-2"><input placeholder="Business ID / open_id *" value={tiktok.businessId} onChange={event => setTikTok(current => ({ ...current, businessId: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /><input placeholder="Tên tài khoản" value={tiktok.displayName} onChange={event => setTikTok(current => ({ ...current, displayName: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /></div><input type="password" placeholder="Access Token *" value={tiktok.accessToken} onChange={event => setTikTok(current => ({ ...current, accessToken: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><input type="password" placeholder="Refresh Token" value={tiktok.refreshToken} onChange={event => setTikTok(current => ({ ...current, refreshToken: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input placeholder="TikTok App ID" value={tiktok.appId} onChange={event => setTikTok(current => ({ ...current, appId: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /><input type="password" placeholder="TikTok App Secret" value={tiktok.appSecret} onChange={event => setTikTok(current => ({ ...current, appSecret: event.target.value }))} className="h-12 rounded-xl border border-zinc-200 px-3 text-sm" /></div><select value={tiktok.branchId} onChange={event => setTikTok(current => ({ ...current, branchId: event.target.value }))} className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"><option value="">Chi nhánh nhận tin *</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><div className="rounded-xl bg-zinc-100 p-3 text-[11px] font-bold leading-5 text-zinc-700">Webhook: <span className="select-all break-all">{window.location.origin}/api/tiktok/webhook</span></div><button disabled={busy === 'tiktok-create' || !tiktok.businessId || !tiktok.accessToken || !tiktok.branchId} onClick={() => void act('tiktok-create', async () => { await createManualTikTokConnection(tiktok); setTikTok({ businessId: '', displayName: '', accessToken: '', refreshToken: '', appId: '', appSecret: '', branchId: '', historyDays: 30 }); setTab('CONNECTED'); }, 'Đã thêm TikTok Business. Bấm Kiểm tra để đăng ký webhook realtime.')} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-sm font-black text-white disabled:opacity-50">{busy === 'tiktok-create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu TikTok Business</button></div></details>
          </div>}
        </div>}

        {tab === 'ROUTING' && <div className="space-y-3">{connections.map(connection => { const Icon = connection.provider === 'ZALO_OA' ? Smartphone : connection.provider === 'TIKTOK_BUSINESS' ? Music2 : Facebook; return <section key={connection.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><Icon className={`h-5 w-5 ${connection.provider === 'ZALO_OA' ? 'text-sky-500' : connection.provider === 'TIKTOK_BUSINESS' ? 'text-zinc-950' : 'text-blue-600'}`} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{connection.displayName}</h3><p className="text-[10px] text-zinc-500">Tin mới hiện về: {connection.branchName || 'Chưa chọn'}</p></div></div><select value={connection.branchId} onChange={event => void act(`route-${connection.id}`, () => updateMetaConnection(connection.id, { branchId: event.target.value }), 'Đã đổi chi nhánh nhận tin.')} className="mt-3 h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="">Chọn chi nhánh</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></section>; })}</div>}

        {tab === 'SYNC' && <div className="space-y-3">{connections.map(connection => <section key={connection.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-black">{connection.displayName}</h3><p className="mt-1 text-[11px] text-zinc-500">{connection.provider === 'ZALO_OA' ? 'Realtime qua webhook · làm mới tin gần nhất khi mở hội thoại' : connection.provider === 'TIKTOK_BUSINESS' ? `Realtime + tối đa ${connection.historyDays} ngày lịch sử TikTok` : `Lấy ${connection.historyDays} ngày · ${connection.includeComments ? 'gồm bình luận' : 'chỉ tin nhắn'}`}</p></div><button disabled={Boolean(busy)} onClick={() => void syncPage(connection)} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#ff4b16] px-3 text-[11px] font-black text-white disabled:opacity-50">{busy === `sync-${connection.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {connection.provider === 'ZALO_OA' ? 'Kiểm tra' : 'Đồng bộ'}</button></div><div className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-[10px] font-bold text-zinc-600"><Clock3 className="h-4 w-4" /> Webhook gần nhất: {formatTime(connection.lastWebhookAt)}</div></section>)}</div>}

        {tab === 'LOGS' && <div className="space-y-2">{!events.length && <div className="rounded-2xl bg-white p-8 text-center text-xs font-bold text-zinc-500">Chưa có hoạt động kết nối.</div>}{events.map(event => <article key={event.id} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100"><ShieldCheck className="h-4 w-4 text-zinc-700" /></div><div className="min-w-0 flex-1"><h3 className="text-xs font-black text-zinc-900">{event.eventType.replaceAll('_', ' ')}</h3><p className="mt-1 truncate text-[10px] text-zinc-500">Page {event.pageId || '—'} · {event.actorName || 'Hệ thống'}</p><p className="mt-1 text-[9px] text-zinc-400">{formatTime(event.occurredAt)}</p></div></article>)}</div>}
      </main>

      {currentUserRole !== 'ADMIN' && <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800"><HelpCircle className="h-4 w-4" /> Chỉ Admin được thêm, đổi token hoặc ngắt kết nối kênh.</div>}
    </div>
  );
};
