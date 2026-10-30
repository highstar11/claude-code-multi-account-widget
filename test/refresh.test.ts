import { describe, expect, it } from 'vitest';
import { parseRateLimitLine, quoteForCmd } from '../src/main/refresh';

// Shape printed by `claude -p --output-format stream-json --verbose` (Claude Code 2.1.314).
const event = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed',
    resetsAt: 1793337600,
    rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0.35, resetsAt: 1793337600, status: 'allowed' },
      seven_day: { utilization: 0.05, resetsAt: 1793890800, status: 'allowed' },
    },
  },
};

describe('parseRateLimitLine', () => {
  it('converts utilization fractions to status-line percentages', () => {
    expect(parseRateLimitLine(JSON.stringify(event))).toEqual({
      five_hour: { used_percentage: 35, resets_at: 1793337600 },
      seven_day: { used_percentage: 5, resets_at: 1793890800 },
    });
  });

  it('keeps one decimal place', () => {
    const e = structuredClone(event);
    e.rate_limit_info.unifiedWindows.five_hour.utilization = 0.12345;
    expect(parseRateLimitLine(JSON.stringify(e))?.five_hour?.used_percentage).toBe(12.3);
  });

  it('ignores other events and junk', () => {
    expect(parseRateLimitLine(JSON.stringify({ type: 'assistant' }))).toBeNull();
    expect(parseRateLimitLine('{"type":"rate_limit_event","rate_limit_info":{}}')).toBeNull();
    expect(parseRateLimitLine('not json')).toBeNull();
  });
});

describe('quoteForCmd', () => {
  it('quotes empty strings and embedded quotes', () => {
    expect(quoteForCmd('')).toBe('""');
    expect(quoteForCmd('say "1"')).toBe('"say ""1"""');
  });
});
