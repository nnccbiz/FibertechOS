'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width of the dialog card. Defaults to 'md' (32rem). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Disable closing on backdrop click / Escape. */
  disableClose?: boolean;
  className?: string;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/** Modal — fixed-inset overlay with a centered card. RTL-aware, Escape + backdrop close. */
export function Modal({ open, onClose, title, children, footer, size = 'md', disableClose = false, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, disableClose, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !disableClose) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn('w-full bg-surface-card rounded-lg shadow-lg max-h-[90vh] overflow-hidden flex flex-col', sizes[size], className)}
      >
        {(title || !disableClose) && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line-subtle shrink-0">
            <h2 className="text-lg font-bold text-content-strong m-0">{title}</h2>
            {!disableClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-content-muted hover:bg-neutral-100 hover:text-content-strong transition-colors duration-fast ease-brand"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line-subtle shrink-0 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
