interface UsageBarProps {
  /** 0–100, or null when unknown (draws an empty track). */
  percent: number | null;
  color: string;
}

/** Horizontal progress bar for one usage window. */
export function UsageBar({ percent, color }: UsageBarProps) {
  const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="usage-bar" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="usage-bar-fill" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}
