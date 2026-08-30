import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines, Ban, Check, FileAudio, FileImage, Loader2, Mic, PackagePlus, Plus, ScanLine,
  ShieldCheck, Sparkles, Square, Trash2, Upload, UserPlus, Wrench, X
} from 'lucide-react';
import {
  AiCaptureExtraction,
  AiCaptureResult,
  AiCaptureSourceType,
  AiCaptureStatus,
  ConversationExtraction,
  PurchaseReceiptExtraction,
  RepairIntakeExtraction,
  SalesSlipExtraction,
  confirmAiCaptureDraft,
  createLeadFromAiCaptureDraft,
  getAiCaptureStatus,
  requestAiCapture
} from '../services/aiCaptureApiClient';

interface AiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPOS?: (extraction: SalesSlipExtraction, draftId: string) => void;
  onOpenPurchase?: (extraction: PurchaseReceiptExtraction, draftId: string) => void;
  onOpenRepair?: (extraction: RepairIntakeExtraction, draftId: string) => void;
  embedded?: boolean;
}

const imageAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const audioAccept = 'audio/*';
const maxCaptureBytes = 3 * 1024 * 1024;
const maxRecordingSeconds = 5 * 60;
const issueTypes = [
  'Nguồn / Mất Nguồn', 'Màn Hình / Cảm Ứng', 'Pin / Phù Pin', 'Face ID / Camera',
  'Sóng / Wifi', 'Loa / Mic', 'Ép Kính / Thay Lưng', 'Mainboard / IC Sạc', 'Khác'
];

const captureModules: Array<{
  type: AiCaptureSourceType;
  label: string;
  shortLabel: string;
  description: string;
  accept: string;
  icon: typeof FileImage;
}> = [
  { type: 'SALES_SLIP', label: 'Phiếu bán hàng', shortLabel: 'Phiếu bán', description: 'Ảnh phiếu hoặc đọc trực tiếp', accept: `${imageAccept},${audioAccept}`, icon: FileImage },
  { type: 'CONVERSATION', label: 'Hội thoại CRM', shortLabel: 'Hội thoại', description: 'Thu trực tiếp hoặc chọn audio', accept: audioAccept, icon: FileAudio },
  { type: 'PURCHASE_RECEIPT', label: 'Phiếu nhập hàng', shortLabel: 'Nhập hàng', description: 'Ảnh phiếu NCC hoặc đọc trực tiếp', accept: `${imageAccept},${audioAccept}`, icon: PackagePlus },
  { type: 'REPAIR_INTAKE', label: 'Tiếp nhận sửa chữa', shortLabel: 'Sửa chữa', description: 'Ảnh phiếu hoặc ghi âm mô tả lỗi', accept: `${imageAccept},audio/*`, icon: Wrench }
];

function formatMoney(value: number | null | undefined): string {
  return value == null ? '' : Number(value).toLocaleString('vi-VN');
}

function moneyFromInput(value: string): number | null {
  const parsed = Number(value.replace(/\D/g, ''));
  return parsed > 0 ? parsed : null;
}

function confidenceLabel(value: number): string {
  if (value >= 0.85) return 'Cao';
  if (value >= 0.6) return 'Trung bình';
  return 'Thấp';
}

const controlClass = 'mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-orange-500';
const textareaClass = 'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-orange-500';

