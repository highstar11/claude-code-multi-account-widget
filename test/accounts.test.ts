import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountStore } from '../src/main/accounts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccmaw-accounts-'));
  file = path.join(dir, 'accounts.json');
});

const add = (store: AccountStore, kind: 'work' | 'personal', n: number) =>
  store.add({ name: `${kind}-${n}`, kind, configDir: path.join(dir, `${kind}-${n}`) });

describe('AccountStore', () => {
  it('allows one work account and three personal accounts', () => {
    const store = new AccountStore(file);
    add(store, 'work', 1);
    expect(() => add(store, 'work', 2)).toThrow(/최대 1개/);
    add(store, 'personal', 1);
    add(store, 'personal', 2);
    add(store, 'personal', 3);
    expect(() => add(store, 'personal', 4)).toThrow(/최대 3개/);
    expect(store.list()).toHaveLength(4);
  });

  it('lists the work account first', () => {
    const store = new AccountStore(file);
    add(store, 'personal', 1);
    add(store, 'work', 1);
    expect(store.list().map((a) => a.kind)).toEqual(['work', 'personal']);
  });

  it('rejects two accounts sharing a config folder', () => {
    const store = new AccountStore(file);
    store.add({ name: 'a', kind: 'personal', configDir: path.join(dir, 'same') });
    expect(() => store.add({ name: 'b', kind: 'work', configDir: path.join(dir, 'same') })).toThrow(/이미/);
  });

  it('enforces the limit when changing kind', () => {
    const store = new AccountStore(file);
    add(store, 'work', 1);
    const p = add(store, 'personal', 1);
    expect(() => store.update(p.id, { kind: 'work' })).toThrow(/최대 1개/);
  });

  it('persists to disk and gives each account its own color', () => {
    const store = new AccountStore(file);
    add(store, 'work', 1);
    add(store, 'personal', 1);
    const reloaded = new AccountStore(file).list();
    expect(reloaded).toHaveLength(2);
    expect(new Set(reloaded.map((a) => a.color)).size).toBe(2);
  });

  it('stores nothing but names, kinds, folders and colors', () => {
    const store = new AccountStore(file);
    add(store, 'work', 1);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))[0];
    expect(Object.keys(saved).sort()).toEqual(['color', 'configDir', 'createdAt', 'id', 'kind', 'name']);
  });
});
