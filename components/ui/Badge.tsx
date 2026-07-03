'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'navy' | 'steel' | 'solid' | 'outline' | 'aqua';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

const variants: Record<BadgeVariant, string> = {
  navy: 'bg-navy-100 text-navy-800',
  steel: 'bg-steel-100 text-steel-700',
  solid: 'bg-primary text-white',
  outline: 'bg-transparent text-primary shadow-[inset_0_0_0_1px_var(--ft-navy-300)]',
  aqua: 'bg-azure-100 text-azure-600',
};

const sizes: Record<BadgeSize, string> = {
  sm: 'text-3xs px-[7px] py-[2px]',
  md: 'text-2xs px-[9px] py-[3px]',
};

/** Badge — compact label for categories, counts, technical tags. Square-ish. */
export function Badge({ variant = 'navy', size = 'md', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-[5px] font-semibold leading-[1.4] rounded-sm whitespace-nowrap', sizes[size], variants[variant], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
