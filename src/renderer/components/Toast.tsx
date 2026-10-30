import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { Result } from '../../shared/types';

interface ToastApi {
  show(text: string, error?: boolean): void;
  /** Shows `success` or the error from a main-process call; returns whether it succeeded. */
  report(promise: Promise<Result>, success: string): Promise<boolean>;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; error: boolean; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string, error = false) => {
    window.clearTimeout(timer.current);
    setToast({ text, error, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const report = useCallback(
    async (promise: Promise<Result>, success: string) => {
      const res = await promise;
      if (res.ok) show(success);
      else show(res.error, true);
      return res.ok;
    },
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, report }}>
      {children}
      {toast && (
        <div key={toast.key} className={`toast ${toast.error ? 'error' : ''}`}>
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}
