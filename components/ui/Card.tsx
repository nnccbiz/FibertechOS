'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type CardVariant = 'default' | 'sunken' | 'navy' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Adds a navy top rule. */
  accent?: boolean;
}

const variants: Record<CardVariant, string> = {
  default: 'bg-surface-card border border-line-subtle shadow-sm text-content-body',
  sunken: 'bg-surface-sunken border border-line-subtle text-content-body',
  navy: 'bg-primary border border-primary shadow-navy text-white',
  outline: 'bg-transparent border border-line-strong text-content-body',
};

const paddings: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/** Card — surface container. Default white with subtle border + shadow. */
export function Card({ variant = 'default', padding = 'md', accent = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-lg overflow-hidden', variants[variant], paddings[padding], accent && 'border-t-[3px] border-t-primary', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
