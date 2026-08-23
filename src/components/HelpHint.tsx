import React, { useState } from 'react';

interface HelpHintProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

/** A compact help affordance for mobile-first operational screens. */
export const HelpHint: React.FC<HelpHintProps> = ({ title, children, className = '' }) => {
  const [open, setOpen] = useState(false);

  return <>
    <button
      type="button"
      aria-label={`Xem hướng dẫn: ${title}`}
      title={`Xem hướng dẫn: ${title}`}
      onClick={() => setOpen(true)}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-[11px] font-black text-zinc-600 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 ${className}`}
    >
      ?
    </button>
    {open && <div className="fixed inset-0 z-[220] grid place-items-end bg-black/45 p-3 backdrop-blur-sm sm:place-items-center" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-wide text-orange-600">Hướng dẫn</p><h3 className="mt-1 text-base font-black text-zinc-950">{title}</h3></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-700">Đóng</button>
        </div>
        <div className="mt-4 text-sm leading-6 text-zinc-700">{children}</div>
      </section>
    </div>}
  </>;
};
