import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Bot, CalendarDays, Check, ChevronRight, Clock3, Headphones, Loader2, LogIn, MapPin, MessageCircle, Package, Phone, RefreshCw, Send, ShieldCheck, Smartphone, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { customerAuth, requestCustomerPhoneOtp, requestCustomerPushToken, resetCustomerPhoneRecaptcha } from '../lib/firebase';
import { CUSTOMER_REPAIR_ISSUES, customerRepairIssueByCode } from '../../shared/customerRepairIssues';
import {
  createCustomerConversation, createCustomerServiceRequest, createQuoteApprovalChallenge, customerConversationMessages, customerDevice, customerDevices, customerMe, customerNotifications, customerPublicBootstrap, customerPublicChat, customerPromotions, customerRepairs, customerRepair, decideCustomerQuote, handoffCustomerConversation, linkCustomerAccount, readCustomerNotification, saveCustomerPushSubscription, sendCustomerConversationMessage, updateCustomerMe, uploadCustomerEvidence,
  type CustomerBootstrap, type CustomerChatMessage, type CustomerDevice, type CustomerMe, type CustomerNotification, type CustomerPromotion, type CustomerRepair, type CustomerRequest
} from '../services/customerPortalApiClient';

type PortalTab = 'home' | 'devices' | 'repairs' | 'promotions' | 'account';
type Overlay = 'login' | 'request' | 'repair' | 'device' | 'quote' | 'chat' | 'notifications' | 'promotion' | null;
const QuickQuoteMiniweb = React.lazy(() => import('./QuickQuoteMiniweb').then(module => ({ default: module.QuickQuoteMiniweb })));

const portalPaths: Record<PortalTab, string> = {
  home: '/khach-hang', devices: '/khach-hang/thiet-bi', repairs: '/khach-hang/sua-chua', promotions: '/khach-hang/uu-dai', account: '/khach-hang/tai-khoan'
};
function tabFromLocation(): PortalTab {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/thiet-bi')) return 'devices';
  if (path.includes('/sua-chua')) return 'repairs';
  if (path.includes('/uu-dai')) return 'promotions';
  if (path.includes('/tai-khoan')) return 'account';
  return 'home';
}

const orange = '#ff4b16';
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Chưa cập nhật';
const dateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';

function classNames(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }

function StatusPill({ label, tone = 'orange' }: { label: string; tone?: 'orange' | 'green' | 'blue' | 'gray' | 'red' }) {
  const tones = { orange: 'bg-orange-50 text-orange-700', green: 'bg-emerald-50 text-emerald-700', blue: 'bg-sky-50 text-sky-700', gray: 'bg-zinc-100 text-zinc-600', red: 'bg-rose-50 text-rose-700' };
  return <span className={classNames('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black', tones[tone])}>{label}</span>;
}

function AppButton({ children, onClick, primary = false, disabled = false, className = '', type = 'button', id }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit'; id?: string }) {
  return <button id={id} type={type} onClick={onClick} disabled={disabled} className={classNames('min-h-11 rounded-2xl px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50', primary ? 'bg-[#ff4b16] text-white shadow-lg shadow-orange-200 hover:bg-[#e94312]' : 'border border-zinc-200 bg-white text-zinc-700 hover:border-orange-300 hover:text-orange-700', className)}>{children}</button>;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: React.ElementType; title: string; text: string; action?: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-zinc-200 bg-white px-5 py-10 text-center"><Icon className="mx-auto h-9 w-9 text-zinc-300" /><p className="mt-3 font-black text-zinc-800">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{text}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function CustomerLoginView({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<Awaited<ReturnType<typeof requestCustomerPhoneOtp>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsLink, setNeedsLink] = useState(false);
  const [verificationValue, setVerificationValue] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    resetCustomerPhoneRecaptcha();
    return () => {
      document.body.style.overflow = previousOverflow;
      resetCustomerPhoneRecaptcha();
    };
  }, []);

  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await requestCustomerPhoneOtp(phone, 'customer-phone-recaptcha');
      setConfirmation(result);
    } catch (cause: any) {
      setError(cause?.message || 'Không gửi được OTP.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!confirmation || code.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      await confirmation.confirm(code);
      try {
        await linkCustomerAccount({ displayName });
        onDone();
      } catch (cause: any) {
        if (String(cause?.message || '').includes('CUSTOMER_IDENTITY_ADDITIONAL_VERIFICATION_REQUIRED')) setNeedsLink(true);
        else throw cause;
      }
    } catch (cause: any) {
      setError(cause?.message || 'Mã OTP chưa đúng hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  const completeLink = async () => {
    setLoading(true);
    setError('');
    try {
      await linkCustomerAccount({ verificationValue, displayName });
      onDone();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể liên kết dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Đăng nhập PhoneHouse Care" className="fixed inset-0 z-[100] overflow-y-auto bg-[#fffaf7] sm:bg-black/50 sm:p-6">
      <div className="mx-auto min-h-full w-full max-w-lg bg-[#fffaf7] sm:min-h-0 sm:rounded-[2rem] sm:shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-100 bg-[#fffaf7]/95 px-4 py-3 backdrop-blur sm:rounded-t-[2rem]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ff4b16] text-white"><Smartphone className="h-5 w-5" /></div>
            <div><p className="text-sm font-black">PhoneHouse Care</p><p className="text-[11px] font-semibold text-zinc-500">Đăng nhập an toàn bằng OTP</p></div>
          </div>
          <button type="button" aria-label="Đóng đăng nhập" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl text-zinc-600 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
        </header>

        <div className="px-4 pb-8 pt-5 sm:px-7 sm:pb-7">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff4b16]">Tài khoản khách hàng</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-950">{needsLink ? 'Xác minh đúng hồ sơ' : confirmation ? 'Nhập mã OTP' : 'Đăng nhập để xem thiết bị'}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Tra cứu đúng bảo hành, phiếu sửa và tiến độ gắn với số điện thoại đã mua hàng.</p>
          </div>

          <div className="rounded-3xl border border-orange-100 bg-white p-5 shadow-lg shadow-orange-100/40">
            {needsLink ? (
              <>
                <p className="text-sm leading-6 text-zinc-600">Có nhiều hồ sơ dùng số này. Nhập mã hóa đơn hoặc IMEI đã mua để PhoneHouse liên kết đúng dữ liệu.</p>
                <label className="mt-4 block text-sm font-bold text-zinc-700">Mã hóa đơn hoặc IMEI
                  <input autoFocus value={verificationValue} onChange={event => setVerificationValue(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 font-mono outline-none focus:border-orange-500" placeholder="VD: HD-260901 hoặc 35…" />
                </label>
                <AppButton primary className="mt-4 w-full" onClick={() => void completeLink()} disabled={loading || !verificationValue.trim()}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Liên kết hồ sơ'}</AppButton>
              </>
            ) : confirmation ? (
              <>
                <p className="text-sm leading-6 text-zinc-600">Mã xác nhận đã được gửi. Nhập 6 số trong tin nhắn để tiếp tục.</p>
                <input autoFocus autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-4 h-14 w-full rounded-2xl border border-zinc-200 text-center text-2xl font-black tracking-[.35em] outline-none focus:border-orange-500" placeholder="••••••" />
                <AppButton primary className="mt-4 w-full" onClick={() => void verify()} disabled={loading || code.length !== 6}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Xác nhận OTP'}</AppButton>
                <button type="button" className="mt-3 min-h-11 w-full text-xs font-bold text-zinc-500 underline" onClick={() => { setConfirmation(null); setCode(''); setError(''); resetCustomerPhoneRecaptcha(); }}>Đổi số điện thoại</button>
              </>
            ) : (
              <>
                <label className="block text-sm font-bold text-zinc-700">Số điện thoại
                  <input autoFocus autoComplete="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 text-base outline-none focus:border-orange-500" placeholder="09xx xxx xxx" />
                </label>
                <label className="mt-3 block text-sm font-bold text-zinc-700">Tên hiển thị <span className="font-medium text-zinc-400">(không bắt buộc)</span>
                  <input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 text-base outline-none focus:border-orange-500" placeholder="Nguyễn Văn A" />
                </label>
                <div id="customer-phone-recaptcha" />
                <AppButton primary className="mt-5 w-full" onClick={() => void sendCode()} disabled={loading || !phone.trim()}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Gửi mã OTP'}</AppButton>
                <p className="mt-3 text-center text-[10px] leading-4 text-zinc-400">Firebase sẽ mở bước xác minh chống spam khi cần. reCAPTCHA áp dụng Chính sách quyền riêng tư và Điều khoản của Google.</p>
              </>
            )}
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</p>}
          </div>
          <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full text-center text-sm font-bold text-zinc-600 underline underline-offset-4">Tiếp tục xem ưu đãi và cửa hàng</button>
        </div>
      </div>
    </div>
  );
}

function CustomerLogin({ onDone, onGuest }: { onDone: () => void; onGuest: () => void }) {
  return <CustomerLoginView onDone={onDone} onClose={onGuest} />;
  /* Legacy implementation kept temporarily inside this comment so this patch
     remains easy to audit against the previous production UI.
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<Awaited<ReturnType<typeof requestCustomerPhoneOtp>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsLink, setNeedsLink] = useState(false);
  const [verificationValue, setVerificationValue] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    void prepareCustomerPhoneRecaptcha('customer-phone-recaptcha').catch(error => setError(error?.message || 'Không tải được bước xác minh chống spam.'));
    return resetCustomerPhoneRecaptcha;
  }, []);

  const sendCode = async () => {
    setLoading(true); setError('');
    try { setConfirmation(await requestCustomerPhoneOtp(phone, 'customer-phone-recaptcha')); } catch (e: any) { setError(e?.message || 'Không gửi được OTP.'); }
    finally { setLoading(false); }
  };
  const verify = async () => {
    if (!confirmation || code.trim().length < 6) return;
    setLoading(true); setError('');
    try {
      await confirmation.confirm(code.trim());
      try { await linkCustomerAccount({ displayName }); onDone(); }
      catch (e: any) {
        if (String(e?.message || '').includes('CUSTOMER_IDENTITY_ADDITIONAL_VERIFICATION_REQUIRED')) setNeedsLink(true);
        else throw e;
      }
    } catch (e: any) { setError(e?.message || 'Mã OTP chưa đúng.'); }
    finally { setLoading(false); }
  };
  const completeLink = async () => {
    setLoading(true); setError('');
    try { await linkCustomerAccount({ verificationValue, displayName }); onDone(); }
    catch (e: any) { setError(e?.message || 'Không thể liên kết dữ liệu.'); }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-[#fffaf7] px-4 py-6 sm:px-6"><div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center"><div className="mb-6 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#ff4b16] to-[#ff784b] text-white shadow-xl shadow-orange-200"><Smartphone className="h-8 w-8" /></div><p className="mt-4 text-xs font-black uppercase tracking-[.22em] text-[#ff4b16]">PhoneHouse Care</p><h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950">Chăm sóc thiết bị của bạn</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Tra cứu bảo hành, theo dõi sửa chữa và nhận ưu đãi trong một nơi.</p></div><div className="rounded-3xl border border-orange-100 bg-white p-5 shadow-xl shadow-orange-100/50"><h2 className="font-black text-zinc-900">{needsLink ? 'Xác minh thêm một lần' : confirmation ? 'Nhập mã OTP' : 'Đăng nhập bằng số điện thoại'}</h2>{needsLink ? <><p className="mt-2 text-sm leading-6 text-zinc-500">Có nhiều hồ sơ dùng số này. Nhập mã hóa đơn hoặc IMEI đã mua để liên kết đúng dữ liệu.</p><label className="mt-4 block text-sm font-bold text-zinc-700">Mã hóa đơn hoặc IMEI<input value={verificationValue} onChange={e => setVerificationValue(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 font-mono outline-none focus:border-orange-500" placeholder="VD: INV-20260901 hoặc 35..." /></label><AppButton primary className="mt-4 w-full" onClick={() => void completeLink()} disabled={loading || !verificationValue.trim()}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Liên kết hồ sơ'}</AppButton></> : confirmation ? <><p className="mt-2 text-sm text-zinc-500">Mã xác nhận đã gửi tới số điện thoại của bạn.</p><input autoFocus inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-4 h-14 w-full rounded-2xl border border-zinc-200 text-center text-2xl font-black tracking-[.4em] outline-none focus:border-orange-500" placeholder="••••••" /><AppButton primary className="mt-4 w-full" onClick={() => void verify()} disabled={loading || code.length < 6}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Xác nhận OTP'}</AppButton><button className="mt-3 w-full text-xs font-bold text-zinc-500 underline" onClick={() => { setConfirmation(null); resetCustomerPhoneRecaptcha(); }}>Đổi số điện thoại</button></> : <><label className="mt-4 block text-sm font-bold text-zinc-700">Số điện thoại<input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 text-base outline-none focus:border-orange-500" placeholder="09xx xxx xxx" /></label><label className="mt-3 block text-sm font-bold text-zinc-700">Tên hiển thị (không bắt buộc)<input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 text-base outline-none focus:border-orange-500" placeholder="Nguyễn Văn A" /></label><p className="mt-4 text-xs font-bold text-zinc-500">Xác nhận chống spam trước khi nhận mã:</p><div id="customer-phone-recaptcha" className="mt-2 min-h-[78px] overflow-hidden rounded-xl" /><AppButton primary className="mt-3 w-full" onClick={() => void sendCode()} disabled={loading || !phone.trim()}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Gửi mã OTP'}</AppButton></>}{error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</p>}</div><button onClick={onGuest} className="mt-5 text-center text-sm font-bold text-zinc-600 underline underline-offset-4">Tiếp tục xem ưu đãi và cửa hàng</button></div></div>;
  */
}

function BottomNav({ active, onChange }: { active: PortalTab; onChange: (tab: PortalTab) => void }) {
  const items: Array<[PortalTab, string, React.ElementType]> = [['home', 'Trang chủ', Smartphone], ['devices', 'Thiết bị', ShieldCheck], ['repairs', 'Sửa chữa', Wrench], ['promotions', 'Ưu đãi', Sparkles], ['account', 'Tài khoản', UserRound]];
  return <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,.06)] backdrop-blur lg:sticky lg:bottom-auto lg:mt-8 lg:rounded-2xl lg:border lg:p-2 lg:shadow-none"><div className="mx-auto flex max-w-2xl justify-around lg:gap-2">{items.map(([id, label, Icon]) => <button key={id} onClick={() => onChange(id)} className={classNames('flex min-h-14 min-w-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black transition lg:min-h-11 lg:flex-row lg:gap-2 lg:text-xs', active === id ? 'bg-orange-50 text-[#ff4b16]' : 'text-zinc-500 hover:bg-zinc-50')}><Icon className="h-5 w-5" />{label}</button>)}</div></nav>;
}

function Header({ brand, me, unread, onNotifications, onLogin }: { brand: CustomerBootstrap['brand']; me: CustomerMe | null; unread: number; onNotifications: () => void; onLogin: () => void }) {
  return <header className="sticky top-0 z-20 border-b border-zinc-100 bg-[#fffaf7]/95 px-4 py-3 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ff4b16] text-white"><Smartphone className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{brand.name || 'PhoneHouse'} <span className="font-medium text-zinc-400">Care</span></p><p className="truncate text-[11px] font-semibold text-zinc-500">{me ? `Xin chào, ${me.displayName}` : brand.slogan}</p></div></div><div className="flex shrink-0 items-center gap-1">{me ? <button aria-label="Thông báo" onClick={onNotifications} className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-zinc-700 hover:bg-zinc-100"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff4b16] px-1 text-[9px] font-black text-white">{unread > 9 ? '9+' : unread}</span>}</button> : <button onClick={onLogin} className="flex h-11 items-center gap-1.5 rounded-2xl bg-zinc-950 px-3 text-xs font-black text-white"><LogIn className="h-4 w-4" />Đăng nhập</button>}</div></div></header>;
}

