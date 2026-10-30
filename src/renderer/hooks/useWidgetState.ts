import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { WidgetState } from '../../shared/types';

/** Latest state from the main process; it pushes a new one whenever anything changes. */
export function useWidgetState(): WidgetState | null {
  const [state, setState] = useState<WidgetState | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getState().then((s) => alive && setState(s));
    const off = api.onState(setState);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

/** Current time, re-rendering every `intervalMs` (drives countdowns and "n분 전"). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
