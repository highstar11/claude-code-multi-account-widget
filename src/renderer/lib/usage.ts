import type { Account, AccountKind, Platform } from '../../shared/types';

export const KIND_LABEL: Record<AccountKind, string> = { work: '업무', personal: '개인' };

/** Usage thresholds that switch a ring to a warning color. */
export const WARN_AT = 75;
export const DANGER_AT = 90;

/** The color a ring or dot should use for this percentage. */
export function levelColor(percent: number | null, base: string): string {
  if (percent === null) return base;
  if (percent >= DANGER_AT) return 'var(--red)';
  if (percent >= WARN_AT) return 'var(--orange)';
  return base;
}

/** The weekly (inner) ring uses a lighter tint of the account color, like Activity rings. */
export function innerTint(color: string): string {
  return `color-mix(in srgb, ${color} 55%, white)`;
}

/** The shell command that starts Claude Code with this account. */
export function launchCommand(account: Account, platform: Platform): string {
  if (/[\\/]\.claude$/.test(account.configDir)) return 'claude';
  if (platform === 'win') return `$env:CLAUDE_CONFIG_DIR="${account.configDir}"; claude`;
  return `CLAUDE_CONFIG_DIR="${account.configDir}" claude`;
}
