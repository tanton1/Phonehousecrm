import React from 'react';
import { AlertTriangle, Clock3, RefreshCw, Users } from 'lucide-react';

interface CRMDispatchViewProps {
  data: any;
  loading?: boolean;
  onRefresh: () => void;
  onSelectStaff?: (staffId: string) => void;
}

export const CRMDispatchView: React.FC<CRMDispatchViewProps> = ({ data, loading, onRefresh, onSelectStaff }) => {
  const staff = data?.staff || [];
  return <div className="space-y-4">
    <div className="flex items-center justify-between rounded-3xl bg-zinc-950 p-4 text-white">
      <div><div className="text-xs font-black uppercase tracking-wider text-orange-300">Điều phối theo ca & tải việc</div><div className="mt-1 text-lg font-black">{data?.summary?.openTasks || 0} việc đang mở · {data?.summary?.overdueTasks || 0} quá hạn</div></div>
      <button type="button" onClick={onRefresh} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {staff.map((item: any) => <button key={item.id} type="button" onClick={() => onSelectStaff?.(item.id)} className="rounded-3xl border border-zinc-200/80 bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-100 font-black text-orange-700">{String(item.name || '?').charAt(0)}</div><div className="min-w-0"><div className="truncate font-black text-zinc-950">{item.name}</div><div className="mt-0.5 text-[11px] font-bold text-zinc-500">{item.department === 'CUSTOMER_CARE' ? 'CSKH' : 'NVBH'} · {item.shiftName}</div></div></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.inShift ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{item.inShift ? 'Trong ca' : 'Ngoài ca'}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-zinc-50 p-2"><Users className="mx-auto h-4 w-4 text-zinc-400" /><div className="mt-1 font-black">{item.openTasks}</div><div className="text-[9px] font-bold text-zinc-500">Đang mở</div></div>
          <div className="rounded-2xl bg-rose-50 p-2"><AlertTriangle className="mx-auto h-4 w-4 text-rose-500" /><div className="mt-1 font-black text-rose-700">{item.overdueTasks}</div><div className="text-[9px] font-bold text-rose-600">Quá hạn</div></div>
          <div className="rounded-2xl bg-orange-50 p-2"><Clock3 className="mx-auto h-4 w-4 text-orange-500" /><div className="mt-1 font-black text-orange-700">{item.p0Tasks}</div><div className="text-[9px] font-bold text-orange-600">Khẩn cấp</div></div>
        </div>
      </button>)}
    </div>
    {!loading && !staff.length && <div className="rounded-3xl bg-white p-12 text-center text-sm font-bold text-zinc-500">Chưa có NVBH/CSKH phù hợp trong chi nhánh.</div>}
  </div>;
};

