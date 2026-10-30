import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './accounts';
import type { BridgeStatus } from '../shared/types';

/** Folder the widget owns inside an account's Claude Code config directory. */
export const WIDGET_DIR = '.usage-widget';
const MARKER = `${WIDGET_DIR}`;

export interface BridgeSources {
  /** Compiled Node bridge (macOS / Linux). */
  js: string;
  /** PowerShell bridge (Windows). */
  ps1: string;
}

export interface InstallOptions {
  platform: NodeJS.Platform;
  sources: BridgeSources;
  /**
   * How to start Node on macOS / Linux, e.g. `node` or
   * `ELECTRON_RUN_AS_NODE=1 "/Applications/Claude Usage Widget.app/Contents/MacOS/Claude Usage Widget"`.
   */
  nodeCommand: string;
}

interface StatusLine {
  type?: string;
  command?: string;
  padding?: number;
  refreshInterval?: number;
  [key: string]: unknown;
}

export function widgetDir(configDir: string): string {
  return path.join(configDir, WIDGET_DIR);
}

function settingsFile(configDir: string): string {
  return path.join(configDir, 'settings.json');
}

/** Forward slashes, because Claude Code may run the command through Git Bash on Windows. */
function shellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function readSettings(configDir: string): Record<string, unknown> | 'invalid' {
  const file = settingsFile(configDir);
  if (!fs.existsSync(file)) return {};
  const parsed = readJson<unknown>(file);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'invalid';
  return parsed as Record<string, unknown>;
}

function isOurs(statusLine: unknown): boolean {
  const cmd = (statusLine as StatusLine | undefined)?.command;
  return typeof cmd === 'string' && cmd.includes(MARKER);
}

export function bridgeStatus(configDir: string): BridgeStatus {
  if (!fs.existsSync(configDir)) return 'no-config-dir';
  const settings = readSettings(configDir);
  if (settings === 'invalid') return 'invalid-settings';
  return isOurs(settings.statusLine) ? 'installed' : 'missing';
}

export function bridgeCommand(configDir: string, opts: InstallOptions): string {
  const dir = widgetDir(configDir);
  if (opts.platform === 'win32') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${shellPath(path.join(dir, 'bridge.ps1'))}"`;
  }
  return `${opts.nodeCommand} "${shellPath(path.join(dir, 'bridge.js'))}"`;
}

/**
 * Points the account's status line at the bridge. An existing status line is kept
 * in `previous-statusline.json` and still runs (the bridge chains to it), and is
 * restored on uninstall. Only `settings.json` and our own folder are touched.
 */
export function installBridge(configDir: string, opts: InstallOptions): void {
  if (!fs.existsSync(configDir)) {
    throw new Error('설정 폴더가 없습니다. 먼저 이 폴더로 Claude Code에 로그인해 주세요.');
  }
  const settings = readSettings(configDir);
  if (settings === 'invalid') throw new Error('settings.json을 읽을 수 없습니다. JSON 형식을 확인해 주세요.');

  const dir = widgetDir(configDir);
  fs.mkdirSync(dir, { recursive: true });
  const isWin = opts.platform === 'win32';
  fs.copyFileSync(isWin ? opts.sources.ps1 : opts.sources.js, path.join(dir, isWin ? 'bridge.ps1' : 'bridge.js'));

  const current = settings.statusLine as StatusLine | undefined;
  if (current && !isOurs(current)) {
    writeJsonAtomic(path.join(dir, 'previous-statusline.json'), current);
    const backup = `${settingsFile(configDir)}.usage-widget.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(settingsFile(configDir), backup);
  }

  const next: StatusLine = { type: 'command', command: bridgeCommand(configDir, opts) };
  // Keep layout options the user chose for their status line.
  if (current?.padding !== undefined) next.padding = current.padding;
  if (current?.refreshInterval !== undefined) next.refreshInterval = current.refreshInterval;
  writeJsonAtomic(settingsFile(configDir), { ...settings, statusLine: next });
}

/** Restores the previous status line (or removes ours) and deletes the widget folder. */
export function uninstallBridge(configDir: string): void {
  const settings = readSettings(configDir);
  if (settings !== 'invalid' && isOurs(settings.statusLine)) {
    const previous = readJson<StatusLine>(path.join(widgetDir(configDir), 'previous-statusline.json'));
    const { statusLine: _ours, ...rest } = settings;
    writeJsonAtomic(settingsFile(configDir), previous ? { ...rest, statusLine: previous } : rest);
  }
  fs.rmSync(widgetDir(configDir), { recursive: true, force: true });
}
