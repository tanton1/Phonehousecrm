import React from 'react';

interface InventoryMetricCarouselProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

/**
 * Keeps inventory summaries readable on a phone without squeezing four small
 * tiles into a grid. Desktop still shows several cards at once; mobile users
 * can swipe through the same short set of indicators.
 */
export const InventoryMetricCarousel: React.FC<InventoryMetricCarouselProps> = ({
  children,
  className = '',
  label = 'Chỉ số kho, vuốt để xem thêm'
}) => {
  return (
    <section aria-label={label} className={className}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {React.Children.toArray(children).map((child, index) => (
          <div
            key={index}
            className="min-w-[78vw] snap-start sm:min-w-[230px] lg:min-w-[calc(25%-0.75rem)] lg:flex-1"
          >
            {child}
          </div>
        ))}
      </div>
      <p className="px-1 text-[10px] font-medium text-zinc-400 sm:hidden">Vuốt sang để xem thêm chỉ số</p>
    </section>
  );
};
