// `npm run dev`: edit and see it live.
//  - src/renderer/** → Vite hot reload, the widget updates in place.
//  - src/main/**, src/bridge/**, src/shared/** → recompiled, then Electron restarts.
// Extra arguments go to Electron, e.g. `npm run dev -- --demo`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const tscPath = require.resolve('typescript/bin/tsc');
const electronArgs = process.argv.slice(2);

const vite = await createServer({ configFile: 'vite.config.mjs' });
await vite.listen();
const url = vite.resolvedUrls.local[0];
console.log(`[dev] renderer served at ${url}`);

let electron = null;
let restarting = false;

function startElectron() {
  electron = spawn(electronPath, ['.', ...electronArgs], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  electron.on('exit', () => {
    electron = null;
    // Quitting the app from the tray ends the dev session.
    if (!restarting) shutdown();
  });
}

function restartElectron() {
  if (!electron) return startElectron();
  restarting = true;
  electron.once('exit', () => {
    restarting = false;
    startElectron();
  });
  electron.kill();
}

function copyAssets() {
  return new Promise((resolve) => spawn(process.execPath, ['scripts/copy-assets.mjs'], { stdio: 'inherit' }).on('exit', resolve));
}

// Watch-compile the main process; (re)launch Electron after every clean build.
const tsc = spawn(process.execPath, [tscPath, '-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
tsc.stdout.on('data', async (chunk) => {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) if (line.trim()) console.log(`[tsc] ${line}`);
  if (/Found 0 errors/.test(text)) {
    await copyAssets();
    console.log(electron ? '[dev] main process changed, restarting Electron' : '[dev] starting Electron');
    restartElectron();
  }
});

function shutdown() {
  tsc.kill();
  electron?.kill();
  void vite.close().then(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
