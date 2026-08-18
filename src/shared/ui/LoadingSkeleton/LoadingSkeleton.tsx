import React, { HTMLAttributes } from 'react';

export interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'rect',
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const variantClasses = {
    text: 'h-4 rounded-md',
    rect: 'rounded-xl',
    circle: 'rounded-full'
  };

  const inlineStyles: React.CSSProperties = {
    width: width ?? (variant === 'circle' ? '40px' : '100%'),
    height: height ?? (variant === 'circle' ? '40px' : variant === 'text' ? '16px' : '80px'),
    ...style
  };

  return (
    <div
      className={`animate-pulse bg-zinc-200/70 ${variantClasses[variant]} ${className}`}
      style={inlineStyles}
      {...props}
    />
  );
};
