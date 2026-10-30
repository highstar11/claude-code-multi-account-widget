import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';
import { bridgeCommand, bridgeStatus, installBridge, uninstallBridge, type InstallOptions } from '../src/main/statusline';
import { readUsage } from '../src/main/usage';
import { record } from '../src/bridge/statusline-bridge';

const root = path.resolve(__dirname, '..');
const sources = {
  js: path.join(root, 'dist/main/bridge/statusline-bridge.js'),
  ps1: path.join(root, 'src/bridge/statusline-bridge.ps1'),
};
const posix: InstallOptions = { platform: 'darwin', sources, nodeCommand: 'node' };
const windows: InstallOptions = { platform: 'win32', sources, nodeCommand: '' };

let configDir: string;
const settingsPath = () => path.join(configDir, 'settings.json');
const readSettings = () => JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));

const sample = {
  model: { display_name: 'Opus' },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: Math.floor(Date.now() / 1000) + 3600 },
    seven_day: { used_percentage: 41.2, resets_at: Math.floor(Date.now() / 1000) + 86400 },
  },
};

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccmaw-config-'));
});

describe('installBridge', () => {
  it('reports a missing config folder', () => {
    expect(bridgeStatus(path.join(configDir, 'nope'))).toBe('no-config-dir');
  });

  it('adds a status line and keeps other settings', () => {
    fs.writeFileSync(settingsPath(), JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls)'] } }));
    installBridge(configDir, posix);
    const s = readSettings();
    expect(s.model).toBe('opus');
    expect(s.permissions.allow).toEqual(['Bash(ls)']);
    expect(s.statusLine.command).toContain('.usage-widget/bridge.js');
    expect(bridgeStatus(configDir)).toBe('installed');
  });

  it('keeps and restores an existing status line', () => {
    const mine = { type: 'command', command: '~/.claude/statusline.sh', padding: 2 };
    fs.writeFileSync(settingsPath(), JSON.stringify({ statusLine: mine }));
    installBridge(configDir, posix);
    expect(readSettings().statusLine.padding).toBe(2);
    expect(fs.existsSync(`${settingsPath()}.usage-widget.bak`)).toBe(true);
    // Installing twice must not overwrite the saved original with our own command.
    installBridge(configDir, posix);
    uninstallBridge(configDir);
    expect(readSettings().statusLine).toEqual(mine);
    expect(fs.existsSync(path.join(configDir, '.usage-widget'))).toBe(false);
  });

  it('removes the status line on uninstall when there was none', () => {
    installBridge(configDir, posix);
    uninstallBridge(configDir);
    expect(readSettings().statusLine).toBeUndefined();
  });

  it('refuses to touch an unreadable settings.json', () => {
    fs.writeFileSync(settingsPath(), '{ not json');
    expect(bridgeStatus(configDir)).toBe('invalid-settings');
    expect(() => installBridge(configDir, posix)).toThrow();
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe('{ not json');
  });

  it('uses forward slashes and PowerShell on Windows', () => {
    const cmd = bridgeCommand('C:\\Users\\me\\.claude-personal', windows);
    expect(cmd).toMatch(/^powershell -NoProfile -ExecutionPolicy Bypass -File "/);
    expect(cmd).not.toContain('\\');
  });
});

describe('bridge snapshot', () => {
  it('records only rate limits and model, never other input', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccmaw-bridge-'));
    record(JSON.stringify({ ...sample, session_id: 'secret-session', transcript_path: '/x' }), dir, 1000);
    const snap = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'));
    expect(snap).toEqual({ version: 1, capturedAt: 1000, model: 'Opus', rate_limits: sample.rate_limits });
  });

  it('keeps the last snapshot when a session has no rate limits yet', () => {
    const dir = path.join(configDir, '.usage-widget');
    fs.mkdirSync(dir);
    record(JSON.stringify(sample), dir);
    record(JSON.stringify({ model: { display_name: 'Opus' } }), dir);
    const usage = readUsage(configDir);
    expect(usage.fiveHour.percent).toBe(23.5);
    expect(usage.sevenDay.percent).toBe(41.2);
    expect(usage.noRateLimits).toBe(false);
  });

  it('flags accounts that never report rate limits', () => {
    const dir = path.join(configDir, '.usage-widget');
    fs.mkdirSync(dir);
    record(JSON.stringify({ model: { display_name: 'Sonnet' } }), dir);
    expect(readUsage(configDir).noRateLimits).toBe(true);
  });

  it.runIf(fs.existsSync(sources.js))('runs end to end through node and prints a status line', () => {
    installBridge(configDir, posix);
    const bridge = path.join(configDir, '.usage-widget', 'bridge.js');
    const res = spawnSync(process.execPath, [bridge], { input: JSON.stringify(sample), encoding: 'utf8' });
    expect(res.stdout.trim()).toBe('5h 24% · 7d 41%');
    expect(readUsage(configDir).fiveHour.percent).toBe(23.5);
  });

  it.runIf(process.platform === 'win32')('runs end to end through PowerShell', () => {
    installBridge(configDir, windows);
    const bridge = path.join(configDir, '.usage-widget', 'bridge.ps1');
    const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bridge], {
      input: JSON.stringify(sample),
      encoding: 'utf8',
    });
    expect(res.stdout.trim()).toBe('5h 24% · 7d 41%');
    const usage = readUsage(configDir);
    expect(usage.fiveHour.percent).toBe(23.5);
    expect(usage.sevenDay.resetsAt).toBe(sample.rate_limits.seven_day.resets_at * 1000);
  });
});
