import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Loader2,
  LogOut,
  LocateFixed,
  RefreshCw,
  ShieldCheck,
  Timer,
  X,
  XCircle
} from 'lucide-react';
import type { AttendanceRecord, StaffMember } from '../types';
import {
  requestAttendanceHistory,
  requestAttendanceReview,
  type AttendanceHistorySummary
} from '../services/attendanceApiClient';
import { requestEvidencePreviewObjectUrl } from '../services/evidenceApiClient';
import { getVietnamDateString } from '../utils/dateTimeUtils';
import { resolveAttendanceWorkday } from '../../shared/attendancePolicy';

type HistoryFilter = 'ALL' | 'COMPLETED' | 'WORKING' | 'LATE' | 'MISSING' | 'PENDING';

interface AttendanceHistoryDrawerProps {
  open: boolean;
  staff: StaffMember | null;
  branchId: string;
  initialMonth: string;
  initialRecords?: AttendanceRecord[];
  canReview: boolean;
  onClose: () => void;
}

const EMPTY_SUMMARY: AttendanceHistorySummary = {
  workDays: 0,
  completedDays: 0,
  lateMinutes: 0,
  earlyMinutes: 0,
  overtimeMinutes: 0,
  missingCheckoutDays: 0,
  pendingReviewDays: 0
};

function staffUid(staff: StaffMember | null) {
  return String((staff as any)?.authUid || staff?.id || '');
}

function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || 'Không rõ ngày';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function formatMinutes(value: number) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return `${hours} giờ${rest ? ` ${rest} phút` : ''}`;
}

function recordState(record: AttendanceRecord) {
  const isPast = record.date < getVietnamDateString();
  if (record.verificationStatus === 'PENDING_REVIEW') return { key: 'PENDING', label: 'Chờ quản lý duyệt', className: 'bg-amber-50 text-amber-700' };
  if (record.verificationStatus === 'REJECTED' || record.status === 'REJECTED') return { key: 'REJECTED', label: 'Đã từ chối', className: 'bg-red-50 text-red-700' };
  if (record.checkInTime && !record.checkOutTime && isPast) return { key: 'MISSING', label: 'Thiếu giờ ra', className: 'bg-red-50 text-red-700' };
  if (record.checkOutTime || record.attendanceStatus === 'COMPLETED') return { key: 'COMPLETED', label: 'Đã kết ca', className: 'bg-emerald-50 text-emerald-700' };
  if (record.checkInTime) return { key: 'WORKING', label: 'Đang trong ca', className: 'bg-blue-50 text-blue-700' };
  return { key: 'UNKNOWN', label: 'Chưa vào ca', className: 'bg-zinc-100 text-zinc-600' };
}

function matchesFilter(record: AttendanceRecord, filter: HistoryFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'LATE') return Number(record.lateMinutes || 0) > 0;
  return recordState(record).key === filter;
}

function summarizeRecords(records: AttendanceRecord[]): AttendanceHistorySummary {
  return records.reduce((summary, record) => {
    summary.workDays += resolveAttendanceWorkday(record as any).credit;
    if (record.checkOutTime) summary.completedDays += 1;
    summary.lateMinutes += Math.max(0, Number(record.lateMinutes || 0));
    summary.earlyMinutes += Math.max(0, Number(record.earlyMinutes || 0));
    summary.overtimeMinutes += Math.max(0, Number(record.otMinutes || 0));
    if (record.checkInTime && !record.checkOutTime) summary.missingCheckoutDays += 1;
    if (record.verificationStatus === 'PENDING_REVIEW') summary.pendingReviewDays += 1;
    return summary;
  }, { ...EMPTY_SUMMARY });
}

