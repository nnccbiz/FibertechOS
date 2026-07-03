'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Field — label + control wrapper with optional hint and error. */
export function Field({ label, htmlFor, hint, error, required = false, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-content-strong">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-2xs text-content-muted">{hint}</span>
      ) : null}
    </div>
  );
}