function HomePage({ bootstrap, me, repairs, devices, promotions, onTab, onOpenRepair, onOpenQuote, onOpenChat, onOpenDevice }: { bootstrap: CustomerBootstrap; me: CustomerMe | null; repairs: CustomerRepair[]; devices: CustomerDevice[]; promotions: CustomerPromotion[]; onTab: (tab: PortalTab) => void; onOpenRepair: () => void; onOpenQuote: () => void; onOpenChat: () => void; onOpenDevice: (device: CustomerDevice) => void }) {
  const activeRepairs = repairs.filter(item => item.stage !== 'COMPLETED');
  const expiring = devices.filter(item => item.warrantyStatus === 'EXPIRING');
  return <div className="space-y-5"><section className="relative overflow-hidden rounded-[2rem] bg-zinc-950 p-5 text-white shadow-xl sm:p-7"><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#ff4b16]/30 blur-3xl" /><div className="relative max-w-xl"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-300">PhoneHouse Care</p><h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">An tâm dùng máy,<br />có PhoneHouse đồng hành.</h1><p className="mt-3 max-w-md text-sm leading-6 text-zinc-300">Theo dõi bảo hành, sửa chữa và nhận hỗ trợ minh bạch ngay trên điện thoại.</p><div className="mt-5 flex flex-wrap gap-2"><AppButton primary onClick={onOpenQuote}><Sparkles className="mr-1.5 inline h-4 w-4" />Báo giá nhanh</AppButton><AppButton className="border-zinc-700 bg-white/10 text-white hover:bg-white/20" onClick={onOpenChat}><MessageCircle className="mr-1.5 inline h-4 w-4" />Chat với PhoneHouse</AppButton></div></div></section>{me && activeRepairs[0] && <section><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-black text-zinc-950">Đang được xử lý</h2><button onClick={() => onTab('repairs')} className="text-xs font-black text-[#ff4b16]">Xem tất cả</button></div><button onClick={() => onTab('repairs')} className="w-full rounded-3xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:border-orange-300"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{activeRepairs[0].model}</p><p className="mt-1 font-mono text-xs text-zinc-500">{activeRepairs[0].imeiMasked} · {activeRepairs[0].code}</p></div><StatusPill label={activeRepairs[0].stageLabel} tone={activeRepairs[0].stage === 'WAITING_QUOTE_APPROVAL' ? 'orange' : 'blue'} /></div><div className="mt-4 flex items-center justify-between text-xs"><span className="text-zinc-500">{activeRepairs[0].promisedAt ? `Hẹn trả ${dateTime(activeRepairs[0].promisedAt)}` : 'Đang cập nhật thời gian hẹn'}</span><ChevronRight className="h-4 w-4 text-zinc-400" /></div></button></section>}{me && expiring.length > 0 && <section><h2 className="mb-2 text-base font-black text-zinc-950">Bảo hành sắp hết</h2><div className="flex gap-3 overflow-x-auto pb-1">{expiring.slice(0, 3).map(device => <button key={device.id} onClick={() => onOpenDevice(device)} className="min-w-[240px] rounded-3xl border border-amber-100 bg-amber-50 p-4 text-left"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white p-2 text-amber-600"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-black text-zinc-900">{device.model}</p><p className="mt-1 text-xs text-amber-700">Còn {device.daysRemaining} ngày</p></div></div></button>)}</div></section>}<section><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-black text-zinc-950">Khám phá nhanh</h2></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><button onClick={() => onTab('devices')} className="rounded-3xl border border-zinc-200 bg-white p-4 text-left"><ShieldCheck className="h-6 w-6 text-emerald-600" /><p className="mt-3 text-sm font-black">Bảo hành</p><p className="mt-1 text-xs text-zinc-500">Kiểm tra thiết bị</p></button><button onClick={onOpenRepair} className="rounded-3xl border border-zinc-200 bg-white p-4 text-left"><Wrench className="h-6 w-6 text-orange-600" /><p className="mt-3 text-sm font-black">Sửa chữa</p><p className="mt-1 text-xs text-zinc-500">Gửi yêu cầu online</p></button><button onClick={() => onTab('promotions')} className="rounded-3xl border border-zinc-200 bg-white p-4 text-left"><Sparkles className="h-6 w-6 text-purple-600" /><p className="mt-3 text-sm font-black">Ưu đãi</p><p className="mt-1 text-xs text-zinc-500">Dành cho bạn</p></button><a href={`tel:${bootstrap.brand.hotline}`} className="rounded-3xl border border-zinc-200 bg-white p-4 text-left"><Phone className="h-6 w-6 text-sky-600" /><p className="mt-3 text-sm font-black">Hotline</p><p className="mt-1 text-xs text-zinc-500">{bootstrap.brand.hotline || 'Liên hệ ngay'}</p></a></div></section><PromotionStrip promotions={promotions} onOpenPromotion={() => onTab('promotions')} /></div>;
}

