import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface HRMetricItem {
  id: string;
  label: string;
  value: React.ReactNode;
  note?: string;
  icon: LucideIcon;
  gradient: string;
}

interface HRMetricCarouselProps {
  items: HRMetricItem[];
  className?: string;
}

export const HRMetricCarousel: React.FC<HRMetricCarouselProps> = ({ items, className = '' }) => (
  <div
    className={`-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    aria-label="Các chỉ số nhân sự"
  >
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <article
          key={item.id}
          className={`min-w-[78%] snap-start overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-md sm:min-w-[250px] lg:min-w-[270px] ${item.gradient}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/75">{item.label}</div>
              <div className="mt-2 truncate text-2xl font-black tracking-tight">{item.value}</div>
              {item.note && <div className="mt-1 truncate text-xs font-semibold text-white/75">{item.note}</div>}
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </article>
      );
    })}
  </div>
);

export default HRMetricCarousel;
