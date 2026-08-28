import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  LogOut,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { AttendanceRecord, StaffMember, StoreBranch, UserAccount } from '../types';
import { getVietnamDateString } from '../utils/dateTimeUtils';
import { CheckInContext, requestCheckInContext } from '../services/attendanceApiClient';

interface StandaloneCheckInViewProps {
  currentUser?: UserAccount | StaffMember | null;
  staffList?: StaffMember[];
  branches?: StoreBranch[];
  attendanceRecords?: AttendanceRecord[];
  onCheckInSuccess?: (record: any) => Promise<any> | void;
  onCheckOutSuccess?: () => Promise<AttendanceRecord | void> | AttendanceRecord | void;
  onNavigateToHR?: () => void;
  onClose?: () => void;
}

type GpsResult = {
  status: 'IDLE' | 'LOADING' | 'MATCHED' | 'OUTSIDE' | 'ERROR';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  distanceMeters?: number;
  message?: string;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = toRadians(lat2 - lat1);
  const deltaLongitude = toRadians(lng2 - lng1);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatVietnamClock(date: Date) {
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
  });
}

function formatVietnamDate(date: Date) {
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
  });
}

export const StandaloneCheckInView: React.FC<StandaloneCheckInViewProps> = ({
  currentUser,
  branches = [],
  attendanceRecords = [],
  onCheckInSuccess,
  onCheckOutSuccess,
  onNavigateToHR,
  onClose
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedBranchId, setSelectedBranchId] = useState(() => currentUser?.branchId || '');
  const [context, setContext] = useState<CheckInContext | null>(null);
  const [contextError, setContextError] = useState('');
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [gps, setGps] = useState<GpsResult>({ status: 'IDLE' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoTakenAt, setPhotoTakenAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completedRecord, setCompletedRecord] = useState<AttendanceRecord | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkOutError, setCheckOutError] = useState('');

  const role = String(currentUser?.role || '').toUpperCase();
  const assignedBranchIds = (currentUser as UserAccount | undefined)?.assignedBranchIds || [];
  const allowedBranchIds = useMemo(
    () => new Set([currentUser?.branchId, ...assignedBranchIds].filter(Boolean)),
    [currentUser?.branchId, assignedBranchIds]
  );
  const availableBranches = useMemo(() => branches
    .filter(branch => branch.isActive !== false)
    .filter(branch => ['ADMIN', 'REGIONAL_MANAGER'].includes(role) || allowedBranchIds.has(branch.id)),
  [branches, role, allowedBranchIds]);

  useEffect(() => {
    if (!selectedBranchId && availableBranches[0]?.id) setSelectedBranchId(availableBranches[0].id);
  }, [availableBranches, selectedBranchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const authUid = auth.currentUser?.uid || currentUser?.id || '';
  const today = getVietnamDateString();
  const existingAttendance = attendanceRecords.find(record => record.staffId === authUid && record.date === today && record.checkInTime);
  const activeAttendance = completedRecord || existingAttendance || null;
  const hasCheckedOut = Boolean(
    activeAttendance?.checkOutTime
    || activeAttendance?.attendanceStatus === 'COMPLETED'
    || activeAttendance?.status === 'COMPLETED'
  );

  const loadContext = async () => {
    if (!selectedBranchId) return;
    setIsLoadingContext(true);
    setContextError('');
    setContext(null);
    setGps({ status: 'IDLE' });
    try {
      const result = await requestCheckInContext(selectedBranchId);
      setContext(result);
    } catch (error: any) {
      setContextError(error?.message || 'Không tải được ca làm việc hôm nay.');
    } finally {
      setIsLoadingContext(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, [selectedBranchId]);

  const locate = () => {
    if (!context) {
      setGps({ status: 'ERROR', message: 'Chưa tải được tọa độ cửa hàng.' });
      return;
    }
    if (!navigator.geolocation) {
      setGps({ status: 'ERROR', message: 'Điện thoại hoặc trình duyệt không hỗ trợ định vị GPS.' });
      return;
    }
    setGps({ status: 'LOADING' });
    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const distance = distanceMeters(latitude, longitude, context.branch.latitude, context.branch.longitude);
        const matched = distance <= context.branch.radiusMeters;
        setGps({
          status: matched ? 'MATCHED' : 'OUTSIDE',
          latitude,
          longitude,
          accuracyMeters: Math.round(position.coords.accuracy || 0),
          distanceMeters: distance,
          message: matched
            ? `Vị trí hợp lệ, cách cửa hàng ${distance}m.`
            : `Bạn đang cách cửa hàng ${distance}m, vượt bán kính ${context.branch.radiusMeters}m.`
        });
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Hãy cho phép truy cập vị trí trong cài đặt trình duyệt rồi thử lại.'
          : error.code === error.TIMEOUT
            ? 'Không lấy được GPS kịp thời. Hãy ra vị trí thoáng và thử lại.'
            : 'Không xác định được vị trí hiện tại.';
        setGps({ status: 'ERROR', message });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  };

  const selectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSubmitError('Chỉ chấp nhận ảnh chụp từ điện thoại.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setSubmitError('Ảnh lớn hơn 12 MB. Hãy chụp lại ở chất lượng thường.');
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoTakenAt(formatVietnamClock(new Date()));
    setSubmitError('');
  };

  const submit = async () => {
    if (!context || !onCheckInSuccess || gps.status !== 'MATCHED' || !gps.latitude || !gps.longitude || !photoFile) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await onCheckInSuccess({
        branchId: context.branch.id,
        branchName: context.branch.name,
        verification: {
          userCoords: { latitude: gps.latitude, longitude: gps.longitude },
          snapshotFile: photoFile
        }
      });
      setCompletedRecord(result as AttendanceRecord);
    } catch (error: any) {
      setSubmitError(error?.message || 'Chấm công chưa thành công.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkOut = async () => {
    if (!onCheckOutSuccess || isCheckingOut) return;
    if (!window.confirm('Xác nhận kết thúc ca làm việc hiện tại?')) return;
    setIsCheckingOut(true);
    setCheckOutError('');
    try {
      const result = await onCheckOutSuccess();
      if (result) setCompletedRecord(result);
      else setCheckOutError('Chưa nhận được xác nhận kết thúc ca từ máy chủ. Vui lòng thử lại.');
    } catch (error: any) {
      setCheckOutError(error?.message || 'Kết thúc ca chưa thành công.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (activeAttendance) {
    const record = activeAttendance;
    const recordDistance = record.verification?.distanceMeters ?? record.verification?.gpsDistanceMeters;
    const isWorking = !hasCheckedOut;
    return (
      <div className={`min-h-full bg-[#fffaf6] p-3 sm:p-6 ${isWorking ? 'pb-36' : 'pb-24'}`}>
        <div className="mx-auto max-w-xl overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-xl shadow-orange-100/60">
          <div className={`bg-gradient-to-br px-5 py-6 text-white ${isWorking ? 'from-orange-600 via-orange-500 to-amber-400' : 'from-emerald-700 via-emerald-600 to-teal-500'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">{isWorking ? 'Đang trong ca' : 'Đã kết thúc ca'}</p>
                <h1 className="mt-1 text-2xl font-black">{isWorking ? 'Bước tiếp theo: Ra ca' : 'Chấm công hôm nay hoàn tất'}</h1>
                <p className="mt-1 text-sm font-semibold text-white/90">{record.branchName || context?.branch.name}</p>
              </div>
              {isWorking ? <Clock3 className="h-10 w-10 shrink-0" /> : <CheckCircle2 className="h-10 w-10 shrink-0" />}
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2.5 backdrop-blur">
              <AttendanceStep label="1. Vào ca" value={record.checkInTime || '--:--'} state="done" />
              <span className="text-lg font-black text-white/60">→</span>
              <AttendanceStep label="2. Ra ca" value={record.checkOutTime || 'Chưa ra ca'} state={isWorking ? 'current' : 'done'} />
            </div>
          </div>
          <div className="space-y-3 p-5">
            <ResultRow icon={Clock3} label="Ca làm" value={`${record.shiftName || 'Ca làm việc'} · ${record.scheduledStart || '--:--'}–${record.scheduledEnd || '--:--'}`} />
            <ResultRow icon={MapPin} label="GPS" value={record.verification?.gpsVerified ? `Hợp lệ${Number.isFinite(recordDistance) ? ` · cách ${Math.round(Number(recordDistance))}m` : ''}` : 'Chờ quản lý kiểm tra'} />
            <ResultRow icon={Camera} label="Ảnh tại chỗ" value={record.verification?.photoCaptured || record.verification?.photoEvidenceId ? 'Đã lưu an toàn' : 'Đã gửi'} />
            {hasCheckedOut && Number(record.workDurationMinutes || 0) > 0 && (
              <ResultRow icon={ShieldCheck} label="Thời gian làm việc" value={`${Math.floor(Number(record.workDurationMinutes) / 60)} giờ ${Number(record.workDurationMinutes) % 60} phút`} />
            )}
            {checkOutError && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{checkOutError}</div>}
            {hasCheckedOut && <button onClick={onClose} className="mt-3 w-full rounded-2xl bg-zinc-950 px-4 py-3.5 text-sm font-black text-white">Đóng</button>}
          </div>
        </div>

        {isWorking && (
          <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto max-w-xl rounded-[22px] border border-orange-100 bg-white/95 p-2.5 shadow-2xl shadow-orange-200/70 backdrop-blur sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <button onClick={checkOut} disabled={!onCheckOutSuccess || isCheckingOut} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
              {isCheckingOut ? <><Loader2 className="h-5 w-5 animate-spin" /> Đang xác nhận ra ca…</> : <><LogOut className="h-5 w-5" /> Xác nhận ra ca</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  const ready = Boolean(context && gps.status === 'MATCHED' && photoFile && !isSubmitting);

  return (
    <div className="min-h-full bg-[#fffaf6] pb-24 sm:pb-8">
      <header className="bg-gradient-to-br from-orange-500 via-[#ff5a1f] to-amber-400 px-4 pb-7 pt-4 text-white sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-100">PhoneHouse · Điểm danh</p>
              <h1 className="mt-1 text-2xl font-black">GPS & ảnh tại cửa hàng</h1>
              <p className="mt-1 text-sm font-medium text-orange-50">Chỉ cần ca hợp lệ, GPS và một ảnh chụp tại chỗ.</p>
            </div>
            {onClose && <button onClick={onClose} aria-label="Đóng" className="rounded-full bg-white/15 p-2.5 backdrop-blur"><X className="h-5 w-5" /></button>}
          </div>
          <div className="mt-5 flex items-end justify-between rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
            <div>
              <p className="text-xs font-bold text-orange-100">Giờ Việt Nam</p>
              <p className="font-mono text-3xl font-black tabular-nums">{formatVietnamClock(now)}</p>
            </div>
            <p className="max-w-[48%] text-right text-xs font-semibold capitalize text-orange-50">{formatVietnamDate(now)}</p>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2.5 backdrop-blur">
            <AttendanceStep label="1. Vào ca" value="Đang thực hiện" state="current" />
            <span className="text-lg font-black text-white/60">→</span>
            <AttendanceStep label="2. Ra ca" value="Sau giờ làm" state="upcoming" />
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-3 max-w-3xl space-y-3 px-3 sm:px-6">
        <section className="rounded-[24px] border border-orange-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-900"><CalendarDays className="h-5 w-5 text-orange-500" /> Ca làm hôm nay</div>
          {availableBranches.length > 1 && (
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold text-zinc-500">Chi nhánh làm việc</span>
              <select value={selectedBranchId} onChange={event => setSelectedBranchId(event.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-bold outline-none focus:border-orange-400">
                {availableBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          {isLoadingContext ? (
            <div className="flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra lịch trên server…</div>
          ) : contextError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <div className="flex gap-2 font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {contextError}</div>
              <button onClick={loadContext} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black shadow-sm"><RefreshCw className="h-3.5 w-3.5" /> Kiểm tra lại</button>
            </div>
          ) : context ? (
            <div className="grid grid-cols-2 gap-2">
              <InfoTile icon={Clock3} label={context.shift.shiftName} value={`${context.shift.startTime}–${context.shift.endTime}`} />
              <InfoTile icon={Building2} label={context.branch.name} value={`Bán kính ${context.branch.radiusMeters}m`} />
            </div>
          ) : null}
        </section>

        <section className={`rounded-[24px] border bg-white p-4 shadow-sm ${gps.status === 'MATCHED' ? 'border-emerald-200' : gps.status === 'OUTSIDE' || gps.status === 'ERROR' ? 'border-rose-200' : 'border-orange-100'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-zinc-900"><MapPin className="h-5 w-5 text-orange-500" /> Vị trí cửa hàng</div>
              <p className="mt-1 text-xs text-zinc-500">Bật GPS để đối chiếu khoảng cách với tọa độ chi nhánh.</p>
            </div>
            {gps.status === 'MATCHED' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700"><Check className="h-3.5 w-3.5" /> Hợp lệ</span>}
          </div>
          {gps.message && <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${gps.status === 'MATCHED' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{gps.message}</div>}
          {gps.latitude != null && gps.longitude != null && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-zinc-50 p-3"><span className="block text-zinc-400">Tọa độ hiện tại</span><b className="mt-1 block truncate text-zinc-800">{gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}</b></div>
              <div className="rounded-xl bg-zinc-50 p-3"><span className="block text-zinc-400">Độ chính xác</span><b className="mt-1 block text-zinc-800">±{gps.accuracyMeters || 0}m</b></div>
            </div>
          )}
          <button onClick={locate} disabled={!context || gps.status === 'LOADING'} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            {gps.status === 'LOADING' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            {gps.status === 'IDLE' ? 'Lấy vị trí hiện tại' : 'Đo lại vị trí'}
          </button>
        </section>

        <section className={`rounded-[24px] border bg-white p-4 shadow-sm ${photoFile ? 'border-emerald-200' : 'border-orange-100'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-zinc-900"><Camera className="h-5 w-5 text-orange-500" /> Ảnh chấm công</div>
              <p className="mt-1 text-xs text-zinc-500">Chụp ảnh trực tiếp tại cửa hàng. Ảnh được lưu làm bằng chứng của ca hôm nay.</p>
            </div>
            {photoFile && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700"><Check className="h-3.5 w-3.5" /> Đã chụp</span>}
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={selectPhoto} />
          {photoPreview ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
              <img src={photoPreview} alt="Ảnh chấm công vừa chụp" className="aspect-[4/3] w-full object-cover" />
              <div className="flex items-center justify-between bg-white px-3 py-2 text-xs"><span className="font-semibold text-zinc-600">Chụp lúc {photoTakenAt}</span><button onClick={() => inputRef.current?.click()} className="font-black text-orange-600">Chụp lại</button></div>
            </div>
          ) : (
            <button onClick={() => inputRef.current?.click()} className="mt-3 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/60 px-4 py-8 text-orange-700">
              <Camera className="mb-2 h-8 w-8" /><span className="text-sm font-black">Mở camera và chụp ảnh</span><span className="mt-1 text-xs text-orange-500">Tối đa 12 MB</span>
            </button>
          )}
        </section>

        {submitError && <div className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{submitError}</div>}

        <div className="rounded-2xl bg-white px-4 py-3 text-xs text-zinc-500 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-zinc-700"><ShieldCheck className="h-4 w-4 text-orange-500" /> Điều kiện chấm công</div>
          <p className="mt-1">Ca hợp lệ, GPS trong bán kính cửa hàng và một ảnh chụp tại thời điểm vào ca.</p>
        </div>

        {onNavigateToHR && <button onClick={onNavigateToHR} className="w-full py-2 text-xs font-bold text-zinc-500">Xem lịch ca & chấm công của tôi</button>}
      </main>

      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto max-w-3xl rounded-[22px] border border-orange-100 bg-white/95 p-2.5 shadow-2xl shadow-orange-200/70 backdrop-blur sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <button onClick={submit} disabled={!ready} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-300 disabled:shadow-none">
          {isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Đang lưu ảnh & chấm công…</> : <><CheckCircle2 className="h-5 w-5" /> Xác nhận vào ca</>}
        </button>
      </div>
    </div>
  );
};

function AttendanceStep({ label, value, state }: { label: string; value: string; state: 'done' | 'current' | 'upcoming' }) {
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2 ${state === 'current' ? 'bg-white text-zinc-950' : state === 'done' ? 'bg-emerald-500/25 text-white' : 'bg-black/10 text-white/65'}`}>
      <p className="truncate text-[11px] font-black uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 truncate text-xs font-bold ${state === 'current' ? 'text-orange-600' : ''}`}>{value}</p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="rounded-xl bg-zinc-50 p-3"><Icon className="mb-2 h-4 w-4 text-orange-500" /><p className="truncate text-xs font-black text-zinc-800">{label}</p><p className="mt-0.5 text-xs text-zinc-500">{value}</p></div>;
}

function ResultRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3"><div className="rounded-xl bg-white p-2 text-orange-500 shadow-sm"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-bold text-zinc-400">{label}</p><p className="text-sm font-black text-zinc-800">{value}</p></div></div>;
}
