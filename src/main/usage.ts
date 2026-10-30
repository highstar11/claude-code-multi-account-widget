import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './accounts';
import { widgetDir } from './statusline';
import { toUsageWindow } from '../shared/format';
import type { Snapshot, UsageWindow } from '../shared/types';

const FIVE_HOURS = 5 * 3_600_000;
const SEVEN_DAYS = 7 * 86_400_000;

export interface AccountUsage {
  capturedAt: number | null;
  model: string | null;
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  noRateLimits: boolean;
}

/** Reads what the bridge last wrote for this account. Never touches credentials. */
export function readUsage(configDir: string, now = Date.now()): AccountUsage {
  const dir = widgetDir(configDir);
  const snap = readJson<Snapshot>(path.join(dir, 'snapshot.json'));
  const heartbeat = readJson<{ seenAt?: number }>(path.join(dir, 'heartbeat.json'));
  return {
    capturedAt: snap?.capturedAt ?? null,
    model: snap?.model ?? null,
    fiveHour: toUsageWindow(snap?.rate_limits?.five_hour, now),
    sevenDay: toUsageWindow(snap?.rate_limits?.seven_day, now),
    noRateLimits: !snap && typeof heartbeat?.seenAt === 'number',
  };
}

/** Start of each window, from the reported reset time when known, else a rolling window. */
export function windowStarts(usage: AccountUsage, now = Date.now()): { fiveHour: number; sevenDay: number } {
  return {
    fiveHour: usage.fiveHour.resetsAt ? usage.fiveHour.resetsAt - FIVE_HOURS : now - FIVE_HOURS,
    sevenDay: usage.sevenDay.resetsAt ? usage.sevenDay.resetsAt - SEVEN_DAYS : now - SEVEN_DAYS,
  };
}

interface FileEntry {
  mtimeMs: number;
  size: number;
  /** [timestamp ms, tokens, dedupe key] */
  rows: Array<[number, number, string]>;
}

/**
 * Counts tokens from Claude Code's local transcripts (`<configDir>/projects/**\/*.jsonl`).
 * Cache reads are left out: they dwarf everything else and barely count toward limits.
 */
export class TranscriptScanner {
  private cache = new Map<string, FileEntry>();

  scan(configDir: string, starts: { fiveHour: number; sevenDay: number }): { fiveHour: number; sevenDay: number } {
    const root = path.join(configDir, 'projects');
    const oldest = Math.min(starts.fiveHour, starts.sevenDay);
    const seen = new Set<string>();
    let fiveHour = 0;
    let sevenDay = 0;
    for (const file of listJsonl(root, 3)) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (stat.mtimeMs < oldest) continue;
      let entry = this.cache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
        entry = { mtimeMs: stat.mtimeMs, size: stat.size, rows: parseTranscript(file) };
        this.cache.set(file, entry);
      }
      for (const [ts, tokens, key] of entry.rows) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (ts >= starts.sevenDay) sevenDay += tokens;
        if (ts >= starts.fiveHour) fiveHour += tokens;
      }
    }
    return { fiveHour, sevenDay };
  }
}

function listJsonl(dir: string, depth: number): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) out.push(...listJsonl(p, depth - 1));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

export function parseTranscript(file: string): Array<[number, number, string]> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows: Array<[number, number, string]> = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const row = JSON.parse(line);
      const usage = row?.message?.usage;
      const ts = Date.parse(row?.timestamp);
      if (row?.type !== 'assistant' || !usage || Number.isNaN(ts)) continue;
      const tokens =
        (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
      const key = `${row.message.id ?? ''}:${row.requestId ?? row.uuid ?? ts}`;
      rows.push([ts, tokens, key]);
    } catch {
      // Partial line while Claude Code is writing; picked up on the next scan.
    }
  }
  return rows;
}
