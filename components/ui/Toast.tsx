'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: ReactNode;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: ReactNode, opts?: { variant?: ToastVariant; duration?: number }) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** useToast().show('נשמר בהצלחה', { variant: 'success' }) */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const variantStyles: Record<ToastVariant, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-success-soft text-success border-success', dot: 'bg-success' },
  warning: { wrap: 'bg-warning-soft text-warning border-warning', dot: 'bg-warning' },
  danger: { wrap: 'bg-danger-soft text-danger border-danger', dot: 'bg-danger' },
  info: { wrap: 'bg-azure-100 text-azure-600 border-azure', dot: 'bg-azure' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue['show']>((message, opts) => {
    const id = ++idRef.current;
    const variant = opts?.variant ?? 'info';
    const duration = opts?.duration ?? 4000;
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => {
          const s = variantStyles[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2.5 min-w-[240px] max-w-[90vw] px-4 py-3 rounded-md border shadow-md text-sm font-medium',
                'animate-fade-in-up',
                s.wrap,
              )}
              role="status"
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="סגור"
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
