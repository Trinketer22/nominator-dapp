import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { ToastContext, type Toast, type ToastKind } from './toast';

const AUTO_DISMISS_MS = 6000;
// Cap the number of visible toasts so a burst of notifications can't stack
// up and blanket the bottom of the viewport on small screens. The newest
// ones win; older ones are dropped.
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: ReactNode, autoDismiss = true) => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next = [...prev, { id, kind, message }];
        return next.length > MAX_VISIBLE
          ? next.slice(next.length - MAX_VISIBLE)
          : next;
      });
      if (autoDismiss) window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      return id;
    },
    [dismiss],
  );

  const update = useCallback((id: number, message: ReactNode) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message } : t)));
  }, []);

  const api = useMemo(
    () => ({
      error: (m: ReactNode) => push('error', m, false),
      warn: (m: ReactNode) => push('warn', m),
      info: (m: ReactNode) => push('info', m),
      pending: (m: ReactNode) => push('pending', m, false),
      update,
      dismiss,
    }),
    [push, update, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className={
          'fixed z-[100] flex flex-col gap-2 w-full max-w-sm ' +
          // Anchored to the top, below the sticky header, on all viewports.
          // Desktop: top-[68px] clears the 60px header. Small screens: the
          // header is taller (h-auto + py-3) and the testnet banner adds
          // ~32px, so we push down to clear both without overlapping.
          // max-h + overflow-y-auto bounds a toast burst.
          'top-[68px] right-4 max-h-[40vh] overflow-y-auto ' +
          'max-sm:top-[100px] max-sm:left-1/2 max-sm:-translate-x-1/2 ' +
          'max-sm:right-auto max-sm:w-[calc(100%-2rem)]'
        }
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'rounded-md border p-3 text-[13px] shadow-sm flex items-start gap-2 break-words',
              t.kind === 'error'
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : t.kind === 'warn'
                  ? 'border-warning/50 bg-warning/10 text-warning'
                  : t.kind === 'pending'
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-background text-foreground',
            )}
          >
            {t.kind === 'pending' && (
              <span
                className="shrink-0 size-[14px] rounded-full border-2 border-current border-r-transparent animate-spin self-center"
                aria-hidden
              />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-current/70 hover:text-current text-[16px] leading-none"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
