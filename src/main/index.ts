import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountStore, readJson, writeJsonAtomic } from './accounts';
import { bridgeStatus, installBridge, uninstallBridge, type InstallOptions } from './statusline';
import { readUsage, TranscriptScanner, windowStarts } from './usage';
import { demoAccounts } from './demo';
import type { AccountInput, AccountKind, AccountView, Platform, Result, WidgetSettings, WidgetState } from '../shared/types';

const WIDTH = 360;
const isDemo = process.argv.includes('--demo');
const captureArg = process.argv.find((a) => a.startsWith('--capture='));
const platform: Platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';

interface StoredSettings extends WidgetSettings {
  position?: { x: number; y: number };
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: AccountStore;
let settingsFile: string;
let settings: StoredSettings = { alwaysOnTop: false, openAtLogin: false };
const scanner = new TranscriptScanner();
const tokenCache = new Map<string, { fiveHour: number; sevenDay: number }>();
let lastBroadcast = '';

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function assetsDir(): string {
  return path.join(__dirname, '..', '..', 'assets');
}

function bridgeSources(): InstallOptions['sources'] {
  const dir = path.join(__dirname, '..', 'bridge');
  return { js: path.join(dir, 'statusline-bridge.js'), ps1: path.join(dir, 'statusline-bridge.ps1') };
}

let nodeCommandCache: string | null = null;
/** Prefer the user's own Node; fall back to this app's bundled runtime. */
function nodeCommand(): string {
  if (nodeCommandCache) return nodeCommandCache;
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const found = execFileSync(shell, ['-lc', 'command -v node'], { encoding: 'utf8', timeout: 3000 }).trim();
    if (found) nodeCommandCache = 'node';
  } catch {
    // no node on PATH
  }
  nodeCommandCache ??= `ELECTRON_RUN_AS_NODE=1 "${process.execPath}"`;
  return nodeCommandCache;
}

function installOptions(): InstallOptions {
  return {
    platform: process.platform,
    sources: bridgeSources(),
    nodeCommand: process.platform === 'win32' ? '' : nodeCommand(),
  };
}

function buildState(): WidgetState {
  const now = Date.now();
  const accounts: AccountView[] = isDemo
    ? demoAccounts(now)
    : store.list().map((account) => ({
        account,
        bridge: bridgeStatus(account.configDir),
        ...readUsage(account.configDir, now),
        tokens: tokenCache.get(account.id) ?? null,
      }));
  return {
    platform,
    accounts,
    settings: { alwaysOnTop: settings.alwaysOnTop, openAtLogin: settings.openAtLogin },
    demo: isDemo,
  };
}

function broadcast(force = false): void {
  if (!win || win.isDestroyed()) return;
  const state = buildState();
  const json = JSON.stringify(state);
  if (!force && json === lastBroadcast) return;
  lastBroadcast = json;
  win.webContents.send('state', state);
}

function scanTokens(): void {
  if (isDemo) return;
  for (const account of store.list()) {
    const usage = readUsage(account.configDir);
    tokenCache.set(account.id, scanner.scan(account.configDir, windowStarts(usage)));
  }
  broadcast();
}

function saveSettings(): void {
  writeJsonAtomic(settingsFile, settings);
}

function defaultPosition(): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - WIDTH - 24, y: area.y + 24 };
}

function platformWindowOptions(): Electron.BrowserWindowConstructorOptions {
  if (platform === 'mac') {
    return { transparent: true, vibrancy: 'popover', visualEffectState: 'active', roundedCorners: true };
  }
  if (platform === 'win') {
    return { backgroundMaterial: 'acrylic', backgroundColor: '#00000000', roundedCorners: true };
  }
  return { transparent: true };
}

function createWindow(): void {
  const pos = settings.position ?? defaultPosition();
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return pos.x >= a.x - 40 && pos.x < a.x + a.width && pos.y >= a.y - 40 && pos.y < a.y + a.height;
  });
  const { x, y } = onScreen ? pos : defaultPosition();

  win = new BrowserWindow({
    x,
    y,
    width: WIDTH,
    height: 420,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    ...platformWindowOptions(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // `npm run dev` serves the UI from Vite so edits show up instantly.
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    win.loadURL(devServer);
    // Show UI errors and console.log output in the terminal running `npm run dev`.
    win.webContents.on('console-message', (e) => console.log(`[ui:${e.level}] ${e.message}`));
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }
  win.once('ready-to-show', () => {
    if (!captureArg) win?.show();
  });
  win.on('moved', () => {
    if (!win) return;
    const [nx, ny] = win.getPosition();
    settings.position = { x: nx, y: ny };
    saveSettings();
  });
  win.on('closed', () => (win = null));
  // The widget never navigates or opens other pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => {
    if (!devServer) e.preventDefault();
  });

  if (captureArg) {
    // CAPTURE_CLICK="[aria-label=설정]|.row" clicks through screens before the screenshot.
    const clicks = process.env.CAPTURE_CLICK?.split('|').filter(Boolean) ?? [];
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        for (const selector of clicks) {
          await win!.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
          await new Promise((r) => setTimeout(r, 400));
        }
        const image = await win!.webContents.capturePage();
        fs.writeFileSync(captureArg.slice('--capture='.length), image.toPNG());
        app.quit();
      }, 1200);
    });
  }
}

