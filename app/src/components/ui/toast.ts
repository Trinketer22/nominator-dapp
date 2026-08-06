import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'error' | 'warn' | 'info' | 'pending';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: ReactNode;
}

export interface ToastApi {
  error: (message: ReactNode) => void;
  warn: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
  pending: (message: ReactNode) => number;
  update: (id: number, message: ReactNode) => void;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
