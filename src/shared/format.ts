import type { RawWindow, UsageWindow } from './types';

/** Turns a raw status-line window into what the UI shows, accounting for resets that already happened. */
export function toUsageWindow(raw: RawWindow | undefined, now: number): UsageWindow {
  const resetsAt = typeof raw?.resets_at === 'number' ? raw.resets_at * 1000 : null;
  const pct = typeof raw?.used_percentage === 'number' ? clamp(raw.used_percentage, 0, 100) : null;
  if (resetsAt !== null && resetsAt <= now) {
    return { percent: pct === null ? null : 0, resetsAt: null, hasReset: true };
  }
  return { percent: pct, resetsAt, hasReset: false };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** "2시간 14분", "3일 4시간", "45초" */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '곧';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

/** "방금", "3분 전", "2시간 전", "어제" */
export function formatAgo(ms: number): string {
  if (ms < 60_000) return '방금';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

/** 1234 → "1.2K", 3_400_000 → "3.4M" */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}K`;
  if (n < 1_000_000_000) return `${trim(n / 1_000_000)}M`;
  return `${trim(n / 1_000_000_000)}B`;
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');
}
