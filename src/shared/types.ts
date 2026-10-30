export type AccountKind = 'work' | 'personal';

export const ACCOUNT_LIMITS: Record<AccountKind, number> = { work: 1, personal: 3 };

export const ACCOUNT_COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF'] as const;

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Claude Code config directory for this account (what CLAUDE_CONFIG_DIR points to). */
  configDir: string;
  color: string;
  createdAt: number;
}

export type AccountInput = Pick<Account, 'name' | 'kind' | 'configDir'> & { color?: string };

/** One rate-limit window as Claude Code reports it to the status line. */
export interface RawWindow {
  used_percentage?: number;
  /** Unix epoch seconds. */
  resets_at?: number;
}

/** What the status line bridge writes to `<configDir>/.usage-widget/snapshot.json`. */
export interface Snapshot {
  version: 1;
  /** Unix epoch milliseconds. */
  capturedAt: number;
  model?: string;
  rate_limits?: {
    five_hour?: RawWindow;
    seven_day?: RawWindow;
  };
}

export interface UsageWindow {
  /** 0–100, or null when unknown. */
  percent: number | null;
  /** Unix epoch milliseconds, or null when unknown. */
  resetsAt: number | null;
  /** True when the reported reset time has passed, so the window has restarted at 0%. */
  hasReset: boolean;
}

export type BridgeStatus = 'installed' | 'missing' | 'no-config-dir' | 'invalid-settings';

export interface AccountView {
  account: Account;
  bridge: BridgeStatus;
  capturedAt: number | null;
  model: string | null;
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  /** Tokens counted from this account's local transcripts in the current windows. */
  tokens: { fiveHour: number; sevenDay: number } | null;
  /** True when a snapshot exists but Claude Code did not report rate limits (API key / non-subscriber). */
  noRateLimits: boolean;
}

export type Platform = 'mac' | 'win' | 'linux';

export interface WidgetSettings {
  alwaysOnTop: boolean;
  openAtLogin: boolean;
}

export interface WidgetState {
  platform: Platform;
  accounts: AccountView[];
  settings: WidgetSettings;
  demo: boolean;
}

export interface WidgetApi {
  getState(): Promise<WidgetState>;
  onState(cb: (state: WidgetState) => void): () => void;
  addAccount(input: AccountInput): Promise<Result>;
  updateAccount(id: string, patch: Partial<AccountInput>): Promise<Result>;
  removeAccount(id: string): Promise<Result>;
  installBridge(id: string): Promise<Result>;
  uninstallBridge(id: string): Promise<Result>;
  pickDirectory(): Promise<string | null>;
  defaultConfigDir(kind: AccountKind): Promise<string>;
  copyText(text: string): Promise<void>;
  setSettings(patch: Partial<WidgetSettings>): Promise<void>;
  resize(height: number): void;
  hide(): void;
}

export type Result = { ok: true } | { ok: false; error: string };
