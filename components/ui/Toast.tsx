'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: ReactNode;
  variant: ToastVariant;
  /** false until the first paint so the enter transition has a start state;
   *  flips back to false on dismiss so the exit transition plays. */
  shown: boolean;
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

// Exit is shorter than enter: the system responds fast, the user reads slow.
const EXIT_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  // Per-toast auto-dismiss: deadline + remaining so we can pause while the tab is hidden.
  const timers = useRef<Map<number, { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t?.handle) clearTimeout(t.handle);
    timers.current.delete(id);
    // Drop `shown` → exit transition plays, then unmount.
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, shown: false } : x)));
    setTimeout(() => remove(id), EXIT_MS);
  }, [remove]);

  const arm = useCallback((id: number, ms: number) => {
    const handle = setTimeout(() => dismiss(id), ms);
    timers.current.set(id, { handle, remaining: ms, startedAt: Date.now() });
  }, [dismiss]);

  const show = useCallback<ToastContextValue['show']>((message, opts) => {
    const id = ++idRef.current;
    const variant = opts?.variant ?? 'info';
    const duration = opts?.duration ?? 4000;
    setToasts((prev) => [...prev, { id, message, variant, shown: false }]);
    // Two frames later: flip to shown so the transition runs from a painted starting style.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, shown: true } : x)));
    }));
    if (duration > 0) arm(id, duration);
    return id;
  }, [arm]);

  // Pause the countdown while the tab is hidden — a toast nobody saw shouldn't expire.
  useEffect(() => {
    const map = timers.current;
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      map.forEach((t, id) => {
        if (hidden) {
          if (t.handle) clearTimeout(t.handle);
          t.handle = null;
          t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
        } else if (!t.handle) {
          t.startedAt = Date.now();
          t.handle = setTimeout(() => dismiss(id), t.remaining);
        }
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      map.forEach((t) => { if (t.handle) clearTimeout(t.handle); });
      map.clear();
    };
  }, [dismiss]);

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
                // Transitions, not keyframes: toasts stack fast and must retarget mid-motion.
                'transition-[opacity,transform] ease-brand',
                t.shown ? 'opacity-100 translate-y-0 duration-slow' : 'opacity-0 translate-y-full duration-[180ms]',
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
                className="shrink-0 opacity-60 hover:opacity-100 active:scale-[0.9] transition-[opacity,transform] duration-fast ease-brand"
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
