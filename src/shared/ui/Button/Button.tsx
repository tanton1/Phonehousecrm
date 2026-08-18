import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  // Height & Padding Standards: sm (36px), md (40px), lg (44px)
  const sizeClasses = {
    sm: 'h-9 px-3 text-xs rounded-xl gap-1.5',
    md: 'h-10 px-4 text-sm rounded-xl gap-2',
    lg: 'h-11 px-5 text-base rounded-2xl gap-2.5'
  };

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[#ff4b16] to-[#e94112] text-white hover:brightness-105 active:scale-[0.98] shadow-sm shadow-[#ff4b16]/20 font-bold',
    secondary:
      'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 active:scale-[0.98] font-semibold',
    outline:
      'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.98] font-semibold shadow-2xs',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] font-bold shadow-sm shadow-rose-600/20',
    ghost:
      'bg-transparent text-zinc-600 hover:bg-zinc-100 active:scale-[0.98] font-semibold'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-sans select-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};