export const AiCaptureModal: React.FC<AiCaptureModalProps> = ({
  isOpen, onClose, onOpenPOS, onOpenPurchase, onOpenRepair, embedded = false
}) => {
  const [sourceType, setSourceType] = useState<AiCaptureSourceType>('SALES_SLIP');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [result, setResult] = useState<AiCaptureResult | null>(null);
  const [extraction, setExtraction] = useState<AiCaptureExtraction | null>(null);
  const [status, setStatus] = useState<AiCaptureStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [leadCreated, setLeadCreated] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  const selectedModule = captureModules.find(module => module.type === sourceType) || captureModules[0];

  useEffect(() => {
    if (!isOpen) return;
    setStatusLoading(true);
    void getAiCaptureStatus()
      .then(setStatus)
      .catch(statusError => setError(statusError?.message || 'Không thể kiểm tra API AI dùng chung.'))
      .finally(() => setStatusLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!file) {
      setFileUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (isOpen) return;
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
  }, [isOpen]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
  }, []);

  const cancelDirectRecording = () => {
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
    setRecordingSeconds(0);
  };

  const reset = () => {
    cancelDirectRecording();
    setFile(null);
    setResult(null);
    setExtraction(null);
    setError('');
    setConfirmed(false);
    setLeadCreated(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const selectSource = (next: AiCaptureSourceType) => {
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

  const startDirectRecording = async () => {
    if (recording || busy) return;
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Trình duyệt này chưa hỗ trợ ghi âm trực tiếp. Bạn vẫn có thể chọn tệp ghi âm có sẵn.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mimeType = candidates.find(candidate => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      handleFile(null);

      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        recordingChunksRef.current.push(event.data);
        const recordedBytes = recordingChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        if (recordedBytes > maxCaptureBytes && recorder.state !== 'inactive') {
          discardRecordingRef.current = true;
          setError('Bản ghi đã vượt giới hạn 3 MB. Hãy ghi lại đoạn ngắn hơn.');
          recorder.stop();
        }
      };
      recorder.onerror = () => setError('Ghi âm bị gián đoạn. Vui lòng thử lại.');
      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (discardRecordingRef.current) {
          setRecordingSeconds(0);
          return;
        }
        const normalizedType = String(recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: normalizedType });
        if (!blob.size) {
          setError('Không thu được âm thanh. Hãy kiểm tra microphone và thử lại.');
          return;
        }
        if (blob.size > maxCaptureBytes) {
          setError('Bản ghi vượt giới hạn 3 MB. Hãy ghi lại đoạn ngắn hơn.');
          return;
        }
        const extension = normalizedType.includes('mp4') ? 'm4a' : normalizedType.includes('wav') ? 'wav' : 'webm';
        handleFile(new File([blob], `ghi-am-${sourceType.toLowerCase()}-${Date.now()}.${extension}`, { type: normalizedType }));
      };

      recorder.start(1_000);
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(current => {
          const next = current + 1;
          if (next >= maxRecordingSeconds && recorder.state !== 'inactive') recorder.stop();
          return next;
        });
      }, 1_000);
    } catch (recordingError: any) {
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      const denied = recordingError?.name === 'NotAllowedError' || recordingError?.name === 'SecurityError';
      setError(denied ? 'Chưa được cấp quyền microphone. Hãy cho phép microphone trên trình duyệt rồi thử lại.' : recordingError?.message || 'Không thể bắt đầu ghi âm.');
    }
  };

  const stopDirectRecording = () => {
    discardRecordingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
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
      setStatus({ configured: true, provider: captured.aiProvider, model: captured.aiModel, source: captured.aiConfiguration });
    } catch (captureError: any) {
      setError(captureError?.message || 'Không thể phân tích tệp.');
    } finally {
      setBusy(false);
    }
  };

  const updateSales = (patch: Partial<SalesSlipExtraction>) => setExtraction(current => current?.sourceType === 'SALES_SLIP' ? { ...current, ...patch } : current);
  const updateConversation = (patch: Partial<ConversationExtraction>) => setExtraction(current => current?.sourceType === 'CONVERSATION' ? { ...current, ...patch } : current);
  const updatePurchase = (patch: Partial<PurchaseReceiptExtraction>) => setExtraction(current => current?.sourceType === 'PURCHASE_RECEIPT' ? { ...current, ...patch } : current);
  const updateRepair = (patch: Partial<RepairIntakeExtraction>) => setExtraction(current => current?.sourceType === 'REPAIR_INTAKE' ? { ...current, ...patch } : current);

  const confirmDraft = async () => {
    if (!result || !extraction || confirming) return;
    setConfirming(true);
    setError('');
    try {
      await confirmAiCaptureDraft(result.draftId, extraction);
      setConfirmed(true);
      window.alert('Đã xác nhận bản nháp AI. Dữ liệu vẫn chưa ghi vào nghiệp vụ cho tới khi bạn kiểm tra và lưu ở module đích.');
    } catch (confirmError: any) {
      setError(confirmError?.message || 'Không thể xác nhận bản nháp.');
    } finally {
      setConfirming(false);
    }
  };

  const createLead = async () => {
    if (!result || !confirmed || leadBusy || leadCreated || extraction?.sourceType !== 'CONVERSATION') return;
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
  const purchase = extraction?.sourceType === 'PURCHASE_RECEIPT' ? extraction : null;
  const repair = extraction?.sourceType === 'REPAIR_INTAKE' ? extraction : null;
  const isImage = Boolean(file?.type.startsWith('image/'));
  const isAudio = Boolean(file?.type.startsWith('audio/'));

  return (
    <div className={embedded ? 'w-full' : 'fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4'}>
      <div className={embedded ? 'flex min-h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-sm' : 'flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-orange-200 bg-white shadow-2xl sm:rounded-3xl'}>
        <header className="flex items-start justify-between gap-3 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl bg-orange-600 p-2.5 text-white shadow-lg shadow-orange-600/20"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-zinc-950">AI nhập liệu PhoneHouse</h2>
              <p className="text-[11px] font-semibold text-zinc-500">Ảnh hoặc ghi âm → bản nháp có thể sửa → module nghiệp vụ để kiểm tra lần cuối</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${status?.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {statusLoading ? 'Đang kiểm tra API…' : status?.configured ? `API dùng chung · ${status.model}` : 'Chưa có API dùng chung'}
            </span>
            {!embedded && <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Đóng"><X className="h-5 w-5" /></button>}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {status?.configured && <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800">Đang dùng {status.source === 'SHARED_DATABASE' ? 'API key chung đã lưu trong hệ thống' : 'API key chung từ môi trường máy chủ'} · {status.provider === 'GOOGLE_GEMINI' ? 'Google Gemini' : 'Endpoint tương thích OpenAI'}. Khóa bí mật không được gửi về trình duyệt.</div>}

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1 lg:grid-cols-4">
            {captureModules.map(module => {
              const Icon = module.icon;
              return <button key={module.type} type="button" onClick={() => selectSource(module.type)} className={`rounded-xl px-3 py-2.5 text-left transition ${sourceType === module.type ? 'bg-white text-orange-700 shadow-sm' : 'text-zinc-500 hover:bg-white/60'}`}><span className="flex items-center gap-2 text-xs font-black"><Icon className="h-4 w-4" />{module.shortLabel}</span><span className="mt-1 hidden text-[10px] font-semibold text-zinc-400 sm:block">{module.description}</span></button>;
            })}
          </div>

          <div className="mt-4 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-5 text-center">
            {isImage && fileUrl && <img src={fileUrl} alt="Tệp ảnh đã chọn" className="mx-auto mb-4 max-h-52 max-w-full rounded-xl object-contain shadow-sm" />}
            {isAudio && fileUrl && <audio controls src={fileUrl} className="mx-auto mb-4 w-full max-w-md" />}
            <input ref={inputRef} type="file" accept={selectedModule.accept} className="hidden" onChange={event => handleFile(event.target.files?.[0] || null)} />
            <Upload className="mx-auto h-7 w-7 text-orange-500" />
            <p className="mt-2 text-sm font-black text-zinc-800">{file ? file.name : `Chọn tệp cho ${selectedModule.label.toLowerCase()}`}</p>
            <p className="mt-1 text-[11px] font-semibold text-zinc-500">{selectedModule.description} · tối đa 3 MB</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-orange-700 hover:bg-orange-50">{file ? 'Chọn tệp khác' : 'Chọn tệp'}</button>
              {!recording && <button type="button" onClick={() => void startDirectRecording()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Mic className="h-4 w-4" />Ghi âm trực tiếp</button>}
              {recording && <><button type="button" onClick={stopDirectRecording} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white"><Square className="h-3.5 w-3.5 fill-current" />Dừng · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</button><button type="button" onClick={cancelDirectRecording} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-black text-zinc-600"><Ban className="h-4 w-4" />Hủy</button></>}
              <button type="button" onClick={() => void runCapture()} disabled={!file || busy || status?.configured === false} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}{busy ? 'Đang phân tích…' : 'Phân tích bằng AI'}</button>
            </div>
            {recording && <p className="mt-3 flex items-center justify-center gap-2 text-xs font-black text-rose-700"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />Đang thu microphone · tối đa 5 phút / 3 MB</p>}
          </div>

          {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div>}

          {extraction && result && <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-800"><ShieldCheck className="h-4 w-4" />Bản nháp đã tạo · chưa tự ghi vào POS, kho hoặc sửa chữa</div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-emerald-700">Độ tin cậy {Math.round(extraction.confidence * 100)}% · {confidenceLabel(extraction.confidence)}</span>
            </div>
            {extraction.fieldsToReview.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Cần kiểm tra: {extraction.fieldsToReview.join(' · ')}</div>}

            {sales && <SalesReview value={sales} onChange={updateSales} />}
            {conversation && <ConversationReview value={conversation} onChange={updateConversation} />}
            {purchase && <PurchaseReview value={purchase} onChange={updatePurchase} />}
            {repair && <RepairReview value={repair} onChange={updateRepair} />}
          </div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500"><AudioLines className="h-4 w-4" />File được xử lý server-side và lưu riêng tư để truy vết.</div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={reset} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-600">Làm lại</button>
            {result && extraction && <button type="button" onClick={() => void confirmDraft()} disabled={confirming || confirmed} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />{confirming ? 'Đang lưu…' : confirmed ? 'Đã xác nhận' : 'Xác nhận bản nháp'}</button>}
            {conversation && confirmed && <button type="button" onClick={() => void createLead()} disabled={leadBusy || leadCreated} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />{leadBusy ? 'Đang tạo lead…' : leadCreated ? 'Đã tạo lead CRM' : 'Tạo lead CRM'}</button>}
            {sales && confirmed && onOpenPOS && <button type="button" onClick={() => onOpenPOS(sales, result!.draftId)} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-black text-white">Mở POS để đối chiếu</button>}
            {purchase && confirmed && onOpenPurchase && <button type="button" onClick={() => onOpenPurchase(purchase, result!.draftId)} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-black text-white">Mở phiếu nhập hàng</button>}
            {repair && confirmed && onOpenRepair && <button type="button" onClick={() => onOpenRepair(repair, result!.draftId)} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-black text-white">Mở tiếp nhận sửa chữa</button>}
          </div>
        </footer>
      </div>
    </div>
  );
};

function SalesReview({ value, onChange }: { value: SalesSlipExtraction; onChange: (patch: Partial<SalesSlipExtraction>) => void }) {
  return <section className="rounded-2xl border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-900">Thông tin phiếu bán</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field label="Tên khách hàng"><input value={value.customer.name} onChange={event => onChange({ customer: { ...value.customer, name: event.target.value } })} className={controlClass} /></Field>
    <Field label="Số điện thoại"><input value={value.customer.phone} onChange={event => onChange({ customer: { ...value.customer, phone: event.target.value } })} className={controlClass} /></Field>
    <Field label="Ngày bán"><input value={value.saleDate || ''} onChange={event => onChange({ saleDate: event.target.value || null })} className={controlClass} /></Field>
    <Field label="Phương thức thanh toán"><input value={value.paymentMethod || ''} onChange={event => onChange({ paymentMethod: event.target.value || null })} className={controlClass} /></Field>
    <MoneyField label="Giảm giá (VNĐ)" value={value.discountAmount} onChange={discountAmount => onChange({ discountAmount })} />
    <MoneyField label="Tổng tiền (VNĐ)" value={value.totalAmount} onChange={totalAmount => onChange({ totalAmount })} />
  </div><ItemTable items={value.items} onChange={items => onChange({ items })} priceLabel="Đơn giá bán" /></section>;
}

function ConversationReview({ value, onChange }: { value: ConversationExtraction; onChange: (patch: Partial<ConversationExtraction>) => void }) {
  return <section className="rounded-2xl border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-900">Biên bản hội thoại & chăm sóc</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field label="Tên khách hàng"><input value={value.customer.name} onChange={event => onChange({ customer: { ...value.customer, name: event.target.value } })} className={controlClass} /></Field>
    <Field label="Số điện thoại"><input value={value.customer.phone} onChange={event => onChange({ customer: { ...value.customer, phone: event.target.value } })} className={controlClass} /></Field>
    <Field label="Sản phẩm quan tâm"><input value={value.interestedModel || ''} onChange={event => onChange({ interestedModel: event.target.value || null })} className={controlClass} /></Field>
    <Field label="Lịch hẹn"><input value={value.appointmentAt || ''} onChange={event => onChange({ appointmentAt: event.target.value || null })} className={controlClass} /></Field>
  </div><Field label="Tóm tắt"><textarea value={value.summary} onChange={event => onChange({ summary: event.target.value })} rows={3} className={textareaClass} /></Field><Field label="Bản chép lời"><textarea value={value.transcript} onChange={event => onChange({ transcript: event.target.value })} rows={5} className={textareaClass} /></Field>
  {value.nextActions.length > 0 && <div className="mt-3 rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Việc cần chăm sóc</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs font-semibold text-zinc-700">{value.nextActions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ul></div>}</section>;
}

function PurchaseReview({ value, onChange }: { value: PurchaseReceiptExtraction; onChange: (patch: Partial<PurchaseReceiptExtraction>) => void }) {
  return <section className="rounded-2xl border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-900">Phiếu nhập hàng / hóa đơn nhà cung cấp</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">
    <Field label="Nhà cung cấp"><input value={value.supplier.name} onChange={event => onChange({ supplier: { ...value.supplier, name: event.target.value } })} className={controlClass} /></Field>
    <Field label="Điện thoại NCC"><input value={value.supplier.phone} onChange={event => onChange({ supplier: { ...value.supplier, phone: event.target.value } })} className={controlClass} /></Field>
    <Field label="Mã số thuế"><input value={value.supplier.taxCode} onChange={event => onChange({ supplier: { ...value.supplier, taxCode: event.target.value } })} className={controlClass} /></Field>
    <Field label="Số chứng từ"><input value={value.documentCode || ''} onChange={event => onChange({ documentCode: event.target.value || null })} className={controlClass} /></Field>
    <Field label="Ngày nhập"><input type="date" value={(value.purchaseDate || '').slice(0, 10)} onChange={event => onChange({ purchaseDate: event.target.value || null })} className={controlClass} /></Field>
    <Field label="Thanh toán"><input value={value.paymentMethod || ''} onChange={event => onChange({ paymentMethod: event.target.value || null })} className={controlClass} /></Field>
    <MoneyField label="Giảm giá (VNĐ)" value={value.discountAmount} onChange={discountAmount => onChange({ discountAmount })} />
    <MoneyField label="Tổng tiền (VNĐ)" value={value.totalAmount} onChange={totalAmount => onChange({ totalAmount })} />
  </div><ItemTable items={value.items} onChange={items => onChange({ items })} priceLabel="Giá nhập" /><Field label="Ghi chú"><textarea value={value.notes} onChange={event => onChange({ notes: event.target.value })} rows={3} className={textareaClass} /></Field></section>;
}

function RepairReview({ value, onChange }: { value: RepairIntakeExtraction; onChange: (patch: Partial<RepairIntakeExtraction>) => void }) {
  return <section className="rounded-2xl border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-900">Thông tin tiếp nhận sửa chữa</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <Field label="Tên khách hàng"><input value={value.customer.name} onChange={event => onChange({ customer: { ...value.customer, name: event.target.value } })} className={controlClass} /></Field>
    <Field label="Số điện thoại"><input value={value.customer.phone} onChange={event => onChange({ customer: { ...value.customer, phone: event.target.value } })} className={controlClass} /></Field>
    <Field label="IMEI / Serial"><input value={value.imei || ''} onChange={event => onChange({ imei: event.target.value.replace(/\D/g, '').slice(0, 15) || null })} className={controlClass} /></Field>
    <Field label="Model máy"><input value={value.model} onChange={event => onChange({ model: event.target.value })} className={controlClass} /></Field>
    <Field label="Nhóm lỗi"><select value={value.issueType} onChange={event => onChange({ issueType: event.target.value })} className={controlClass}>{issueTypes.map(issue => <option key={issue}>{issue}</option>)}</select></Field>
    <Field label="Hẹn trả máy"><input type="datetime-local" value={(value.expectedReturnDate || '').slice(0, 16)} onChange={event => onChange({ expectedReturnDate: event.target.value || null })} className={controlClass} /></Field>
    <Field label="Ngoại hình"><input value={value.deviceAppearance} onChange={event => onChange({ deviceAppearance: event.target.value })} className={controlClass} /></Field>
    <Field label="Phụ kiện đi kèm"><input value={value.accessoriesIncluded} onChange={event => onChange({ accessoriesIncluded: event.target.value })} className={controlClass} /></Field>
    <MoneyField label="Báo giá dự kiến (VNĐ)" value={value.estimatedCost} onChange={estimatedCost => onChange({ estimatedCost })} />
  </div><Field label="Lỗi/yêu cầu của khách"><textarea value={value.faultDescription} onChange={event => onChange({ faultDescription: event.target.value })} rows={3} className={textareaClass} /></Field><Field label="Bản chép lời"><textarea value={value.transcript} onChange={event => onChange({ transcript: event.target.value })} rows={4} className={textareaClass} /></Field><Field label="Ghi chú nội bộ"><textarea value={value.notes} onChange={event => onChange({ notes: event.target.value })} rows={2} className={textareaClass} /></Field></section>;
}

function ItemTable({ items, onChange, priceLabel }: { items: SalesSlipExtraction['items']; onChange: (items: SalesSlipExtraction['items']) => void; priceLabel: string }) {
  const updateItem = (index: number, patch: Partial<SalesSlipExtraction['items'][number]>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addItem = () => onChange([...items, { name: '', sku: null, imei: null, quantity: 1, unitPrice: null, totalPrice: null, confidence: 0 }]);
  return <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-zinc-700">Dòng hàng</p><button type="button" onClick={addItem} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2 py-1 text-[10px] font-black text-orange-700"><Plus className="h-3 w-3" />Thêm dòng</button></div><div className="overflow-x-auto rounded-xl border border-zinc-100"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] font-black uppercase text-zinc-500"><tr><th className="px-2 py-2">Sản phẩm</th><th className="px-2 py-2">SKU</th><th className="px-2 py-2">IMEI</th><th className="px-2 py-2">SL</th><th className="px-2 py-2">{priceLabel}</th><th className="w-10" /></tr></thead><tbody>{items.map((item, index) => <tr key={`${index}-${item.imei || item.sku || 'line'}`} className="border-t border-zinc-100"><td className="p-1.5"><input value={item.name} onChange={event => updateItem(index, { name: event.target.value })} className="h-9 w-full rounded-lg border border-zinc-200 px-2 font-semibold" /></td><td className="p-1.5"><input value={item.sku || ''} onChange={event => updateItem(index, { sku: event.target.value || null })} className="h-9 w-full rounded-lg border border-zinc-200 px-2 font-mono" /></td><td className="p-1.5"><input value={item.imei || ''} onChange={event => updateItem(index, { imei: event.target.value.replace(/\D/g, '').slice(0, 15) || null })} className="h-9 w-full rounded-lg border border-zinc-200 px-2 font-mono" /></td><td className="p-1.5"><input type="number" min={1} value={item.quantity} onChange={event => updateItem(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="h-9 w-16 rounded-lg border border-zinc-200 px-2" /></td><td className="p-1.5"><input inputMode="numeric" value={formatMoney(item.unitPrice)} onChange={event => updateItem(index, { unitPrice: moneyFromInput(event.target.value) })} className="h-9 w-32 rounded-lg border border-zinc-200 px-2 text-right font-mono" /></td><td className="p-1.5"><button type="button" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-rose-500 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-xs font-bold text-zinc-600">{label}{children}</label>;
}

function MoneyField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return <Field label={label}><input inputMode="numeric" value={formatMoney(value)} onChange={event => onChange(moneyFromInput(event.target.value))} className={controlClass} /></Field>;
}
