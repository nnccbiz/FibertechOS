'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const base =
  'inline-flex items-center justify-center font-semibold leading-none rounded-md whitespace-nowrap select-none ' +
  'transition-[background-color,transform,box-shadow] duration-fast ease-brand ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const sizes: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-[14px] py-[7px] text-sm min-h-[34px]',
  md: 'gap-2 px-5 py-2.5 text-base min-h-[42px]',
  lg: 'gap-2.5 px-7 py-[13px] text-md min-h-[50px]',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white border border-primary hover:bg-primary-700 hover:shadow-sm active:bg-primary-800 active:translate-y-px',
  secondary:
    'bg-white text-primary border border-primary hover:bg-primary-50 active:translate-y-px',
  ghost:
    'bg-transparent text-primary border border-transparent hover:bg-primary-50 active:translate-y-px',
  danger:
    'bg-danger text-white border border-danger hover:bg-danger-hover hover:shadow-sm active:translate-y-px',
};

/** Fibertech primary action button — navy-filled by default. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, iconLeft, iconRight, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'flex w-full', className)}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
