import React, { HTMLAttributes } from 'react';

export type CardVariant = 'default' | 'flat' | 'elevated' | 'outlined';
export type CardRadius = 12 | 16 | 20;
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  radius?: CardRadius;
  padding?: CardPadding;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  radius = 16,
  padding = 'md',
  hoverable = false,
  className = '',
  ...props
}) => {
  const radiusClasses: Record<CardRadius, string> = {
    12: 'rounded-xl',
    16: 'rounded-2xl',
    20: 'rounded-3xl'
  };

  const paddingClasses: Record<CardPadding, string> = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7'
  };

  const variantClasses: Record<CardVariant, string> = {
    default: 'bg-white border border-zinc-200/80 shadow-2xs',
    flat: 'bg-zinc-100/80 border border-transparent',
    elevated: 'bg-white border border-zinc-100 shadow-md shadow-zinc-200/50',
    outlined: 'bg-white border border-zinc-300'
  };

  const hoverClass = hoverable
    ? 'transition-all hover:shadow-md hover:border-zinc-300 active:scale-[0.99]'
    : '';

  return (
    <div
      className={`${radiusClasses[radius]} ${paddingClasses[padding]} ${variantClasses[variant]} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
