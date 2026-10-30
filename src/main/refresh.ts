import { execFileSync, spawn } from 'node:child_process';

// @ts-ignore
import fs from 'node:fs';
// @ts-ignore
import os from 'node:os';
// @ts-ignore
import path from 'node:path';

import { readJson, writeJsonAtomic } from './accounts';
import { widgetDir } from './statusline';
import type { RawWindow, Snapshot } from '../shared/types';

/**
 * "지금 갱신": asks Claude Code itself for the current limits, for people who use
 * Claude Code outside the terminal (desktop app, web) where the status line never runs.
 *
 * Runs one headless request as the account (`claude -p`), as small as Claude Code allows:
 * Haiku, no tools, no MCP, a one-word system prompt and a one-digit reply (~5 tokens of
 * our own; Claude Code adds ~3.7K tokens of fixed context, mostly served from cache).
 * The `rate_limit_event` it prints carries the same numbers as the status line. We stop
 * the process as soon as it arrives. Credentials stay inside Claude Code.
 */

const PROMPT = 'Reply with only the digit 1.';
const ARGS = [
    '-p', PROMPT,
    '--model', 'haiku',
    '--tools', '',
    '--system-prompt', PROMPT,
    '--exclude-dynamic-system-prompt-sections',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
];
const TIMEOUT_MS = 60_000;

interface RateLimitWindow {
    utilization?: number;
    resetsAt?: number;
}

/** Turns one stream-json line into snapshot windows, or null if it isn't a rate-limit event. */
export function parseRateLimitLine(line: string): Snapshot['rate_limits'] | null {
    let event: any;
    try {
        event = JSON.parse(line);
    } catch {
        return null;
    }
    if (event?.type !== 'rate_limit_event') return null;
    const windows = event.rate_limit_info?.unifiedWindows as Record<string, RateLimitWindow> | undefined;
    if (!windows) return null;
    const toRaw = (w?: RateLimitWindow): RawWindow | undefined => {
        if (!w) return undefined;
        const out: RawWindow = {};
        // utilization is a 0–1 fraction; the status line reports 0–100.
        if (typeof w.utilization === 'number') out.used_percentage = Math.round(w.utilization * 1000) / 10;
        if (typeof w.resetsAt === 'number') out.resets_at = w.resetsAt;
        return out;
    };
    const fiveHour = toRaw(windows.five_hour);
    const sevenDay = toRaw(windows.seven_day);
    if (!fiveHour && !sevenDay) return null;
    return { five_hour: fiveHour, seven_day: sevenDay };
}

/** The error Claude Code reported, if the run ended without rate limits. */
function parseResultError(line: string): string | null {
    try {
        const event = JSON.parse(line);
        if (event?.type === 'result' && event.is_error) return String(event.result ?? event.subtype ?? 'error');
    } catch {
        // not JSON
    }
    return null;
}

let claudePathCache: string | null = null;

/** Finds the `claude` executable. GUI apps on macOS don't get the login shell's PATH. */
export function findClaude(): string {
    if (claudePathCache) return claudePathCache;
    try {
        if (process.platform === 'win32') {
            // Search PATH ourselves: where.exe prints in the console code page, which garbles non-ASCII paths.
            const dirs = [...(process.env.PATH ?? '').split(';'), path.join(os.homedir(), '.local', 'bin')].filter(Boolean);
            const candidates = dirs.flatMap((d) => ['claude.exe', 'claude.cmd'].map((name) => path.join(d, name)));
            claudePathCache =
                candidates.find((c) => c.endsWith('.exe') && fs.existsSync(c)) ?? candidates.find((c) => fs.existsSync(c)) ?? null;
        } else {
            const shell = process.env.SHELL || '/bin/zsh';
            claudePathCache = execFileSync(shell, ['-lc', 'command -v claude'], { encoding: 'utf8', timeout: 5000 }).trim() || null;
        }
    } catch {
        claudePathCache = null;
    }
    if (!claudePathCache) throw new Error('claude 명령을 찾을 수 없습니다. Claude Code CLI가 설치돼 있어야 합니다.');
    return claudePathCache;
}

/** Quotes an argument for cmd.exe (only needed for npm's claude.cmd shim). */
export function quoteForCmd(arg: string): string {
    return `"${arg.replace(/"/g, '""')}"`;
}

/** Environment for running Claude Code as this account. */
function accountEnv(configDir: string): NodeJS.ProcessEnv {
    const env = { ...process.env };
    // The default account keeps part of its state outside ~/.claude, so leave the variable unset for it.
    if (path.resolve(configDir).toLowerCase() === path.join(os.homedir(), '.claude').toLowerCase()) {
        delete env.CLAUDE_CONFIG_DIR;
    } else {
        env.CLAUDE_CONFIG_DIR = configDir;
    }
    return env;
}

/** Runs the minimal request and writes the result where the status line bridge would. */
export function refreshUsage(configDir: string): Promise<void> {
    if (!fs.existsSync(configDir)) {
        return Promise.reject(new Error('설정 폴더가 없습니다. 먼저 이 계정으로 Claude Code에 로그인해 주세요.'));
    }
    const exe = findClaude();
    // An empty working folder, so no project CLAUDE.md is sent along.
    const cwd = path.join(os.tmpdir(), 'claude-usage-widget-refresh');
    fs.mkdirSync(cwd, { recursive: true });

    const isCmdShim = /\.(cmd|bat)$/i.test(exe);
    const child = isCmdShim
        ? spawn(`${quoteForCmd(exe)} ${ARGS.map(quoteForCmd).join(' ')}`, { cwd, env: accountEnv(configDir), shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn(exe, ARGS, { cwd, env: accountEnv(configDir), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    return new Promise((resolve, reject) => {
        let buffer = '';
        let stderr = '';
        let lastError: string | null = null;
        let done = false;

        const finish = (err?: Error) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            child.kill();
            if (err) reject(err);
            else resolve();
        };
        const timer = setTimeout(() => finish(new Error('응답이 너무 늦어 갱신을 취소했습니다.')), TIMEOUT_MS);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            buffer += chunk;
            let nl: number;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                const limits = parseRateLimitLine(line);
                if (limits) {
                    const dir = widgetDir(configDir);
                    fs.mkdirSync(dir, { recursive: true });
                    const previous = readJson<Snapshot>(path.join(dir, 'snapshot.json'));
                    const snapshot: Snapshot = { version: 1, capturedAt: Date.now(), model: previous?.model, rate_limits: limits };
                    writeJsonAtomic(path.join(dir, 'snapshot.json'), snapshot);
                    return finish();
                }
                lastError = parseResultError(line) ?? lastError;
            }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => (stderr += chunk));
        child.on('error', (err) => finish(err));
        child.on('exit', () => {
            const detail = lastError ?? stderr.trim().split('\n').pop();
            finish(
                new Error(
                    detail
                        ? `한도 정보를 받지 못했습니다: ${detail}`
                        : '한도 정보를 받지 못했습니다. 구독(Pro/Max) 계정으로 로그인돼 있는지 확인해 주세요.',
                ),
            );
        });
    });
}
