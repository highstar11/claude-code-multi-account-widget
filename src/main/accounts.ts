import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ACCOUNT_COLORS, ACCOUNT_LIMITS, type Account, type AccountInput, type AccountKind } from '../shared/types';

const KIND_LABEL: Record<AccountKind, string> = { work: '업무용', personal: '개인용' };

/**
 * Persists the account list. Holds no secrets: an account is only a display name
 * and the Claude Code config directory it lives in.
 */
export class AccountStore {
  private accounts: Account[] = [];

  constructor(private readonly file: string) {
    this.accounts = readJson<Account[]>(file) ?? [];
  }

  list(): Account[] {
    return [...this.accounts].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.createdAt - b.createdAt);
  }

  get(id: string): Account | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  add(input: AccountInput): Account {
    const name = input.name.trim();
    const configDir = normalizeDir(input.configDir);
    if (!name) throw new Error('계정 이름을 입력해 주세요.');
    if (!configDir) throw new Error('설정 폴더를 지정해 주세요.');
    this.assertCapacity(input.kind);
    this.assertUniqueDir(configDir);

    const account: Account = {
      id: crypto.randomUUID(),
      name,
      kind: input.kind,
      configDir,
      color: input.color ?? this.nextColor(),
      createdAt: Date.now(),
    };
    this.accounts.push(account);
    this.save();
    return account;
  }

  update(id: string, patch: Partial<AccountInput>): Account {
    const account = this.get(id);
    if (!account) throw new Error('계정을 찾을 수 없습니다.');
    if (patch.kind && patch.kind !== account.kind) this.assertCapacity(patch.kind);
    if (patch.configDir !== undefined) {
      const dir = normalizeDir(patch.configDir);
      if (!dir) throw new Error('설정 폴더를 지정해 주세요.');
      this.assertUniqueDir(dir, id);
      account.configDir = dir;
    }
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Error('계정 이름을 입력해 주세요.');
      account.name = patch.name.trim();
    }
    if (patch.kind) account.kind = patch.kind;
    if (patch.color) account.color = patch.color;
    this.save();
    return account;
  }

  remove(id: string): Account | undefined {
    const account = this.get(id);
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.save();
    return account;
  }

  private assertCapacity(kind: AccountKind): void {
    const count = this.accounts.filter((a) => a.kind === kind).length;
    if (count >= ACCOUNT_LIMITS[kind]) {
      throw new Error(`${KIND_LABEL[kind]} 계정은 최대 ${ACCOUNT_LIMITS[kind]}개까지 등록할 수 있습니다.`);
    }
  }

  private assertUniqueDir(dir: string, exceptId?: string): void {
    const key = dirKey(dir);
    if (this.accounts.some((a) => a.id !== exceptId && dirKey(a.configDir) === key)) {
      throw new Error('이미 다른 계정이 사용 중인 설정 폴더입니다.');
    }
  }

  private nextColor(): string {
    const used = new Set(this.accounts.map((a) => a.color));
    return ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[this.accounts.length % ACCOUNT_COLORS.length];
  }

  private save(): void {
    writeJsonAtomic(this.file, this.accounts);
  }
}

function kindOrder(kind: AccountKind): number {
  return kind === 'work' ? 0 : 1;
}

function normalizeDir(dir: string): string {
  const trimmed = dir.trim();
  return trimmed ? path.resolve(trimmed) : '';
}

function dirKey(dir: string): string {
  const resolved = path.resolve(dir);
  return process.platform === 'win32' || process.platform === 'darwin' ? resolved.toLowerCase() : resolved;
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as T;
  } catch {
    return null;
  }
}

export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
