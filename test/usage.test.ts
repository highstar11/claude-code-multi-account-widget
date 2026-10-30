import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TranscriptScanner } from '../src/main/usage';
import { formatDuration, formatTokens, toUsageWindow } from '../src/shared/format';

describe('toUsageWindow', () => {
  const now = 1_700_000_000_000;

  it('converts seconds to milliseconds', () => {
    expect(toUsageWindow({ used_percentage: 40, resets_at: now / 1000 + 60 }, now)).toEqual({
      percent: 40,
      resetsAt: now + 60_000,
      hasReset: false,
    });
  });

  it('treats a passed reset as a fresh window', () => {
    expect(toUsageWindow({ used_percentage: 97, resets_at: now / 1000 - 1 }, now)).toEqual({
      percent: 0,
      resetsAt: null,
      hasReset: true,
    });
  });

  it('handles a missing window', () => {
    expect(toUsageWindow(undefined, now)).toEqual({ percent: null, resetsAt: null, hasReset: false });
  });
});

describe('format', () => {
  it('formats durations in Korean', () => {
    expect(formatDuration(2 * 3_600_000 + 14 * 60_000)).toBe('2시간 14분');
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe('3일 4시간');
    expect(formatDuration(45_000)).toBe('45초');
  });

  it('formats token counts', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1234)).toBe('1.2K');
    expect(formatTokens(3_400_000)).toBe('3.4M');
  });
});

describe('TranscriptScanner', () => {
  it('sums tokens per window, skipping cache reads and duplicates', () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccmaw-tx-'));
    const project = path.join(configDir, 'projects', 'my-app');
    fs.mkdirSync(project, { recursive: true });
    const now = Date.now();
    const line = (ago: number, id: string, input: number, output: number) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(now - ago).toISOString(),
        requestId: `req-${id}`,
        message: {
          id,
          usage: { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 10, cache_read_input_tokens: 99999 },
        },
      });
    fs.writeFileSync(
      path.join(project, 'a.jsonl'),
      [
        line(60_000, 'm1', 100, 50), // 160, both windows
        line(60_000, 'm1', 100, 50), // duplicate
        line(2 * 86_400_000, 'm2', 1000, 0), // 1010, week only
        JSON.stringify({ type: 'user', message: { content: 'hi' } }),
        '{"partial":',
      ].join('\n'),
    );
    const res = new TranscriptScanner().scan(configDir, { fiveHour: now - 5 * 3_600_000, sevenDay: now - 7 * 86_400_000 });
    expect(res).toEqual({ fiveHour: 160, sevenDay: 1170 });
  });
});
