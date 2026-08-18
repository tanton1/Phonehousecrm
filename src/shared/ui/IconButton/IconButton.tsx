import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export type IconButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isLoading?: boolean;
  'aria-label': string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-11 h-11 rounded-2xl'
  };

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[#ff4b16] to-[#e94112] text-white hover:brightness-105 active:scale-95 shadow-sm shadow-[#ff4b16]/20',
    secondary:
      'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95',
    outline:
      'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 active:scale-95 shadow-2xs',
    danger:
      'bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95',
    ghost:
      'bg-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 active:scale-95'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : icon}
    </button>
  );
};
