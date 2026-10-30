interface RingProps {
  radius: number;
  width: number;
  percent: number | null;
  color: string;
}

function Ring({ radius, width, percent, color }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const common = { r: radius, cx: 32, cy: 32, fill: 'none', strokeWidth: width, style: { stroke: color } };
  return (
    <>
      <circle {...common} strokeOpacity={0.18} />
      {p > 0 && (
        <circle
          {...common}
          className="ring-fill"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * circumference} ${circumference}`}
          transform="rotate(-90 32 32)"
        />
      )}
    </>
  );
}

interface UsageRingsProps {
  /** Outer ring: current 5-hour session. */
  outer: { percent: number | null; color: string };
  /** Inner ring: weekly limit. */
  inner: { percent: number | null; color: string };
  size?: number;
}

/** Two concentric Activity-style rings. */
export function UsageRings({ outer, inner, size = 68 }: UsageRingsProps) {
  return (
    <svg className="rings" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <Ring radius={27} width={8} {...outer} />
      <Ring radius={16.5} width={8} {...inner} />
    </svg>
  );
}
