import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, X } from 'lucide-react';
import { DateFilterPreset, DateFilterValue } from '../../utils/dateRangeFilter';

interface DateRangeFilterProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  className?: string;
}

const PRESETS: Array<{ id: DateFilterPreset; label: string; buttonLabel: string }> = [
  { id: 'all', label: 'Tất cả thời gian', buttonLabel: 'Tất cả ngày' },
  { id: 'today', label: 'Hôm nay', buttonLabel: 'Hôm nay' },
  { id: 'this_week', label: 'Tuần này', buttonLabel: 'Tuần này' },
  { id: 'this_month', label: 'Tháng này', buttonLabel: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước', buttonLabel: 'Tháng trước' },
  { id: 'custom', label: 'Chọn khoảng ngày', buttonLabel: 'Tùy chỉnh' }
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const activePreset = PRESETS.find(option => option.id === value.preset) || PRESETS[0];

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  const selectPreset = (preset: DateFilterPreset) => {
    onChange({ ...value, preset });
    if (preset !== 'custom') setIsOpen(false);
  };

  const updateFrom = (from: string) => {
    const to = value.to && from > value.to ? from : value.to;
    onChange({ preset: 'custom', from, to });
  };

  const updateTo = (to: string) => {
    const from = value.from && to < value.from ? to : value.from;
    onChange({ preset: 'custom', from, to });
  };

  const picker = isOpen && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[180] flex items-end bg-black/45 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4" onClick={() => setIsOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Chọn thời gian" onClick={event => event.stopPropagation()} className="w-full rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <p className="text-sm font-black text-zinc-900">Lọc theo thời gian</p>
            <p className="mt-0.5 text-[10px] font-medium text-zinc-400">Danh sách và số liệu dùng cùng khoảng ngày</p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl bg-zinc-100 p-2 text-zinc-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {PRESETS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => selectPreset(option.id)}
              className={`flex h-11 items-center justify-between rounded-xl border px-3 text-left text-xs font-bold transition ${value.preset === option.id ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-700 hover:border-orange-200'}`}
            >
              {option.label}
              {value.preset === option.id && <Check className="h-4 w-4 text-orange-500" />}
            </button>
          ))}
        </div>

        {value.preset === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-3">
            <label className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
              Từ ngày
              <input type="date" value={value.from} onChange={event => updateFrom(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400" />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
              Đến ngày
              <input type="date" value={value.to} onChange={event => updateTo(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400" />
            </label>
          </div>
        )}

        <button type="button" onClick={() => setIsOpen(false)} className="mt-3 h-11 w-full rounded-xl bg-zinc-950 text-xs font-black text-white">Áp dụng</button>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`shrink-0 ${className}`}>
      <button
        type="button"
        aria-label={`Lọc ngày: ${activePreset.buttonLabel}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold transition ${value.preset === 'all' ? 'border-zinc-200 bg-white text-zinc-600 hover:border-orange-300' : 'border-orange-300 bg-orange-50 text-orange-700 shadow-sm'}`}
      >
        <CalendarDays className="h-3.5 w-3.5 text-orange-500" />
        <span>{activePreset.buttonLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {picker}
    </div>
  );
};
