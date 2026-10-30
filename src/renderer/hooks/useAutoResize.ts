import { useLayoutEffect, type RefObject } from 'react';
import { api } from '../lib/api';

/** Keeps the native window exactly as tall as the widget content. */
export function useAutoResize(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => api.resize(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
