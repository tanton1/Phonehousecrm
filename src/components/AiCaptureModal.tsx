import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, FileImage, FileAudio, Loader2, ScanLine, ShieldCheck, Sparkles, Upload, UserPlus, X } from 'lucide-react';
import {
  AiCaptureExtraction,
  AiCaptureResult,
  ConversationExtraction,
  SalesSlipExtraction,
  confirmAiCaptureDraft,
  createLeadFromAiCaptureDraft,
  requestAiCapture
} from '../services/aiCaptureApiClient';

interface AiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPOS?: (extraction: SalesSlipExtraction, draftId: string) => void;
  embedded?: boolean;
}

function formatMoney(value: number | null | undefined): string {
  return value == null ? '' : Number(value).toLocaleString('vi-VN');
}

function confidenceLabel(value: number): string {
  if (value >= 0.85) return 'Cao';
  if (value >= 0.6) return 'Trung bình';
  return 'Thấp';
}

export const AiCaptureModal: React.FC<AiCaptureModalProps> = ({ isOpen, onClose, onOpenPOS, embedded = false }) => {
  const [sourceType, setSourceType] = useState<'SALES_SLIP' | 'CONVERSATION'>('SALES_SLIP');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AiCaptureResult | null>(null);
  const [extraction, setExtraction] = useState<AiCaptureExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [leadCreated, setLeadCreated] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = sourceType === 'SALES_SLIP' ? 'image/jpeg,image/png,image/webp,image/heic,image/heif' : 'audio/*';
  const sourceLabel = sourceType === 'SALES_SLIP' ? 'Ảnh phiếu bán hàng' : 'Ghi âm hội thoại';
  const [previewUrl, setPreviewUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      setAudioUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    if (sourceType === 'SALES_SLIP') setPreviewUrl(url);
    else setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, sourceType]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setExtraction(null);
    setError('');
    setConfirmed(false);
    setLeadCreated(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const selectSource = (next: 'SALES_SLIP' | 'CONVERSATION') => {
    setSourceType(next);
    reset();
  };

  const handleFile = (next: File | null) => {
    setError('');
    setConfirmed(false);
    setLeadCreated(false);
    setResult(null);
    setExtraction(null);
    setFile(next);
  };

  const runCapture = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setConfirmed(false);
    setLeadCreated(false);
    try {
      const captured = await requestAiCapture(file, sourceType);
      setResult(captured);
      setExtraction(captured.extraction);
    } catch (captureError: any) {
      setError(captureError?.message || 'Không thể phân tích tệp.');
    } finally {
      setBusy(false);
    }
  };

  const updateSales = (patch: Partial<SalesSlipExtraction>) => setExtraction(current => current?.sourceType === 'SALES_SLIP' ? { ...current, ...patch } : current);
  const updateConversation = (patch: Partial<ConversationExtraction>) => setExtraction(current => current?.sourceType === 'CONVERSATION' ? { ...current, ...patch } : current);

  const confirmDraft = async () => {
    if (!result || !extraction || confirming) return;
    setConfirming(true);
    setError('');
    try {
      await confirmAiCaptureDraft(result.draftId, extraction);
      setConfirmed(true);
      window.alert('Đã xác nhận bản nháp AI. Kiểm tra lần cuối trước khi ghi POS/CRM.');
    } catch (confirmError: any) {
      setError(confirmError?.message || 'Không thể xác nhận bản nháp.');
    } finally {
      setConfirming(false);
    }
  };

  const createLead = async () => {
    if (!result || !confirmed || leadBusy || leadCreated || !conversation) return;
    setLeadBusy(true);
    setError('');
    try {
      await createLeadFromAiCaptureDraft(result.draftId);
      setLeadCreated(true);
      window.alert('Đã tạo lead CRM và task phản hồi từ bản nháp hội thoại.');
    } catch (leadError: any) {
      setError(leadError?.message || 'Không thể tạo lead CRM. Hãy bổ sung tên và số điện thoại 10 số.');
    } finally {
      setLeadBusy(false);
    }
  };

  if (!isOpen) return null;

  const sales = extraction?.sourceType === 'SALES_SLIP' ? extraction : null;
  const conversation = extraction?.sourceType === 'CONVERSATION' ? extraction : null;

  return (
    <div className={embedded ? 'w-full' : 'fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4'}>
      <div className={embedded ? 'flex min-h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-sm' : 'flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-orange-200 bg-white shadow-2xl sm:rounded-3xl'}>
        <header className="flex items-start justify-between gap-3 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl bg-orange-600 p-2.5 text-white shadow-lg shadow-orange-600/20"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-zinc-950">AI nhập liệu PhoneHouse</h2>
              <p className="text-[11px] font-semibold text-zinc-500">Đọc phiếu bán hàng hoặc nghe hội thoại · luôn cần nhân viên duyệt</p>
            </div>
          </div>
          {!embedded && <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Đóng"><X className="h-5 w-5" /></button>}
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1">
            <button type="button" onClick={() => selectSource('SALES_SLIP')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black ${sourceType === 'SALES_SLIP' ? 'bg-white text-orange-700 shadow-sm' : 'text-zinc-500'}`}><FileImage className="h-4 w-4" /> Ảnh phiếu bán</button>
            <button type="button" onClick={() => selectSource('CONVERSATION')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black ${sourceType === 'CONVERSATION' ? 'bg-white text-orange-700 shadow-sm' : 'text-zinc-500'}`}><FileAudio className="h-4 w-4" /> Ghi âm hội thoại</button>
          </div>

          <div className="mt-4 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-5 text-center">
            {previewUrl && <img src={previewUrl} alt="Phiếu bán hàng đã chọn" className="mx-auto mb-4 max-h-48 max-w-full rounded-xl object-contain shadow-sm" />}
            {file && sourceType === 'CONVERSATION' && audioUrl && <audio controls src={audioUrl} className="mx-auto mb-4 w-full max-w-md" />}
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={event => handleFile(event.target.files?.[0] || null)} />
            <Upload className="mx-auto h-7 w-7 text-orange-500" />
            <p className="mt-2 text-sm font-black text-zinc-800">{file ? file.name : `Chọn ${sourceLabel.toLowerCase()}`}</p>
            <p className="mt-1 text-[11px] font-semibold text-zinc-500">{sourceType === 'SALES_SLIP' ? 'JPG, PNG, WEBP · tối đa 3 MB' : 'MP3, WAV, M4A, OGG, WEBM · tối đa 3 MB'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-orange-700 hover:bg-orange-50">{file ? 'Chọn tệp khác' : 'Chọn tệp'}</button>
              <button type="button" onClick={() => void runCapture()} disabled={!file || busy} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} {busy ? 'Đang phân tích…' : 'Phân tích bằng AI'}</button>
            </div>
          </div>

          {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div>}

          {extraction && result && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black text-emerald-800"><ShieldCheck className="h-4 w-4" /> Bản nháp đã tạo · không tự ghi dữ liệu tài chính</div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-emerald-700">Độ tin cậy {Math.round(extraction.confidence * 100)}% · {confidenceLabel(extraction.confidence)}</span>
              </div>

              {extraction.fieldsToReview.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Cần kiểm tra: {extraction.fieldsToReview.join(' · ')}</div>}

              {sales && (
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <h3 className="text-sm font-black text-zinc-900">Thông tin phiếu bán</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-zinc-600">Tên khách hàng<input value={sales.customer.name} onChange={event => updateSales({ customer: { ...sales.customer, name: event.target.value } })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Số điện thoại<input value={sales.customer.phone} onChange={event => updateSales({ customer: { ...sales.customer, phone: event.target.value } })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Ngày bán<input value={sales.saleDate || ''} onChange={event => updateSales({ saleDate: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Phương thức thanh toán<input value={sales.paymentMethod || ''} onChange={event => updateSales({ paymentMethod: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Giảm giá (VNĐ)<input inputMode="numeric" value={formatMoney(sales.discountAmount)} onChange={event => updateSales({ discountAmount: Number(event.target.value.replace(/\D/g, '')) || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Tổng tiền (VNĐ)<input inputMode="numeric" value={formatMoney(sales.totalAmount)} onChange={event => updateSales({ totalAmount: Number(event.target.value.replace(/\D/g, '')) || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-100"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] font-black uppercase text-zinc-500"><tr><th className="px-3 py-2">Sản phẩm</th><th className="px-3 py-2">IMEI</th><th className="px-3 py-2">SL</th><th className="px-3 py-2">Đơn giá</th><th className="px-3 py-2">Tin cậy</th></tr></thead><tbody>{sales.items.map((item, index) => <tr key={`${item.imei || item.sku || item.name}-${index}`} className="border-t border-zinc-100"><td className="px-3 py-2 font-bold text-zinc-800">{item.name || item.sku || 'Chưa rõ'}</td><td className="px-3 py-2 font-mono text-zinc-600">{item.imei || '—'}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{formatMoney(item.unitPrice)} đ</td><td className="px-3 py-2 font-bold text-amber-700">{Math.round(item.confidence * 100)}%</td></tr>)}</tbody></table></div>
                </section>
              )}

              {conversation && (
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <h3 className="text-sm font-black text-zinc-900">Biên bản hội thoại & chăm sóc</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-zinc-600">Tên khách hàng<input value={conversation.customer.name} onChange={event => updateConversation({ customer: { ...conversation.customer, name: event.target.value } })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Số điện thoại<input value={conversation.customer.phone} onChange={event => updateConversation({ customer: { ...conversation.customer, phone: event.target.value } })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Sản phẩm quan tâm<input value={conversation.interestedModel || ''} onChange={event => updateConversation({ interestedModel: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                    <label className="text-xs font-bold text-zinc-600">Lịch hẹn<input value={conversation.appointmentAt || ''} onChange={event => updateConversation({ appointmentAt: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900" /></label>
                  </div>
                  <label className="mt-3 block text-xs font-bold text-zinc-600">Tóm tắt<textarea value={conversation.summary} onChange={event => updateConversation({ summary: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900" /></label>
                  <label className="mt-3 block text-xs font-bold text-zinc-600">Bản chép lời<textarea value={conversation.transcript} onChange={event => updateConversation({ transcript: event.target.value })} rows={5} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900" /></label>
                  {conversation.nextActions.length > 0 && <div className="mt-3 rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Việc cần chăm sóc</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs font-semibold text-zinc-700">{conversation.nextActions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ul></div>}
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500"><AudioLines className="h-4 w-4" /> File được xử lý server-side và lưu riêng tư để truy vết.</div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-600">Làm lại</button>
            {result && extraction && <button type="button" onClick={() => void confirmDraft()} disabled={confirming || confirmed} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> {confirming ? 'Đang lưu…' : confirmed ? 'Đã xác nhận' : 'Xác nhận bản nháp'}</button>}
            {conversation && confirmed && <button type="button" onClick={() => void createLead()} disabled={leadBusy || leadCreated} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><UserPlus className="h-4 w-4" /> {leadBusy ? 'Đang tạo lead…' : leadCreated ? 'Đã tạo lead CRM' : 'Tạo lead CRM'}</button>}
            {sales && onOpenPOS && <button type="button" onClick={() => onOpenPOS(sales, result.draftId)} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-black text-white">Mở POS để đối chiếu</button>}
          </div>
        </footer>
      </div>
    </div>
  );
};
