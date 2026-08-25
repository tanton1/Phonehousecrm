import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface HRMetricItem {
  id: string;
  label: string;
  value: React.ReactNode;
  note?: string;
  icon: LucideIcon;
  gradient?: string;
}

interface HRMetricCarouselProps {
  items: HRMetricItem[];
  className?: string;
}

export const HRMetricCarousel: React.FC<HRMetricCarouselProps> = ({ items, className = '' }) => (
  <div
    className={`-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 ${className}`}
    aria-label="Tóm tắt nhân sự"
  >
    {items.slice(0, 4).map((item) => {
      const Icon = item.icon;
      return (
        <article
          key={item.id}
          className="relative min-w-[74%] snap-start overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm shadow-zinc-100/70 sm:min-w-[230px] sm:p-4 lg:min-w-0"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 to-amber-400" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500 sm:text-[11px]">{item.label}</div>
              <div className="mt-1 truncate text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">{item.value}</div>
              {item.note && <div className="mt-1 line-clamp-1 text-[10px] font-semibold text-zinc-500 sm:text-xs">{item.note}</div>}
            </div>
            <div className="shrink-0 text-amber-500">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </article>
      );
    })}
  </div>
);

export default HRMetricCarousel;
