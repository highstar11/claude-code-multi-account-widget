/*
 * Status line bridge (macOS / Linux).
 *
 * Claude Code runs this as the account's status line command and pipes the
 * session JSON to stdin. We keep only the `rate_limits` numbers and write them
 * next to this file, so the widget never needs credentials or network access.
 * If the user had their own status line before, it is run with the same input
 * and its output is shown unchanged.
 *
 * Copied into `<configDir>/.usage-widget/bridge.js`; must only use Node built-ins.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const here = __dirname;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function writeAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, file);
}

function pickWindow(w: any): { used_percentage?: number; resets_at?: number } | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const out: { used_percentage?: number; resets_at?: number } = {};
  if (typeof w.used_percentage === 'number') out.used_percentage = w.used_percentage;
  if (typeof w.resets_at === 'number') out.resets_at = w.resets_at;
  return out;
}

export function record(raw: string, dir: string, now = Date.now()): any {
  let input: any;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  const rl = input?.rate_limits;
  const fiveHour = pickWindow(rl?.five_hour);
  const sevenDay = pickWindow(rl?.seven_day);
  if (!fiveHour && !sevenDay) {
    // Not a subscriber, or no API response yet in this session: keep the last good snapshot.
    writeAtomic(path.join(dir, 'heartbeat.json'), { version: 1, seenAt: now });
    return input;
  }
  const snapshot = {
    version: 1,
    capturedAt: now,
    model: typeof input?.model?.display_name === 'string' ? input.model.display_name : undefined,
    rate_limits: { five_hour: fiveHour, seven_day: sevenDay },
  };
  writeAtomic(path.join(dir, 'snapshot.json'), snapshot);
  return input;
}

function defaultLine(input: any): string {
  const rl = input?.rate_limits ?? {};
  const parts: string[] = [];
  if (typeof rl.five_hour?.used_percentage === 'number') parts.push(`5h ${Math.round(rl.five_hour.used_percentage)}%`);
  if (typeof rl.seven_day?.used_percentage === 'number') parts.push(`7d ${Math.round(rl.seven_day.used_percentage)}%`);
  return parts.join(' · ');
}

function previousCommand(): string | null {
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(here, 'previous-statusline.json'), 'utf8'));
    return typeof prev?.command === 'string' && prev.command.trim() ? prev.command : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: any = null;
  try {
    input = record(raw, here);
  } catch {
    // Never break the user's status line because of the widget.
  }
  const prev = previousCommand();
  if (!prev) {
    process.stdout.write(defaultLine(input) + '\n');
    return;
  }
  const child = spawn(prev, { shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
  child.on('error', () => process.exit(0));
  child.on('exit', (code) => process.exit(code ?? 0));
  child.stdin.end(raw);
}

if (require.main === module) void main();
