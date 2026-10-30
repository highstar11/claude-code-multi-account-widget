import type { AccountKind, AccountView } from '../shared/types';

const H = 3_600_000;
const D = 24 * H;

interface Sample {
  id: string;
  name: string;
  kind: AccountKind;
  color: string;
  five: number;
  fiveLeft: number;
  seven: number;
  sevenLeft: number;
  ago: number;
}

const SAMPLES: Sample[] = [
  { id: 'work', name: '회사 · Team', kind: 'work', color: '#0A84FF', five: 62, fiveLeft: 2.3 * H, seven: 48, sevenLeft: 3.2 * D, ago: 40_000 },
  { id: 'me', name: '개인 · Max', kind: 'personal', color: '#30D158', five: 18, fiveLeft: 4.1 * H, seven: 71, sevenLeft: 1.6 * D, ago: 6 * 60_000 },
  { id: 'side', name: '사이드 프로젝트', kind: 'personal', color: '#FF9F0A', five: 93, fiveLeft: 0.4 * H, seven: 86, sevenLeft: 5.5 * D, ago: 2 * H },
];

/** Sample data for `--demo` (screenshots, trying the UI without any account). */
export function demoAccounts(now: number): AccountView[] {
  return SAMPLES.map((s) => ({
    account: { id: s.id, name: s.name, kind: s.kind, color: s.color, configDir: `~/.claude-${s.id}`, createdAt: 0 },
    bridge: 'installed',
    capturedAt: now - s.ago,
    model: 'Opus 5.5',
    fiveHour: { percent: s.five, resetsAt: now + s.fiveLeft, hasReset: false },
    sevenDay: { percent: s.seven, resetsAt: now + s.sevenLeft, hasReset: false },
    tokens: { fiveHour: Math.round(s.five * 41_000), sevenDay: Math.round(s.seven * 520_000) },
    noRateLimits: false,
  }));
}