function showWindow(): void {
  if (!win) createWindow();
  win?.show();
  win?.focus();
}

function toggleWindow(): void {
  if (win?.isVisible()) win.hide();
  else showWindow();
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(assetsDir(), platform === 'mac' ? 'trayTemplate.png' : 'tray.png'));
  if (platform === 'mac') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Widget');
  tray.on('click', toggleWindow);
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: '위젯 보기 / 숨기기', click: toggleWindow },
      { type: 'separator' },
      {
        label: '항상 위에 표시',
        type: 'checkbox',
        checked: settings.alwaysOnTop,
        click: (item) => applySettings({ alwaysOnTop: item.checked }),
      },
      {
        label: '로그인 시 실행',
        type: 'checkbox',
        checked: settings.openAtLogin,
        click: (item) => applySettings({ openAtLogin: item.checked }),
      },
      {
        label: '위치 초기화',
        click: () => {
          const p = defaultPosition();
          win?.setPosition(p.x, p.y);
        },
      },
      { type: 'separator' },
      { label: '종료', role: 'quit' },
    ]),
  );
}

function applySettings(patch: Partial<WidgetSettings>): void {
  settings = { ...settings, ...patch };
  if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(patch.alwaysOnTop, 'floating');
  if (patch.openAtLogin !== undefined && app.isPackaged) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
  saveSettings();
  refreshTrayMenu();
  broadcast(true);
}

function run(fn: () => void): Result {
  try {
    fn();
    broadcast(true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function defaultConfigDir(kind: AccountKind): string {
  const home = os.homedir();
  if (kind === 'work') return path.join(home, '.claude');
  const taken = new Set(store.list().map((a) => path.resolve(a.configDir).toLowerCase()));
  for (let i = 1; ; i++) {
    const dir = path.join(home, i === 1 ? '.claude-personal' : `.claude-personal-${i}`);
    if (!taken.has(dir.toLowerCase())) return dir;
  }
}

function accountOrThrow(id: string) {
  const account = store.get(id);
  if (!account) throw new Error('계정을 찾을 수 없습니다.');
  return account;
}

function registerIpc(): void {
  ipcMain.handle('get-state', () => buildState());
  ipcMain.handle('add-account', (_e, input: AccountInput) =>
    run(() => {
      const account = store.add(input);
      // Wire up the status line right away when the folder already exists.
      if (bridgeStatus(account.configDir) === 'missing') installBridge(account.configDir, installOptions());
    }),
  );
  ipcMain.handle('update-account', (_e, id: string, patch: Partial<AccountInput>) => run(() => store.update(id, patch)));
  ipcMain.handle('remove-account', (_e, id: string) =>
    run(() => {
      const account = accountOrThrow(id);
      if (bridgeStatus(account.configDir) === 'installed') uninstallBridge(account.configDir);
      store.remove(id);
      tokenCache.delete(id);
    }),
  );
  ipcMain.handle('install-bridge', (_e, id: string) =>
    run(() => installBridge(accountOrThrow(id).configDir, installOptions())),
  );
  ipcMain.handle('uninstall-bridge', (_e, id: string) => run(() => uninstallBridge(accountOrThrow(id).configDir)));
  ipcMain.handle('pick-directory', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Claude Code 설정 폴더 선택',
      defaultPath: os.homedir(),
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });
  ipcMain.handle('default-config-dir', (_e, kind: AccountKind) => defaultConfigDir(kind));
  ipcMain.handle('copy-text', (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle('set-settings', (_e, patch: Partial<WidgetSettings>) => applySettings(patch));
  ipcMain.on('resize', (_e, height: number) => {
    if (!win) return;
    const max = screen.getDisplayMatching(win.getBounds()).workArea.height - 48;
    win.setContentSize(WIDTH, Math.max(160, Math.min(Math.ceil(height), max)));
  });
  ipcMain.on('hide', () => win?.hide());
}

app.whenReady().then(() => {
  const data = app.getPath('userData');
  store = new AccountStore(path.join(data, 'accounts.json'));
  settingsFile = path.join(data, 'settings.json');
  settings = { ...settings, ...(readJson<StoredSettings>(settingsFile) ?? {}) };
  if (platform === 'mac') app.dock?.hide();

  registerIpc();
  createWindow();
  if (!captureArg) createTray();

  scanTokens();
  setInterval(() => broadcast(), 3000);
  setInterval(scanTokens, 60_000);
});

// A widget lives in the tray; closing the window does not quit.
app.on('window-all-closed', () => {});
