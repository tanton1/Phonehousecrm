import React from 'react';
import { ArrowRight, ClipboardPlus, Wrench } from 'lucide-react';

interface RepairIntakeHubProps {
  onOpenIntake: () => void;
  onOpenTechDesk: () => void;
}

/** Entry only. All active repair work is intentionally kept in TechDesk's canonical Kanban. */
export const RepairIntakeHub: React.FC<RepairIntakeHubProps> = ({ onOpenIntake, onOpenTechDesk }) => (
  <div className="mx-auto max-w-3xl space-y-4">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-800 p-5 text-white shadow-xl sm:p-7">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-500"><Wrench className="h-6 w-6" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">Sửa chữa & bảo hành</p><h1 className="mt-1 text-2xl font-black">Tiếp nhận máy</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-200">Tạo phiếu, ghi nhận tình trạng và ảnh. Sau đó máy đi thẳng vào Kanban Kỹ thuật & KCS — không có Kanban thứ hai.</p></div></div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row"><button onClick={onOpenIntake} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-400"><ClipboardPlus className="h-4 w-4" />Tiếp nhận máy mới</button><button onClick={onOpenTechDesk} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">Mở Kanban Kỹ thuật & KCS <ArrowRight className="h-4 w-4" /></button></div>
    </section>
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><p className="font-black">Luồng duy nhất</p><p className="mt-1 leading-6">Tiếp nhận → KTV quét nhận → xử lý task & linh kiện → KCS → trả máy và thu tiền. Phiếu sửa cũ đã không còn hiển thị trên ứng dụng.</p></section>
  </div>
);
