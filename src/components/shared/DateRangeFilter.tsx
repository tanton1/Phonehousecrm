import React from 'react';
import { CalendarDays } from 'lucide-react';
import { DateFilterPreset, DateFilterValue } from '../../utils/dateRangeFilter';

interface DateRangeFilterProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  className?: string;
}

const PRESETS: Array<{ id: DateFilterPreset; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'this_week', label: 'Tuần này' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'custom', label: 'Tùy chỉnh' }
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange, className = '' }) => {
  const updateFrom = (from: string) => {
    const to = value.to && from > value.to ? from : value.to;
    onChange({ preset: 'custom', from, to });
  };

  const updateTo = (to: string) => {
    const from = value.from && to < value.from ? to : value.from;
    onChange({ preset: 'custom', from, to });
  };

  return (
    <section aria-label="Lọc theo ngày" className={className}>
      <div className="flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto scroll-smooth px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-zinc-900 px-2.5 text-[10px] font-black uppercase tracking-wide text-white">
          <CalendarDays className="h-3.5 w-3.5 text-orange-400" /> Ngày
        </span>
        {PRESETS.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value.preset === option.id}
            onClick={() => onChange({ ...value, preset: option.id })}
            className={`h-8 shrink-0 snap-start rounded-full border px-3 text-[11px] font-bold transition ${
              value.preset === option.id
                ? 'border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-200'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2">
          <label className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
            Từ ngày
            <input type="date" value={value.from} onChange={event => updateFrom(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400" />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
            Đến ngày
            <input type="date" value={value.to} onChange={event => updateTo(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400" />
          </label>
        </div>
      )}
    </section>
  );
};