function PromotionStrip({ promotions, onOpenPromotion }: { promotions: CustomerPromotion[]; onOpenPromotion: () => void }) {
  if (!promotions.length) return null;
  return <section><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-black text-zinc-950">Ưu đãi nổi bật</h2><button onClick={onOpenPromotion} className="text-xs font-black text-[#ff4b16]">Xem tất cả</button></div><div className="flex gap-3 overflow-x-auto pb-1">{promotions.slice(0, 3).map(promotion => <button key={promotion.id} onClick={onOpenPromotion} className="min-w-[270px] overflow-hidden rounded-3xl border border-zinc-200 bg-white text-left shadow-sm"><div className="h-24 bg-gradient-to-br from-orange-100 via-amber-50 to-white p-4">{promotion.bannerUrl ? <img src={promotion.bannerUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <Sparkles className="h-7 w-7 text-orange-500" />}</div><div className="p-4"><div className="flex items-center justify-between gap-2"><p className="line-clamp-1 font-black text-zinc-900">{promotion.title}</p>{promotion.personalized && <StatusPill label="Dành cho bạn" tone="orange" />}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{promotion.summary}</p></div></button>)}</div></section>;
}

function DevicesPage({ devices, onOpen, onLogin }: { devices: CustomerDevice[]; onOpen: (device: CustomerDevice) => void; onLogin: () => void }) {
  if (!devices.length) return <EmptyState icon={ShieldCheck} title="Chưa có thiết bị được liên kết" text="Đăng nhập bằng số điện thoại đã mua hàng tại PhoneHouse để xem bảo hành và lịch sử thiết bị." action={<AppButton primary onClick={onLogin}>Đăng nhập để liên kết</AppButton>} />;
  return <div className="space-y-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">Thiết bị của tôi</p><h1 className="mt-1 text-2xl font-black text-zinc-950">Bảo hành & thiết bị</h1><p className="mt-1 text-sm text-zinc-500">Thông tin được liên kết theo số điện thoại đã xác minh.</p></div><div className="grid gap-3 sm:grid-cols-2">{devices.map(device => <button key={device.id} onClick={() => onOpen(device)} className="rounded-3xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-2xl bg-zinc-100 p-3 text-zinc-700"><Smartphone className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate font-black text-zinc-900">{device.model || 'Thiết bị PhoneHouse'}</p><p className="mt-1 font-mono text-xs text-zinc-500">{device.imeiMasked}</p></div></div><StatusPill label={device.warrantyStatus === 'ACTIVE' ? 'Còn hạn' : device.warrantyStatus === 'EXPIRING' ? 'Sắp hết hạn' : device.warrantyStatus === 'EXPIRED' ? 'Hết hạn' : 'Chưa xác định'} tone={device.warrantyStatus === 'ACTIVE' ? 'green' : device.warrantyStatus === 'EXPIRING' ? 'orange' : 'gray'} /></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-xs"><div><p className="text-zinc-500">Hết hạn</p><p className="mt-1 font-bold text-zinc-800">{dateOnly(device.warrantyUntil)}</p></div><div><p className="text-zinc-500">Chi nhánh</p><p className="mt-1 truncate font-bold text-zinc-800">{device.branchName || 'PhoneHouse'}</p></div></div></button>)}</div></div>;
}

function RepairsPage({ repairs, requests, onOpen, onRequest, onLogin }: { repairs: CustomerRepair[]; requests: CustomerRequest[]; onOpen: (repair: CustomerRepair) => void; onRequest: () => void; onLogin: () => void }) {
  if (!repairs.length && !requests.length) return <EmptyState icon={Wrench} title="Chưa có lịch sử sửa chữa" text="Bạn có thể gửi yêu cầu sửa chữa hoặc bảo hành trực tiếp trên app." action={<AppButton primary onClick={onRequest}>Gửi yêu cầu sửa chữa</AppButton>} />;
  return <div className="space-y-5"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">Repair care</p><h1 className="mt-1 text-2xl font-black text-zinc-950">Sửa chữa & bảo hành</h1></div><AppButton primary onClick={onRequest}>+ Tạo yêu cầu</AppButton></div>{requests.length > 0 && <section><h2 className="mb-2 text-sm font-black text-zinc-700">Yêu cầu đã gửi</h2><div className="space-y-2">{requests.map(request => <div key={request.id} className="rounded-3xl border border-sky-100 bg-sky-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{request.model}</p><p className="mt-1 text-xs text-zinc-500">{request.type === 'WARRANTY' ? 'Yêu cầu bảo hành' : 'Sửa dịch vụ'} · {request.imeiMasked}</p></div><StatusPill label={request.statusLabel} tone={request.status === 'REJECTED' ? 'red' : request.status === 'CONVERTED' ? 'green' : 'blue'} /></div><p className="mt-2 line-clamp-2 text-sm text-zinc-600">{request.description}</p><p className="mt-2 text-[11px] text-zinc-400">Gửi lúc {dateTime(request.createdAt)} · {request.branchName}</p></div>)}</div></section>}<section><h2 className="mb-2 text-sm font-black text-zinc-700">Phiếu đang theo dõi</h2>{repairs.length ? <div className="space-y-3">{repairs.map(repair => <button key={repair.id} onClick={() => onOpen(repair)} className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{repair.model}</p><p className="mt-1 font-mono text-xs text-zinc-500">{repair.imeiMasked} · {repair.code}</p></div><StatusPill label={repair.stageLabel} tone={repair.stage === 'COMPLETED' ? 'green' : repair.stage === 'WAITING_QUOTE_APPROVAL' ? 'orange' : 'blue'} /></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-500">{repair.promisedAt ? `Hẹn trả: ${dateTime(repair.promisedAt)}` : 'Đang cập nhật hẹn trả'}</span><ChevronRight className="h-4 w-4 text-zinc-400" /></div></button>)}</div> : <p className="text-sm text-zinc-500">Chưa có Work Order chính thức. Nhân viên sẽ cập nhật sau khi tiếp nhận yêu cầu.</p>}</section></div>;
}

function PromotionsPage({ promotions, onOpen }: { promotions: CustomerPromotion[]; onOpen: (promotion: CustomerPromotion) => void }) {
  const [filter, setFilter] = useState('ALL');
  const filters = [['ALL', 'Tất cả'], ['DEVICE', 'Mua máy'], ['REPAIR', 'Sửa chữa'], ['ACCESSORY', 'Phụ kiện'], ['LOYALTY', 'Khách thân thiết']];
  const items = filter === 'ALL' ? promotions : promotions.filter(item => item.category === filter);
  return <div className="space-y-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">Ưu đãi PhoneHouse</p><h1 className="mt-1 text-2xl font-black text-zinc-950">Khuyến mãi dành cho bạn</h1><p className="mt-1 text-sm text-zinc-500">Điều kiện và thời hạn được cập nhật từ hệ thống.</p></div><div className="flex gap-2 overflow-x-auto pb-1">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={classNames('shrink-0 rounded-full px-3.5 py-2 text-xs font-black', filter === value ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-600')}>{label}</button>)}</div>{items.length ? <div className="grid gap-3 sm:grid-cols-2">{items.map(promotion => <button key={promotion.id} onClick={() => onOpen(promotion)} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white text-left shadow-sm transition hover:border-orange-300"><div className="h-36 bg-gradient-to-br from-orange-100 via-amber-50 to-white p-4">{promotion.bannerUrl ? <img src={promotion.bannerUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <Sparkles className="h-9 w-9 text-orange-500" />}</div><div className="p-4"><div className="flex flex-wrap items-center gap-2"><StatusPill label={promotion.category === 'REPAIR' ? 'Sửa chữa' : promotion.category === 'DEVICE' ? 'Mua máy' : promotion.category === 'ACCESSORY' ? 'Phụ kiện' : promotion.category === 'LOYALTY' ? 'Khách thân thiết' : 'Ưu đãi'} />{promotion.personalized && <StatusPill label="Dành cho bạn" tone="green" />}</div><h2 className="mt-3 font-black text-zinc-900">{promotion.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{promotion.summary}</p><p className="mt-3 text-xs font-bold text-zinc-400">Đến {dateOnly(promotion.endsAt)}</p></div></button>)}</div> : <EmptyState icon={Sparkles} title="Chưa có ưu đãi phù hợp" text="Hãy quay lại sau hoặc bật nhận thông tin khuyến mãi trong Tài khoản." />}</div>;
}

function AccountPage({ me, onLogin, onSave, onLogout, onEnablePush }: { me: CustomerMe | null; onLogin: () => void; onSave: (input: Partial<CustomerMe>) => Promise<void>; onLogout: () => void; onEnablePush: () => Promise<void> }) {
  const [name, setName] = useState(me?.displayName || '');
  const [marketing, setMarketing] = useState(me?.marketingConsent || false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(me?.notificationConsent !== false);
  const [pushStatus, setPushStatus] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { setName(me?.displayName || ''); setMarketing(me?.marketingConsent || false); setNotificationsEnabled(me?.notificationConsent !== false); }, [me]);
  const enablePush = async () => {
    setPushBusy(true); setPushStatus('');
    try { await onEnablePush(); setNotificationsEnabled(true); setPushStatus('Đã bật thông báo trên thiết bị này.'); }
    catch (error: any) { setPushStatus(error?.message || 'Không bật được thông báo.'); }
    finally { setPushBusy(false); }
  };
  if (!me) return <EmptyState icon={UserRound} title="Đăng nhập để quản lý tài khoản" text="Dùng OTP điện thoại để xem thiết bị, phiếu sửa và nhận thông báo chính xác." action={<AppButton primary onClick={onLogin}>Đăng nhập bằng OTP</AppButton>} />;
  return <div className="space-y-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">Tài khoản</p><h1 className="mt-1 text-2xl font-black text-zinc-950">Thông tin của tôi</h1></div><section className="rounded-3xl border border-zinc-200 bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-100 text-xl font-black text-orange-700">{(me.displayName || 'K').slice(0, 1).toUpperCase()}</div><div><p className="font-black text-zinc-900">{me.displayName}</p><p className="mt-1 font-mono text-xs text-zinc-500">{me.phoneMasked}</p></div></div><label className="mt-5 block text-sm font-bold text-zinc-700">Tên hiển thị<input value={name} onChange={e => setName(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 outline-none focus:border-orange-500" /></label><label className="mt-4 flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm"><input type="checkbox" checked={notificationsEnabled} onChange={e => setNotificationsEnabled(e.target.checked)} className="mt-1 h-4 w-4 accent-orange-600" /><span><b>Nhận thông báo nghiệp vụ</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Tiến độ sửa chữa và báo giá luôn có trong app; bật push để nhận ngay trên điện thoại.</span></span></label><label className="mt-3 flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm"><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 accent-orange-600" /><span><b>Nhận ưu đãi cá nhân hóa</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Chỉ nhận thông tin phù hợp; bạn có thể tắt bất cứ lúc nào.</span></span></label><div className="mt-4 flex flex-wrap gap-2"><AppButton primary onClick={() => void onSave({ displayName: name, notificationConsent: notificationsEnabled, marketingConsent: marketing })}>Lưu thay đổi</AppButton><AppButton onClick={() => void enablePush()} disabled={pushBusy}>{pushBusy ? 'Đang bật…' : 'Bật push trên máy này'}</AppButton><AppButton onClick={onLogout}>Đăng xuất</AppButton></div>{pushStatus && <p className="mt-3 text-xs font-bold text-zinc-600">{pushStatus}</p>}</section><section className="rounded-3xl border border-zinc-200 bg-white p-5"><h2 className="font-black">Quyền riêng tư & hỗ trợ</h2><p className="mt-2 text-sm leading-6 text-zinc-500">PhoneHouse chỉ hiển thị dữ liệu mua hàng, bảo hành và sửa chữa đã liên kết với số điện thoại của bạn.</p></section></div>;
}

function RepairDetail({ repair, onClose, onReload, onQuote }: { repair: CustomerRepair; onClose: () => void; onReload: () => Promise<void>; onQuote: (repair: CustomerRepair) => void }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-0 sm:p-6"><div className="mx-auto min-h-full max-w-2xl bg-[#fffaf7] sm:min-h-0 sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-[#fffaf7]/95 px-4 py-3 backdrop-blur"><div><p className="font-black text-zinc-900">{repair.model}</p><p className="font-mono text-[11px] text-zinc-500">{repair.code} · {repair.imeiMasked}</p></div><button aria-label="Đóng" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl hover:bg-zinc-100"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-4 sm:p-6"><div className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-zinc-500">Trạng thái hiện tại</p><p className="mt-1 text-lg font-black text-zinc-900">{repair.stageLabel}</p></div><StatusPill label={repair.type === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'} tone={repair.type === 'WARRANTY' ? 'green' : 'orange'} /></div>{repair.promisedAt && <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600"><CalendarDays className="h-4 w-4 text-orange-500" />Hẹn trả: <b>{dateTime(repair.promisedAt)}</b></p>}{repair.diagnosis && <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm leading-6 text-zinc-700"><b>Thông tin kiểm tra:</b> {repair.diagnosis}</p>}</div>{repair.quote.mayDecide && <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4"><div className="flex items-start gap-3"><div className="rounded-2xl bg-orange-500 p-2 text-white"><Wrench className="h-5 w-5" /></div><div className="flex-1"><p className="font-black text-orange-950">Báo giá cần xác nhận</p><p className="mt-1 text-sm text-orange-800">{money.format(repair.quote.amount)} · phiên bản {repair.quote.version}</p><AppButton primary className="mt-3" onClick={() => onQuote(repair)}>Xem & xác nhận báo giá</AppButton></div></div></div>}{repair.timeline.length > 0 && <section><h2 className="mb-3 font-black text-zinc-900">Tiến độ xử lý</h2><div className="space-y-0">{repair.timeline.map((item, index) => <div key={`${item.key}-${index}`} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative flex w-5 shrink-0 justify-center"><span className={classNames('z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-[#fffaf7]', index === repair.timeline.length - 1 ? 'bg-[#ff4b16]' : 'bg-emerald-500')} />{index < repair.timeline.length - 1 && <span className="absolute top-4 h-full w-px bg-zinc-200" />}</div><div><p className="text-sm font-black text-zinc-800">{item.label}</p><p className="mt-1 text-xs text-zinc-500">{dateTime(item.at)}</p></div></div>)}</div></section>}<section className="rounded-3xl border border-zinc-200 bg-white p-4"><h2 className="font-black text-zinc-900">Chi phí & thanh toán</h2><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-2xl bg-zinc-50 p-3"><p className="text-zinc-500">Tổng</p><p className="mt-1 font-black text-zinc-900">{money.format(repair.payment.finalAmount)}</p></div><div className="rounded-2xl bg-emerald-50 p-3"><p className="text-emerald-700">Đã thu</p><p className="mt-1 font-black text-emerald-800">{money.format(repair.payment.paidAmount)}</p></div><div className="rounded-2xl bg-amber-50 p-3"><p className="text-amber-700">Còn lại</p><p className="mt-1 font-black text-amber-800">{money.format(repair.payment.balanceDue)}</p></div></div></section><AppButton onClick={() => void onReload()} className="w-full"><RefreshCw className="mr-2 inline h-4 w-4" />Làm mới tiến độ</AppButton></div></div></div>;
}

function QuoteModal({ repair, onClose, onDone }: { repair: CustomerRepair; onClose: () => void; onDone: () => Promise<void> }) {
  const [step, setStep] = useState<'view' | 'otp'>('view');
  const [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: string } | null>(null);
  const [otpConfirmation, setOtpConfirmation] = useState<Awaited<ReturnType<typeof requestCustomerPhoneOtp>> | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => resetCustomerPhoneRecaptcha, []);
  const accept = async () => {
    setLoading(true); setError('');
    try {
      const result = await createQuoteApprovalChallenge(repair.id);
      const confirmation = await requestCustomerPhoneOtp(customerAuth.currentUser?.phoneNumber || '', 'customer-quote-recaptcha');
      setChallenge(result.data); setOtpConfirmation(confirmation); setStep('otp');
    }
    catch (e: any) { setError(e?.message || 'Không thể tạo phiên xác nhận.'); }
    finally { setLoading(false); }
  };
  const confirm = async () => {
    setLoading(true); setError('');
    try {
      if (!otpConfirmation || !challenge) throw new Error('Vui lòng yêu cầu lại mã OTP.');
      await otpConfirmation.confirm(code);
      const token = await customerAuth.currentUser?.getIdToken(true); if (!token) throw new Error('Vui lòng đăng nhập lại để xác nhận.');
      await decideCustomerQuote(repair.id, { decision: 'ACCEPT', challengeId: challenge.challengeId, reauthToken: token }); await onDone(); onClose();
    } catch (e: any) { setError(e?.message || 'Không thể xác nhận báo giá.'); }
    finally { setLoading(false); }
  };
  const decision = async (value: 'CONSULT' | 'REJECT') => {
    setLoading(true); setError(''); try { await decideCustomerQuote(repair.id, { decision: value, reason: value === 'CONSULT' ? 'Khách muốn được tư vấn lại' : 'Khách từ chối báo giá' }); await onDone(); onClose(); } catch (e: any) { setError(e?.message || 'Không thể ghi nhận lựa chọn.'); } finally { setLoading(false); }
  };
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-[#fffaf7] p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Xác nhận báo giá</h2><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div><div className="mt-4 rounded-3xl bg-white p-4"><p className="text-sm text-zinc-500">{repair.model} · phiên bản {repair.quote.version}</p><p className="mt-2 text-3xl font-black text-zinc-950">{money.format(repair.quote.amount)}</p><p className="mt-2 text-xs leading-5 text-zinc-500">Giá do PhoneHouse phê duyệt. Khi đồng ý, bạn xác nhận bằng OTP mới gửi tới số điện thoại này.</p></div>{step === 'view' ? <div className="mt-4 grid gap-2"><p className="text-xs font-bold text-zinc-500">Xác nhận chống spam trước khi nhận mã:</p><div id="customer-quote-recaptcha" className="min-h-[78px] overflow-hidden rounded-xl" /><AppButton primary className="w-full" onClick={() => void accept()} disabled={loading}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Đồng ý báo giá & nhận OTP'}</AppButton><AppButton className="w-full" onClick={() => void decision('CONSULT')} disabled={loading}>Tôi muốn được tư vấn lại</AppButton><button onClick={() => void decision('REJECT')} disabled={loading} className="py-3 text-xs font-bold text-zinc-500 underline">Từ chối sửa chữa</button></div> : <div className="mt-4"><p className="text-sm font-bold text-zinc-700">Nhập mã OTP mới</p><p className="mt-1 text-xs text-zinc-500">Phiên xác nhận hết hạn lúc {dateTime(challenge?.expiresAt)}</p><input autoFocus inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-3 h-14 w-full rounded-2xl border border-zinc-200 text-center text-2xl font-black tracking-[.4em] outline-none focus:border-orange-500" placeholder="••••••" /><AppButton primary className="mt-3 w-full" onClick={() => void confirm()} disabled={loading || code.length < 6}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <><Check className="mr-2 inline h-4 w-4" />Xác nhận đồng ý</>}</AppButton></div>}{error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</p>}</div></div>;
}

function CustomerRepairIntakeView({ bootstrap, devices, onClose, onDone }: { bootstrap: CustomerBootstrap; devices: CustomerDevice[]; onClose: () => void; onDone: () => Promise<void> }) {
  const initialDevice = devices[0] || null;
  const initialBranchId = bootstrap.branches.some(branch => branch.id === initialDevice?.branchId)
    ? initialDevice!.branchId
    : (bootstrap.branches[0]?.id || '');
  const [step, setStep] = useState(1);
  const [manualDevice, setManualDevice] = useState(devices.length === 0);
  const [deviceId, setDeviceId] = useState(initialDevice?.id || '');
  const [imei, setImei] = useState('');
  const [model, setModel] = useState('');
  const [requestType, setRequestType] = useState<'REPAIR' | 'WARRANTY'>('REPAIR');
  const [issueCode, setIssueCode] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(initialBranchId);
  const [preferredVisitAt, setPreferredVisitAt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [operationKey] = useState(() => `csr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const selectedDevice = devices.find(device => device.id === deviceId) || null;
  const selectedIssue = customerRepairIssueByCode(issueCode);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const chooseLinkedDevice = (device: CustomerDevice) => {
    setManualDevice(false);
    setDeviceId(device.id);
    setImei('');
    setModel('');
    if (bootstrap.branches.some(branch => branch.id === device.branchId)) setBranchId(device.branchId);
  };

  const chooseManualDevice = () => {
    setManualDevice(true);
    setDeviceId('');
  };

  const stepValid = step === 1
    ? (manualDevice ? /^\d{15}$/.test(imei) && model.trim().length >= 2 : Boolean(selectedDevice))
    : step === 2
      ? Boolean(selectedIssue) && description.trim().length >= 5
      : step === 3
        ? true
        : Boolean(branchId);

  const submit = async () => {
    if (!stepValid || !selectedIssue) return;
    setLoading(true);
    setError('');
    try {
      const result = await createCustomerServiceRequest({
        idempotencyKey: operationKey,
        requestType,
        deviceId: manualDevice ? undefined : selectedDevice?.id,
        imei: manualDevice ? imei : undefined,
        model: manualDevice ? model.trim() : undefined,
        issueType: selectedIssue.code,
        issueCode: selectedIssue.code,
        issueLabel: selectedIssue.label,
        description: description.trim(),
        branchId,
        preferredVisitAt: preferredVisitAt || undefined
      });
      for (const file of files.slice(0, 6)) await uploadCustomerEvidence(result.data.id, file);
      await onDone();
      onClose();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Phiếu tiếp nhận sửa chữa" className="fixed inset-0 z-[80] overflow-y-auto bg-[#fffaf7] sm:bg-black/50 sm:p-6">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col bg-[#fffaf7] sm:min-h-0 sm:max-h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:shadow-2xl">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-[#fffaf7]/95 px-4 py-3 backdrop-blur sm:rounded-t-[2rem]">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-base font-black">Phiếu tiếp nhận online</p><p className="mt-0.5 text-xs text-zinc-500">Bước {step}/4 · {step === 1 ? 'Thiết bị' : step === 2 ? 'Tình trạng máy' : step === 3 ? 'Ảnh bằng chứng' : 'Lịch hẹn & xác nhận'}</p></div>
            <button type="button" aria-label="Đóng phiếu tiếp nhận" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl hover:bg-zinc-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label={`Tiến độ ${step} trên 4 bước`}>
            {[1, 2, 3, 4].map(value => <span key={value} className={classNames('h-1.5 rounded-full', value <= step ? 'bg-[#ff4b16]' : 'bg-zinc-200')} />)}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === 1 && (
            <section>
              <h2 className="text-xl font-black">Máy cần hỗ trợ</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Máy đã liên kết được lấy trực tiếp từ hồ sơ PhoneHouse, bạn không phải nhập lại model hoặc IMEI.</p>
              {devices.length > 0 && (
                <div className="mt-4 space-y-2">
                  {devices.map(device => (
                    <button type="button" key={device.id} onClick={() => chooseLinkedDevice(device)} className={classNames('flex min-h-[68px] w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition', !manualDevice && deviceId === device.id ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100' : 'border-zinc-200 bg-white hover:border-orange-200')}>
                      <span className="min-w-0"><b className="block truncate text-sm text-zinc-900">{device.model || 'Thiết bị PhoneHouse'}</b><small className="mt-1 block font-mono text-xs text-zinc-500">{device.imeiMasked} · {device.branchName || 'PhoneHouse'}</small></span>
                      {!manualDevice && deviceId === device.id && <Check className="h-5 w-5 shrink-0 text-orange-600" />}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={chooseManualDevice} className={classNames('mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm font-black', manualDevice ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-zinc-200 bg-white text-zinc-700')}>
                <span>Máy khác chưa liên kết</span>{manualDevice && <Check className="h-5 w-5" />}
              </button>
              {manualDevice && (
                <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs leading-5 text-zinc-500">Nhập thông tin trên máy. Nhân viên sẽ xác minh IMEI khi tiếp nhận thực tế.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold">IMEI 15 số
                      <input autoFocus inputMode="numeric" value={imei} onChange={event => setImei(event.target.value.replace(/\D/g, '').slice(0, 15))} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 font-mono outline-none focus:border-orange-500" placeholder="Nhập đủ 15 chữ số" />
                    </label>
                    <label className="text-sm font-bold">Dòng máy / model
                      <input value={model} onChange={event => setModel(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 outline-none focus:border-orange-500" placeholder="Ví dụ: iPhone 15 Pro" />
                    </label>
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="text-xl font-black">Máy đang gặp vấn đề gì?</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Chọn một nhóm lỗi chính; mô tả thêm dấu hiệu để kỹ thuật chuẩn bị chính xác hơn.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRequestType('REPAIR')} className={classNames('min-h-[92px] rounded-2xl border p-3 text-left', requestType === 'REPAIR' ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 bg-white')}><Wrench className="h-5 w-5 text-orange-600" /><p className="mt-2 text-sm font-black">Sửa dịch vụ</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">Kiểm tra và báo giá</p></button>
                <button type="button" onClick={() => setRequestType('WARRANTY')} className={classNames('min-h-[92px] rounded-2xl border p-3 text-left', requestType === 'WARRANTY' ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-200 bg-white')}><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-black">Bảo hành</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">Xác minh điều kiện</p></button>
              </div>
              <p className="mt-5 text-sm font-black text-zinc-800">Nhóm lỗi chính</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {CUSTOMER_REPAIR_ISSUES.map(issue => (
                  <button type="button" key={issue.code} onClick={() => setIssueCode(issue.code)} className={classNames('min-h-[72px] rounded-2xl border p-3 text-left transition', issueCode === issue.code ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100' : 'border-zinc-200 bg-white hover:border-orange-200')}>
                    <span className="flex items-start justify-between gap-2"><b className="text-sm text-zinc-900">{issue.label}</b>{issueCode === issue.code && <Check className="h-4 w-4 shrink-0 text-orange-600" />}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-zinc-500">{issue.examples}</span>
                  </button>
                ))}
              </div>
              <label className="mt-5 block text-sm font-bold">Mô tả chi tiết
                <textarea value={description} onChange={event => setDescription(event.target.value.slice(0, 3000))} className="mt-1.5 min-h-32 w-full rounded-2xl border border-zinc-200 p-3 outline-none focus:border-orange-500" placeholder="Ví dụ: máy bắt đầu không nhận sạc từ tối qua, đã thử đổi cáp nhưng vẫn chập chờn…" />
              </label>
              <p className="mt-1 text-right text-[10px] text-zinc-400">{description.length}/3000</p>
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="text-xl font-black">Ảnh hoặc video tình trạng</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Không bắt buộc, nhưng ảnh rõ lỗi và toàn bộ máy giúp tiếp nhận nhanh hơn.</p>
              <label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-orange-300 bg-orange-50 p-4 text-center">
                <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={event => setFiles(Array.from(event.target.files || []).slice(0, 6))} className="sr-only" />
                <CameraIcon />
                <b className="mt-3 text-sm text-orange-900">Chụp ảnh hoặc chọn từ điện thoại</b>
                <span className="mt-1 text-xs text-orange-700">Tối đa 6 tệp ảnh/video</span>
              </label>
              {files.length > 0 && <div className="mt-3 rounded-2xl bg-white p-3 text-sm"><b>Đã chọn {files.length} tệp</b><ul className="mt-2 space-y-1 text-xs text-zinc-500">{files.map(file => <li key={`${file.name}-${file.size}`} className="truncate">• {file.name}</li>)}</ul></div>}
              <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs leading-5 text-sky-800"><b>Gợi ý:</b> Chụp màn hình đang lỗi, mặt trước/sau và vị trí trầy vỡ. Không cần quay lại IMEI nếu máy đã liên kết.</div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="text-xl font-black">Lịch hẹn & xác nhận</h2>
              <label className="mt-4 block text-sm font-bold">Chi nhánh tiếp nhận
                <select value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 outline-none focus:border-orange-500">
                  {bootstrap.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} · {branch.address}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-sm font-bold">Dự kiến mang máy đến <span className="font-medium text-zinc-400">(không bắt buộc)</span>
                <input type="datetime-local" value={preferredVisitAt} onChange={event => setPreferredVisitAt(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 outline-none focus:border-orange-500" />
              </label>
              <div className="mt-5 space-y-3 rounded-3xl border border-zinc-200 bg-white p-4 text-sm">
                <div><p className="text-xs text-zinc-500">Thiết bị</p><p className="mt-1 font-black">{manualDevice ? model : selectedDevice?.model}</p><p className="mt-0.5 font-mono text-xs text-zinc-500">{manualDevice ? imei : selectedDevice?.imeiMasked}</p></div>
                <div className="border-t border-zinc-100 pt-3"><p className="text-xs text-zinc-500">Yêu cầu</p><p className="mt-1 font-bold">{requestType === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'} · {selectedIssue?.label}</p><p className="mt-1 leading-5 text-zinc-600">{description}</p></div>
                <div className="border-t border-zinc-100 pt-3"><p className="text-xs text-zinc-500">Nơi tiếp nhận</p><p className="mt-1 font-bold">{bootstrap.branches.find(branch => branch.id === branchId)?.name || 'Chưa chọn'}</p><p className="mt-1 text-xs text-zinc-500">{files.length ? `${files.length} tệp bằng chứng` : 'Không có tệp đính kèm'}</p></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">Đây là yêu cầu tiếp nhận online. Nhân viên sẽ xác minh tình trạng máy, IMEI và điều kiện bảo hành trước khi tạo phiếu kỹ thuật chính thức.</p>
            </section>
          )}
          {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</p>}
        </main>

        <footer className="sticky bottom-0 z-20 border-t border-zinc-200 bg-[#fffaf7]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:rounded-b-[2rem] sm:px-6">
          <div className="flex gap-2">
            <AppButton className="min-w-24" onClick={() => step > 1 ? setStep(value => value - 1) : onClose()}>{step > 1 ? 'Quay lại' : 'Hủy'}</AppButton>
            {step < 4 ? <AppButton primary className="flex-1" onClick={() => { setError(''); setStep(value => value + 1); }} disabled={!stepValid}>Tiếp tục</AppButton> : <AppButton primary className="flex-1" onClick={() => void submit()} disabled={!stepValid || loading}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Gửi phiếu tiếp nhận'}</AppButton>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function RequestRepairModal({ bootstrap, devices, onClose, onDone }: { bootstrap: CustomerBootstrap; devices: CustomerDevice[]; onClose: () => void; onDone: () => Promise<void> }) {
  return <CustomerRepairIntakeView bootstrap={bootstrap} devices={devices} onClose={onClose} onDone={onDone} />;
  /* Legacy implementation kept temporarily inside this comment for review.
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ deviceId: '', imei: '', model: '', requestType: 'REPAIR', issueType: '', description: '', branchId: bootstrap.branches[0]?.id || '', preferredVisitAt: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const selectDevice = (device: CustomerDevice) => update({ deviceId: device.id, imei: '', model: device.model });
  const submit = async () => {
    setLoading(true); setError('');
    try {
      const result = await createCustomerServiceRequest({ ...form, idempotencyKey: `csr-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      for (const file of files.slice(0, 6)) await uploadCustomerEvidence(result.data.id, file);
      await onDone(); onClose();
    } catch (e: any) { setError(e?.message || 'Không thể gửi yêu cầu.'); }
    finally { setLoading(false); }
  };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-0 sm:p-6"><div className="mx-auto min-h-full max-w-xl bg-[#fffaf7] sm:min-h-0 sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-[#fffaf7]/95 px-4 py-3 backdrop-blur"><div><p className="font-black">Gửi yêu cầu sửa chữa</p><p className="text-xs text-zinc-500">Bước {step}/4</p></div><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div><div className="p-4 sm:p-6">{step === 1 && <section><h2 className="text-lg font-black">Chọn thiết bị</h2><p className="mt-1 text-sm text-zinc-500">Chọn máy đã liên kết hoặc nhập IMEI.</p>{devices.length > 0 && <div className="mt-4 space-y-2">{devices.map(device => <button key={device.id} onClick={() => selectDevice(device)} className={classNames('flex min-h-14 w-full items-center justify-between rounded-2xl border p-3 text-left', form.deviceId === device.id ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 bg-white')}><span><b className="block text-sm">{device.model}</b><small className="font-mono text-xs text-zinc-500">{device.imeiMasked}</small></span>{form.deviceId === device.id && <Check className="h-5 w-5 text-orange-600" />}</button>)}</div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">IMEI<input value={form.imei} onChange={e => update({ imei: e.target.value.replace(/\D/g, '').slice(0, 15), deviceId: '' })} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3 font-mono" placeholder="15 chữ số" /></label><label className="text-sm font-bold">Model<input value={form.model} onChange={e => update({ model: e.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3" placeholder="iPhone 15 Pro" /></label></div></section>}{step === 2 && <section><h2 className="text-lg font-black">Loại yêu cầu & lỗi gặp phải</h2><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => update({ requestType: 'REPAIR' })} className={classNames('rounded-2xl border p-4 text-left', form.requestType === 'REPAIR' ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 bg-white')}><Wrench className="h-5 w-5 text-orange-600" /><p className="mt-2 text-sm font-black">Sửa dịch vụ</p><p className="mt-1 text-xs text-zinc-500">Lỗi, hỏng, cần kiểm tra</p></button><button onClick={() => update({ requestType: 'WARRANTY' })} className={classNames('rounded-2xl border p-4 text-left', form.requestType === 'WARRANTY' ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-200 bg-white')}><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-black">Bảo hành</p><p className="mt-1 text-xs text-zinc-500">Yêu cầu kiểm tra bảo hành</p></button></div><label className="mt-4 block text-sm font-bold">Nhóm lỗi<input value={form.issueType} onChange={e => update({ issueType: e.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3" placeholder="Màn hình, pin, sạc, camera…" /></label><label className="mt-3 block text-sm font-bold">Mô tả chi tiết<textarea value={form.description} onChange={e => update({ description: e.target.value })} className="mt-1.5 min-h-32 w-full rounded-2xl border border-zinc-200 p-3" placeholder="Máy gặp lỗi gì? Xuất hiện từ khi nào?" /></label></section>}{step === 3 && <section><h2 className="text-lg font-black">Ảnh/video và chi nhánh</h2><label className="mt-4 block text-sm font-bold">Chi nhánh mong muốn<select value={form.branchId} onChange={e => update({ branchId: e.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3">{bootstrap.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} · {branch.address}</option>)}</select></label><label className="mt-3 block text-sm font-bold">Thời gian dự kiến mang máy đến<input type="datetime-local" value={form.preferredVisitAt} onChange={e => update({ preferredVisitAt: e.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border border-zinc-200 px-3" /></label><label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-3 text-center"><input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 6))} className="sr-only" /><CameraIcon /><b className="mt-2 text-sm text-orange-800">Thêm ảnh/video lỗi</b><span className="mt-1 text-xs text-orange-700">Tối đa 6 tệp</span></label>{files.length > 0 && <p className="mt-2 text-xs font-bold text-zinc-600">Đã chọn {files.length} tệp</p>}</section>}{step === 4 && <section><h2 className="text-lg font-black">Kiểm tra và gửi</h2><div className="mt-4 space-y-2 rounded-3xl bg-white p-4 text-sm"><p><b>Thiết bị:</b> {form.model} · {form.imei || devices.find(item => item.id === form.deviceId)?.imeiMasked}</p><p><b>Loại:</b> {form.requestType === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'}</p><p><b>Lỗi:</b> {form.issueType || 'Chưa phân loại'} · {form.description}</p><p><b>Chi nhánh:</b> {bootstrap.branches.find(branch => branch.id === form.branchId)?.name}</p><p><b>Tệp đính kèm:</b> {files.length ? `${files.length} tệp` : 'Không có'}</p></div><p className="mt-3 text-xs leading-5 text-zinc-500">Nhân viên PhoneHouse sẽ kiểm tra thông tin, xác minh thiết bị và phản hồi trước khi tạo Work Order chính thức.</p></section>}{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</p>}<div className="mt-6 flex justify-between gap-2"><AppButton onClick={() => step > 1 ? setStep(step - 1) : onClose()}>{step > 1 ? 'Quay lại' : 'Hủy'}</AppButton>{step < 4 ? <AppButton primary onClick={() => setStep(step + 1)} disabled={step === 1 ? (!form.model || ((!form.deviceId) && !/^\d{15}$/.test(form.imei))) : step === 2 ? form.description.trim().length < 5 : !form.branchId}>{step === 3 ? 'Xem lại' : 'Tiếp tục'}</AppButton> : <AppButton primary onClick={() => void submit()} disabled={loading}>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Gửi yêu cầu'}</AppButton>}</div></div></div></div>;
  */
}

function CameraIcon() { return <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-orange-600"><Package className="h-5 w-5" /></div>; }

function DeviceDetail({ device, onClose, onRepair }: { device: CustomerDevice & { repairHistory?: CustomerRepair[] }; onClose: () => void; onRepair: () => void }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-0 sm:p-6"><div className="mx-auto min-h-full max-w-xl bg-[#fffaf7] sm:min-h-0 sm:rounded-3xl"><div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div><p className="font-black">{device.model}</p><p className="font-mono text-xs text-zinc-500">{device.imeiMasked}</p></div><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-4"><section className="rounded-3xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><p className="font-black">Bảo hành</p><StatusPill label={device.warrantyStatus === 'ACTIVE' ? 'Còn hạn' : device.warrantyStatus === 'EXPIRING' ? 'Sắp hết hạn' : 'Hết hạn'} tone={device.warrantyStatus === 'ACTIVE' ? 'green' : device.warrantyStatus === 'EXPIRING' ? 'orange' : 'gray'} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-zinc-500">Ngày mua</p><p className="mt-1 font-bold">{dateOnly(device.purchaseAt)}</p></div><div><p className="text-xs text-zinc-500">Hết hạn</p><p className="mt-1 font-bold">{dateOnly(device.warrantyUntil)}</p></div><div><p className="text-xs text-zinc-500">Chi nhánh</p><p className="mt-1 font-bold">{device.branchName || 'PhoneHouse'}</p></div><div><p className="text-xs text-zinc-500">Hóa đơn</p><p className="mt-1 font-mono text-xs font-bold">{device.invoiceCode || '—'}</p></div></div></section><AppButton primary className="w-full" onClick={onRepair}><Wrench className="mr-2 inline h-4 w-4" />Yêu cầu sửa/bảo hành</AppButton>{device.repairHistory?.length ? <section><h2 className="mb-2 font-black">Lịch sử xử lý</h2><div className="space-y-2">{device.repairHistory.map(item => <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{item.code}</b><StatusPill label={item.stageLabel} tone="blue" /></div><p className="mt-1 text-xs text-zinc-500">{item.type === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'} · {dateOnly(item.receivedAt)}</p></div>)}</div></section> : null}</div></div></div>;
}

function PromotionDetail({ promotion, onClose }: { promotion: CustomerPromotion; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-[#fffaf7] p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{promotion.title}</h2><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div>{promotion.bannerUrl && <img src={promotion.bannerUrl} alt="" className="mt-4 h-40 w-full rounded-3xl object-cover" />}<p className="mt-4 text-sm leading-6 text-zinc-700">{promotion.details || promotion.summary}</p>{promotion.conditions.length > 0 && <div className="mt-4 rounded-2xl bg-white p-4"><p className="text-sm font-black">Điều kiện áp dụng</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-zinc-600">{promotion.conditions.map(condition => <li key={condition}>{condition}</li>)}</ul></div>}<p className="mt-4 text-xs font-bold text-zinc-500">Hiệu lực đến {dateTime(promotion.endsAt)} · {promotion.allBranches ? 'Toàn hệ thống' : 'Theo chi nhánh áp dụng'}</p>{promotion.voucherCode && <div className="mt-4 rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-3 text-center"><p className="text-xs text-orange-700">Mã ưu đãi</p><code className="mt-1 block text-lg font-black tracking-widest text-orange-900">{promotion.voucherCode}</code></div>}</div></div>; }

function NotificationsPanel({ notifications, onClose, onRead }: { notifications: CustomerNotification[]; onClose: () => void; onRead: (id: string) => void }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-5"><div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffaf7] p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Thông báo</h2><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div><div className="mt-3 space-y-2">{notifications.length ? notifications.map(notification => <button key={notification.id} onClick={() => onRead(notification.id)} className={classNames('w-full rounded-2xl p-3 text-left', notification.read ? 'bg-white' : 'bg-orange-50')}><div className="flex gap-3"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /><div><p className="text-sm font-black text-zinc-900">{notification.title}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{notification.body}</p><p className="mt-1 text-[10px] text-zinc-400">{dateTime(notification.createdAt)}</p></div></div></button>) : <p className="py-8 text-center text-sm text-zinc-500">Chưa có thông báo.</p>}</div></div></div>; }

function ChatPanel({ me, bootstrap, onClose }: { me: CustomerMe | null; bootstrap: CustomerBootstrap; onClose: () => void }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CustomerChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicReply, setPublicReply] = useState('');
  const quick = ['Máy của tôi sửa tới đâu?', 'Máy còn bảo hành không?', 'Có ưu đãi nào phù hợp?', 'Tôi muốn gặp CSKH'];
  useEffect(() => { if (me) void createCustomerConversation().then(result => setConversationId(result.data.id)).catch(e => setError(e?.message || 'Không mở được chat.')); }, [me]);
  const send = async (value = input) => {
    if (!value.trim()) return;
    setLoading(true); setError('');
    try {
      if (!me) { const result = await customerPublicChat(value); setPublicReply(result.data.reply); }
      else {
        let id = conversationId; if (!id) { const conversation = await createCustomerConversation(); id = conversation.data.id; setConversationId(id); }
        const result = await sendCustomerConversationMessage(id, value); setMessages(result.data.messages || []);
      }
      setInput('');
    } catch (e: any) { setError(e?.message || 'Không gửi được tin nhắn.'); }
    finally { setLoading(false); }
  };
  const handoff = async () => { if (!conversationId) return; setLoading(true); try { await handoffCustomerConversation(conversationId); setMessages(current => [...current, { id: `handoff-${Date.now()}`, sender: 'BOT', senderName: 'PhoneHouse Care', content: 'Đã chuyển cuộc trò chuyện cho CSKH. Nhân viên sẽ phản hồi trong app.', timestamp: new Date().toISOString() }]); } catch (e: any) { setError(e?.message || 'Không chuyển được cho CSKH.'); } finally { setLoading(false); } };
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-5"><div className="flex h-[min(760px,92vh)] w-full max-w-lg flex-col rounded-t-3xl bg-[#fffaf7] sm:rounded-3xl"><div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div className="flex items-center gap-3"><div className="rounded-2xl bg-sky-600 p-2 text-white"><Bot className="h-5 w-5" /></div><div><p className="font-black">PhoneHouse Care</p><p className="text-xs text-emerald-600">{me ? 'Đã đăng nhập · hỗ trợ cá nhân' : 'Hỗ trợ thông tin công khai'}</p></div></div><button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl"><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-y-auto p-4"><div className="rounded-3xl bg-white p-4 text-sm leading-6 text-zinc-700 shadow-sm">Xin chào! Tôi có thể hỗ trợ bảo hành, tiến độ sửa chữa, báo giá, ưu đãi và chi nhánh. {me ? '' : 'Đăng nhập OTP để hỏi thông tin riêng của bạn.'}</div><div className="mt-3 flex flex-wrap gap-2">{quick.map(item => <button key={item} onClick={() => void send(item)} className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700">{item}</button>)}</div>{publicReply && <div className="mt-3 rounded-3xl bg-sky-50 p-4 text-sm leading-6 text-sky-900">{publicReply}</div>}{messages.map(message => <div key={message.id} className={classNames('mt-3 max-w-[88%] rounded-3xl p-3 text-sm leading-6', message.sender === 'CUSTOMER' ? 'ml-auto bg-[#ff4b16] text-white' : message.sender === 'STAFF' ? 'bg-emerald-50 text-emerald-950' : 'bg-white text-zinc-700')}>{message.content}<p className="mt-1 text-[10px] opacity-60">{message.senderName}</p></div>)}</div><div className="border-t border-zinc-200 p-3"><div className="flex items-end gap-2"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={1} className="min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 bg-white p-3 text-sm outline-none focus:border-sky-500" placeholder="Nhập câu hỏi…" /><button onClick={() => void send()} disabled={loading || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white disabled:opacity-50"><Send className="h-4 w-4" /></button></div>{me && <button onClick={() => void handoff()} disabled={loading} className="mt-2 text-xs font-black text-sky-700 underline">Gặp nhân viên CSKH</button>}{error && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">{error}</p>}</div></div></div>;
}

export default function CustomerPortalApp() {
  const [activeTab, setActiveTab] = useState<PortalTab>(() => tabFromLocation());
  const [quotePage, setQuotePage] = useState(() => window.location.pathname.toLowerCase().startsWith('/khach-hang/bao-gia'));
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [bootstrap, setBootstrap] = useState<CustomerBootstrap>({ brand: { name: 'PhoneHouse', slogan: 'An tâm mua sắm · Tận tâm hậu mãi', hotline: '', supportEmail: '' }, branches: [], promotions: [], generatedAt: '' });
  const [me, setMe] = useState<CustomerMe | null>(null);
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
  const [repairs, setRepairs] = useState<CustomerRepair[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [promotions, setPromotions] = useState<CustomerPromotion[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [selectedRepair, setSelectedRepair] = useState<CustomerRepair | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<(CustomerDevice & { repairHistory?: CustomerRepair[] }) | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<CustomerPromotion | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const handledDeepLink = useRef('');
  const handledPromotionLink = useRef('');
  const unread = notifications.filter(item => !item.read).length;

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) manifest.href = '/manifest-customer.webmanifest';
    document.title = 'PhoneHouse Care · Bảo hành & sửa chữa';
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', 'Theo dõi bảo hành, sửa chữa, báo giá và ưu đãi dành cho khách hàng PhoneHouse.');
    document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.setAttribute('content', 'PhoneHouse Care');
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'PhoneHouse Care');
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/customer-sw.js', { scope: '/khach-hang' }).catch(error => console.warn('[PhoneHouse Care SW]', error));
  }, []);

  const refresh = useCallback(async (authenticated = Boolean(customerAuth.currentUser?.phoneNumber)) => {
    setLoading(true); setError('');
    try {
      const publicData = await customerPublicBootstrap(); setBootstrap(publicData.data);
      if (authenticated && customerAuth.currentUser?.phoneNumber) {
        const account = await customerMe(); setMe(account.data);
        const [deviceData, repairData, promotionData, notificationData] = await Promise.all([customerDevices(), customerRepairs(), customerPromotions(), customerNotifications()]);
        setDevices(deviceData.data); setRepairs(repairData.data.items); setRequests(repairData.data.requests); setPromotions(promotionData.data); setNotifications(notificationData.data);
      } else { setMe(null); setDevices([]); setRepairs([]); setRequests([]); setPromotions(publicData.data.promotions); setNotifications([]); }
    } catch (e: any) { setError(e?.message || 'Không tải được dữ liệu PhoneHouse Care.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(Boolean(customerAuth.currentUser?.phoneNumber)); const unsub = onAuthStateChanged(customerAuth, user => { void refresh(Boolean(user?.phoneNumber)); }); return () => unsub(); }, [refresh]);
  useEffect(() => { const onPop = () => { setActiveTab(tabFromLocation()); setQuotePage(window.location.pathname.toLowerCase().startsWith('/khach-hang/bao-gia')); }; window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => {
    const repairId = new URLSearchParams(window.location.search).get('repair') || '';
    if (!me || !repairId || handledDeepLink.current === repairId) return;
    handledDeepLink.current = repairId;
    void customerRepair(repairId).then(result => { setSelectedRepair(result.data); setActiveTab('repairs'); setOverlay('repair'); }).catch(error => setError(error?.message || 'Không mở được phiếu sửa chữa từ thông báo.'));
  }, [me]);
  useEffect(() => {
    const promotionId = new URLSearchParams(window.location.search).get('promotion') || '';
    if (!promotionId || handledPromotionLink.current === promotionId) return;
    const promotion = promotions.find(item => item.id === promotionId);
    if (!promotion) return;
    handledPromotionLink.current = promotionId;
    setActiveTab('promotions');
    setSelectedPromotion(promotion);
  }, [promotions]);
  const go = (tab: PortalTab) => { setQuotePage(false); setActiveTab(tab); window.history.pushState(null, '', portalPaths[tab]); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openQuotePage = () => { setQuotePage(true); window.history.pushState(null, '', '/khach-hang/bao-gia'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const saveMe = async (input: Partial<CustomerMe>) => { const result = await updateCustomerMe(input); setMe(result.data); };
  const enablePush = async () => {
    const token = await requestCustomerPushToken();
    await saveCustomerPushSubscription(token);
    await saveMe({ notificationConsent: true });
  };
  const logout = async () => { await signOut(customerAuth); setMe(null); setOverlay(null); };
  const openDevice = async (device: CustomerDevice) => {
    if (!me) return setOverlay('login');
    setDevices(current => [device, ...current.filter(item => item.id !== device.id)]);
    try {
      const result = await customerDevice(device.id);
      setSelectedDevice(result.data);
      setOverlay('device');
    } catch (cause: any) {
      setError(cause?.message || 'Không tải được thiết bị.');
    }
  };
  const openRepair = (repair: CustomerRepair) => { setSelectedRepair(repair); setOverlay('repair'); };
  const reloadRepair = async () => { if (!selectedRepair) return; const result = await customerRepair(selectedRepair.id); setSelectedRepair(result.data); await refresh(true); };
  const content = useMemo(() => { if (loading && !bootstrap.generatedAt) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-orange-500" /></div>; if (quotePage) return <React.Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-orange-500" /></div>}><QuickQuoteMiniweb onBack={() => go('home')} onChat={() => setOverlay('chat')} hotline={bootstrap.brand.hotline} /></React.Suspense>; if (activeTab === 'devices') return <DevicesPage devices={devices} onOpen={openDevice} onLogin={() => setOverlay('login')} />; if (activeTab === 'repairs') return <RepairsPage repairs={repairs} requests={requests} onOpen={openRepair} onRequest={() => me ? setOverlay('request') : setOverlay('login')} onLogin={() => setOverlay('login')} />; if (activeTab === 'promotions') return <PromotionsPage promotions={promotions} onOpen={setSelectedPromotion} />; if (activeTab === 'account') return <AccountPage me={me} onLogin={() => setOverlay('login')} onSave={saveMe} onLogout={() => void logout()} onEnablePush={enablePush} />; return <HomePage bootstrap={bootstrap} me={me} repairs={repairs} devices={devices} promotions={promotions} onTab={go} onOpenRepair={() => me ? setOverlay('request') : setOverlay('login')} onOpenQuote={openQuotePage} onOpenChat={() => setOverlay('chat')} onOpenDevice={openDevice} />; }, [activeTab, bootstrap, devices, loading, me, promotions, quotePage, repairs, requests, selectedRepair]);
  return <div className="min-h-screen bg-[#fffaf7] text-zinc-900"><Header brand={bootstrap.brand} me={me} unread={unread} onNotifications={() => setOverlay('notifications')} onLogin={() => setOverlay('login')} /><main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-8">{error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold leading-5 text-rose-700"><span className="flex-1">{error}</span><button aria-label="Đóng thông báo lỗi" onClick={() => setError('')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><X className="h-4 w-4" /></button></div>}{content}<BottomNav active={activeTab} onChange={go} /></main><button aria-label="Mở chatbot" onClick={() => setOverlay('chat')} className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-xl shadow-sky-200 transition hover:bg-sky-700 sm:bottom-6 sm:right-6"><MessageCircle className="h-5 w-5" /></button>{overlay === 'login' && <CustomerLogin onDone={() => { setOverlay(null); void refresh(true); }} onGuest={() => setOverlay(null)} />}{overlay === 'request' && <RequestRepairModal bootstrap={bootstrap} devices={devices} onClose={() => setOverlay(null)} onDone={() => refresh(true)} />}{overlay === 'repair' && selectedRepair && <RepairDetail repair={selectedRepair} onClose={() => { setOverlay(null); setSelectedRepair(null); }} onReload={reloadRepair} onQuote={repair => { setSelectedRepair(repair); setOverlay('quote'); }} />}{overlay === 'quote' && selectedRepair && <QuoteModal repair={selectedRepair} onClose={() => setOverlay('repair')} onDone={async () => { await reloadRepair(); }} />}{overlay === 'device' && selectedDevice && <DeviceDetail device={selectedDevice} onClose={() => { setOverlay(null); setSelectedDevice(null); }} onRepair={() => { setOverlay('request'); }} />}{overlay === 'promotion' && selectedPromotion && <PromotionDetail promotion={selectedPromotion} onClose={() => setOverlay(null)} />}{overlay === 'notifications' && <NotificationsPanel notifications={notifications} onClose={() => setOverlay(null)} onRead={async id => { await readCustomerNotification(id); const target = notifications.find(item => item.id === id); setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item)); if (target?.url?.startsWith('/khach-hang')) window.location.assign(target.url); }} />}{overlay === 'chat' && <ChatPanel me={me} bootstrap={bootstrap} onClose={() => setOverlay(null)} />}{selectedPromotion && overlay !== 'promotion' && activeTab === 'promotions' && <PromotionDetail promotion={selectedPromotion} onClose={() => setSelectedPromotion(null)} />}</div>;
}
