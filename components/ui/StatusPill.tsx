'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type StatusKind = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status?: StatusKind;
  children: ReactNode;
}

const map: Record<StatusKind, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-success-soft text-success', dot: 'bg-success' },
  warning: { wrap: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  danger: { wrap: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  info: { wrap: 'bg-azure-100 text-azure-600', dot: 'bg-azure' },
  neutral: { wrap: 'bg-neutral-100 text-neutral-700', dot: 'bg-neutral-400' },
};

/** StatusPill — pill capsule with a leading dot for states. */
export function StatusPill({ status = 'info', className, children, ...rest }: StatusPillProps) {
  const c = map[status];
  return (
    <span
      className={cn('inline-flex items-center gap-[7px] text-2xs font-semibold leading-[1.4] px-3 py-1 rounded-pill whitespace-nowrap', c.wrap, className)}
      {...rest}
    >
      <span className={cn('w-[7px] h-[7px] rounded-full shrink-0', c.dot)} />
      {children}
    </span>
  );
}
