// Copies files tsc does not emit: the PowerShell bridge and the tray/app icons.
import fs from 'node:fs';

fs.mkdirSync('dist/main/bridge', { recursive: true });
fs.copyFileSync('src/bridge/statusline-bridge.ps1', 'dist/main/bridge/statusline-bridge.ps1');
fs.cpSync('assets', 'dist/assets', { recursive: true });
