import React, { HTMLAttributes } from 'react';

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 rounded-md font-bold gap-1',
    md: 'text-xs px-2.5 py-1 rounded-lg font-semibold gap-1.5'
  };

  const variantClasses: Record<BadgeVariant, { badge: string; dot: string }> = {
    brand: {
      badge: 'bg-orange-50 text-[#ff4b16] border border-orange-200/80',
      dot: 'bg-[#ff4b16]'
    },
    success: {
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
      dot: 'bg-emerald-500'
    },
    warning: {
      badge: 'bg-amber-50 text-amber-700 border border-amber-200/80',
      dot: 'bg-amber-500'
    },
    danger: {
      badge: 'bg-rose-50 text-rose-700 border border-rose-200/80',
      dot: 'bg-rose-500'
    },
    info: {
      badge: 'bg-blue-50 text-blue-700 border border-blue-200/80',
      dot: 'bg-blue-500'
    },
    neutral: {
      badge: 'bg-zinc-100 text-zinc-700 border border-zinc-200/80',
      dot: 'bg-zinc-400'
    }
  };

  return (
    <span
      className={`inline-flex items-center select-none font-mono ${sizeClasses[size]} ${variantClasses[variant].badge} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${variantClasses[variant].dot}`}
        />
      )}
      <span>{children}</span>
    </span>
  );
};