export const AttendanceHistoryDrawer: React.FC<AttendanceHistoryDrawerProps> = ({
  open,
  staff,
  branchId,
  initialMonth,
  initialRecords = [],
  canReview,
  onClose
}) => {
  const [month, setMonth] = useState(initialMonth);
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceHistorySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [reviewRecord, setReviewRecord] = useState<AttendanceRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const uid = staffUid(staff);

  const fallbackRecords = useMemo(() => initialRecords
    .filter(record => record.staffId === uid && record.date.startsWith(month))
    .filter(record => branchId === 'ALL' || record.branchId === branchId)
    .sort((a, b) => b.date.localeCompare(a.date)), [branchId, initialRecords, month, uid]);

  const loadHistory = async () => {
    if (!open || !uid) return;
    setLoading(true);
    setError('');
    try {
      const result = await requestAttendanceHistory({ staffUid: uid, branchId, month });
      setRecords(result.records || []);
      setSummary(result.summary || EMPTY_SUMMARY);
    } catch (loadError: any) {
      setRecords(fallbackRecords);
      setSummary(summarizeRecords(fallbackRecords));
      setError(String(loadError?.message || 'Không tải được lịch sử chấm công.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setMonth(initialMonth);
    setFilter('ALL');
    setExpandedId('');
  }, [initialMonth, open, uid]);

  useEffect(() => {
    void loadHistory();
  }, [open, uid, branchId, month]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const visibleRecords = useMemo(() => records.filter(record => matchesFilter(record, filter)), [filter, records]);

  const showPhoto = async (evidenceId: string) => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setPhotoError('');
    setPhotoLoading(true);
    try {
      setPhotoUrl(await requestEvidencePreviewObjectUrl(evidenceId));
    } catch (previewError: any) {
      setPhotoError(String(previewError?.message || 'Không mở được ảnh chấm công.'));
    } finally {
      setPhotoLoading(false);
    }
  };

  const closePhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setPhotoError('');
  };

  const submitReview = async () => {
    if (!reviewRecord) return;
    if (reviewDecision === 'REJECT' && reviewReason.trim().length < 5) return;
    setReviewing(true);
    try {
      const updated = await requestAttendanceReview(reviewRecord.id, reviewDecision, reviewReason.trim());
      setRecords(current => current.map(record => record.id === updated.id ? updated : record));
      setReviewRecord(null);
      setReviewReason('');
      await loadHistory();
    } catch (reviewError: any) {
      setError(String(reviewError?.message || 'Không duyệt được bản ghi chấm công.'));
    } finally {
      setReviewing(false);
    }
  };

  if (!open || !staff) return null;

  return <div className="fixed inset-0 z-[140] flex justify-end bg-black/35 backdrop-blur-[2px]">
    <section className="flex h-full w-full flex-col bg-[#f7f7f8] shadow-2xl sm:max-w-2xl sm:border-l sm:border-zinc-200">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#ff4b16]"><Clock3 className="h-4 w-4" /> Lịch sử chấm công</div>
            <h2 className="mt-1 truncate text-xl font-black text-zinc-950">{staff.name}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500">{staff.roleTitle || staff.role} · {staff.branchName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng lịch sử" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-black outline-none focus:border-[#ff4b16]" />
          <select value={filter} onChange={event => setFilter(event.target.value as HistoryFilter)} className="h-9 min-w-36 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-black outline-none focus:border-[#ff4b16]">
            <option value="ALL">Tất cả trạng thái</option>
            <option value="COMPLETED">Đã kết ca</option>
            <option value="WORKING">Đang trong ca</option>
            <option value="LATE">Có đi trễ</option>
            <option value="MISSING">Thiếu giờ ra</option>
            <option value="PENDING">Chờ duyệt</option>
          </select>
          <button type="button" onClick={() => void loadHistory()} disabled={loading} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { label: 'Công hợp lệ', value: summary.workDays, icon: CalendarDays },
            { label: 'Đủ giờ ra', value: summary.completedDays, icon: CheckCircle2 },
            { label: 'Đi trễ', value: `${summary.lateMinutes}p`, icon: AlertCircle },
            { label: 'Tăng ca', value: formatMinutes(summary.overtimeMinutes), icon: Timer }
          ].map(item => <div key={item.label} className="min-w-[132px] flex-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"><item.icon className="h-4 w-4 text-[#ff4b16]" /><div className="mt-2 text-lg font-black text-zinc-950">{item.value}</div><div className="mt-0.5 text-[10px] font-bold text-zinc-500">{item.label}</div></div>)}
        </div>

        {error && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}{fallbackRecords.length ? ' Đang hiển thị dữ liệu realtime hiện có.' : ''}</span></div>}

        <div className="mt-3 space-y-2.5">
          {loading && records.length === 0 && <div className="grid place-items-center rounded-3xl border border-zinc-200 bg-white py-16 text-sm font-bold text-zinc-500"><Loader2 className="mb-3 h-6 w-6 animate-spin text-[#ff4b16]" />Đang tải lịch sử…</div>}
          {!loading && visibleRecords.length === 0 && <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-14 text-center"><CalendarDays className="mx-auto h-8 w-8 text-zinc-300" /><div className="mt-3 text-sm font-black text-zinc-700">Không có bản ghi phù hợp</div><p className="mt-1 text-xs font-semibold text-zinc-500">Hãy đổi tháng hoặc trạng thái lọc.</p></div>}
          {visibleRecords.map(record => {
            const state = recordState(record);
            const workday = resolveAttendanceWorkday(record as any);
            const expanded = expandedId === record.id;
            const distance = Number(record.verification?.distanceMeters ?? record.verification?.gpsDistanceMeters ?? 0);
            const coords = record.verification?.userCoords;
            const evidenceId = String(record.verification?.photoEvidenceId || '');
            return <article key={record.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <button type="button" onClick={() => setExpandedId(expanded ? '' : record.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${state.key === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : state.key === 'MISSING' || state.key === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-[#ff4b16]'}`}><Clock3 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-zinc-950">{formatDate(record.date)}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${state.className}`}>{state.label}</span></div>
                  <div className="mt-1 text-xs font-semibold text-zinc-500">{record.checkInTime || '--:--'} → {record.checkOutTime || (record.checkInTime ? 'chưa ra ca' : '--:--')} · {record.shiftName || 'Chưa có ca'}</div>
                </div>
                {expanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
              </button>
              {expanded && <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Detail label="Ca được xếp" value={`${record.scheduledStart || '--:--'}–${record.scheduledEnd || '--:--'}`} />
                  <Detail label="Thời gian thực làm" value={formatMinutes(record.netWorkMinutes || record.workDurationMinutes || 0)} />
                  <Detail label="Đi trễ" value={`${Number(record.lateMinutes || 0)} phút`} warning={Number(record.lateMinutes || 0) > 0} />
                  <Detail label="Về sớm / tăng ca" value={`${Number(record.earlyMinutes || 0)}p / ${Number(record.otMinutes || 0)}p`} />
                  <Detail label="Ngày công được tính" value={workday.credit === 1 ? '1 công' : workday.credit === 0.5 ? '0,5 công' : '0 công'} warning={workday.credit === 0} />
                  <Detail label="Ngưỡng đủ công" value={`${workday.actualNetMinutes}/${workday.requiredFullDayMinutes} phút (90%)`} />
                </div>
                <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                  <div className="flex items-start gap-2"><LocateFixed className={`mt-0.5 h-4 w-4 shrink-0 ${record.verification?.gpsVerified ? 'text-emerald-600' : 'text-red-600'}`} /><div className="min-w-0 flex-1"><div className="text-xs font-black text-zinc-800">{record.verification?.gpsVerified ? 'GPS phù hợp cửa hàng' : 'GPS cần quản lý kiểm tra'}</div><div className="mt-1 text-[11px] font-semibold text-zinc-500">Khoảng cách ghi nhận: {Math.round(distance)} m</div></div>{coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude) && <a href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-[#ff4b16]">Bản đồ <ExternalLink className="h-3 w-3" /></a>}</div>
                </div>
                {record.checkOutVerification && <div className="mt-2 rounded-xl bg-zinc-50 p-3">
                  <div className="flex items-start gap-2"><LogOut className={`mt-0.5 h-4 w-4 shrink-0 ${record.checkOutVerification.gpsVerified ? 'text-emerald-600' : 'text-amber-600'}`} /><div><div className="text-xs font-black text-zinc-800">GPS ra ca: {record.checkOutVerification.gpsVerified ? 'hợp lệ' : 'chờ quản lý duyệt'}</div><div className="mt-1 text-[11px] font-semibold text-zinc-500">Khoảng cách ghi nhận: {Math.round(Number(record.checkOutVerification.distanceMeters || 0))} m</div></div></div>
                </div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {evidenceId ? <button type="button" onClick={() => void showPhoto(evidenceId)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-black text-white"><Camera className="h-4 w-4" /> Xem ảnh vào ca</button> : <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-zinc-100 px-3 text-xs font-bold text-zinc-500"><Camera className="h-4 w-4" /> Không có ảnh</span>}
                  {canReview && record.verificationStatus === 'PENDING_REVIEW' && <button type="button" onClick={() => { setReviewRecord(record); setReviewDecision('APPROVE'); setReviewReason(''); }} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ff4b16] px-3 text-xs font-black text-white"><ShieldCheck className="h-4 w-4" /> Duyệt bản ghi</button>}
                </div>
                {record.reviewData && <div className="mt-3 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-600"><span className="font-black text-zinc-800">Lần duyệt gần nhất:</span> {record.reviewData.decision === 'APPROVE' ? 'Đã duyệt' : 'Từ chối'} bởi {record.reviewData.reviewedByName}{record.reviewData.reason ? ` · ${record.reviewData.reason}` : ''}</div>}
              </div>}
            </article>;
          })}
        </div>
      </main>
    </section>

    {(photoLoading || photoUrl || photoError) && <div className="fixed inset-0 z-[160] grid place-items-center bg-black/75 p-4" onClick={closePhoto}>
      <div className="relative max-h-full max-w-2xl overflow-hidden rounded-2xl bg-white p-2" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={closePhoto} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white"><X className="h-4 w-4" /></button>
        {photoLoading && <div className="grid h-64 w-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#ff4b16]" /></div>}
        {photoError && <div className="flex h-64 w-72 flex-col items-center justify-center p-5 text-center text-sm font-bold text-red-600"><AlertCircle className="mb-3 h-7 w-7" />{photoError}</div>}
        {photoUrl && <img src={photoUrl} alt="Ảnh chấm công" className="max-h-[82vh] max-w-full rounded-xl object-contain" />}
      </div>
    </div>}

    {reviewRecord && <div className="fixed inset-0 z-[155] grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-4">
      <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-[#ff4b16]">Kiểm tra chấm công</div><h3 className="mt-1 text-lg font-black text-zinc-950">{formatDate(reviewRecord.date)}</h3></div><button type="button" onClick={() => setReviewRecord(null)} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setReviewDecision('APPROVE')} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-black ${reviewDecision === 'APPROVE' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-600'}`}><CheckCircle2 className="h-4 w-4" /> Duyệt</button>
          <button type="button" onClick={() => setReviewDecision('REJECT')} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-black ${reviewDecision === 'REJECT' ? 'border-red-500 bg-red-50 text-red-700' : 'border-zinc-200 text-zinc-600'}`}><XCircle className="h-4 w-4" /> Từ chối</button>
        </div>
        <label className="mt-4 block text-xs font-black text-zinc-700">Ghi chú {reviewDecision === 'REJECT' ? '(bắt buộc)' : '(nếu có)'}</label>
        <textarea value={reviewReason} onChange={event => setReviewReason(event.target.value)} rows={3} placeholder="Nêu lý do để lưu vào lịch sử kiểm duyệt" className="mt-2 w-full resize-none rounded-xl border border-zinc-200 p-3 text-sm font-semibold outline-none focus:border-[#ff4b16]" />
        <button type="button" onClick={() => void submitReview()} disabled={reviewing || (reviewDecision === 'REJECT' && reviewReason.trim().length < 5)} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff4b16] to-[#ff9f0a] text-sm font-black text-white disabled:opacity-40">{reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Xác nhận</button>
      </div>
    </div>}
  </div>;
};

const Detail: React.FC<{ label: string; value: string; warning?: boolean }> = ({ label, value, warning }) => <div className="rounded-xl bg-zinc-50 p-2.5"><div className="text-[10px] font-bold text-zinc-500">{label}</div><div className={`mt-1 font-black ${warning ? 'text-[#ff4b16]' : 'text-zinc-900'}`}>{value}</div></div>;

export default AttendanceHistoryDrawer;
