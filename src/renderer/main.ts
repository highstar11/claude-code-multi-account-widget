import { ACCOUNT_COLORS, ACCOUNT_LIMITS } from '../shared/types';
import type { Account, AccountKind, AccountView, UsageWindow, WidgetApi, WidgetState } from '../shared/types';
import { formatAgo, formatDuration, formatTokens } from '../shared/format';

declare global {
  interface Window {
    widget: WidgetApi;
  }
}

type View = { name: 'home' } | { name: 'settings' } | { name: 'edit'; id: string | null; kind: AccountKind };

const api = window.widget;
const app = document.getElementById('app')!;
let state: WidgetState | null = null;
let view: View = { name: 'home' };
let toast: { text: string; error: boolean } | null = null;
let toastTimer: number | undefined;

const KIND_LABEL: Record<AccountKind, string> = { work: '업무', personal: '개인' };

// ---------- helpers ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The weekly (inner) ring uses a lighter tint of the account color, like Activity rings. */
function innerTint(color: string): string {
  return `color-mix(in srgb, ${color} 55%, white)`;
}

function levelColor(percent: number | null, base: string): string {
  if (percent === null) return base;
  if (percent >= 90) return 'var(--red)';
  if (percent >= 75) return 'var(--orange)';
  return base;
}

function launchCommand(account: Account): string {
  const isDefault = /[\\/]\.claude$/.test(account.configDir);
  if (isDefault) return 'claude';
  if (state?.platform === 'win') return `$env:CLAUDE_CONFIG_DIR="${account.configDir}"; claude`;
  return `CLAUDE_CONFIG_DIR="${account.configDir}" claude`;
}

function showToast(text: string, error = false): void {
  toast = { text, error };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast = null;
    render();
  }, 2600);
  render();
}

const icons = {
  gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
};

// ---------- rings ----------

function ring(r: number, width: number, percent: number | null, color: string): string {
  const c = 2 * Math.PI * r;
  const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const dash = (p / 100) * c;
  return `
    <circle r="${r}" cx="32" cy="32" fill="none" style="stroke:${color}" stroke-opacity="0.18" stroke-width="${width}"/>
    ${p > 0 ? `<circle r="${r}" cx="32" cy="32" fill="none" style="stroke:${color}" stroke-width="${width}" stroke-linecap="round"
      stroke-dasharray="${dash} ${c}" transform="rotate(-90 32 32)" class="ring-fill"/>` : ''}`;
}

function rings(v: AccountView): string {
  const base = v.account.color;
  return `<svg class="rings" viewBox="0 0 64 64" aria-hidden="true">
    ${ring(27, 8, v.fiveHour.percent, levelColor(v.fiveHour.percent, base))}
    ${ring(16.5, 8, v.sevenDay.percent, levelColor(v.sevenDay.percent, innerTint(base)))}
  </svg>`;
}

// ---------- views ----------

function windowRow(label: string, w: UsageWindow, color: string, now: number): string {
  const pct = w.percent === null ? '—' : `${Math.round(w.percent)}<small>%</small>`;
  let sub = '정보 없음';
  if (w.hasReset) sub = '초기화됨';
  else if (w.resetsAt) sub = `${formatDuration(w.resetsAt - now)} 후 초기화`;
  return `<div class="metric">
    <div class="metric-label"><i style="background:${color}"></i>${label}</div>
    <div class="metric-value">${pct}</div>
    <div class="metric-sub">${sub}</div>
  </div>`;
}

function accountCard(v: AccountView, now: number): string {
  const { account } = v;
  const head = `<div class="card-head">
      <span class="name">${esc(account.name)}</span>
      <span class="chip chip-${account.kind}">${KIND_LABEL[account.kind]}</span>
      <span class="spacer"></span>
      ${v.capturedAt ? `<span class="ago">${formatAgo(now - v.capturedAt)}</span>` : ''}
    </div>`;

  if (v.bridge !== 'installed') {
    const msg =
      v.bridge === 'no-config-dir'
        ? '설정 폴더가 아직 없습니다. 아래 명령으로 이 계정에 로그인해 주세요.'
        : v.bridge === 'invalid-settings'
          ? 'settings.json 형식이 올바르지 않아 연결할 수 없습니다.'
          : 'Claude Code 상태줄과 연결하면 사용량이 표시됩니다.';
    return `<section class="card">${head}
      <p class="hint">${msg}</p>
      ${v.bridge === 'no-config-dir' ? commandBox(account) : ''}
      ${v.bridge === 'missing' || v.bridge === 'no-config-dir' ? `<button class="btn btn-tinted" data-action="install" data-id="${account.id}">상태줄 연결</button>` : ''}
    </section>`;
  }

  if (!v.capturedAt) {
    const msg = v.noRateLimits
      ? '이 계정은 한도 정보를 제공하지 않습니다. Pro / Max 구독 계정에서만 표시됩니다.'
      : '연결됨. 이 계정으로 Claude Code에서 메시지를 한 번 보내면 표시됩니다.';
    return `<section class="card">${head}<p class="hint">${msg}</p>${v.noRateLimits ? '' : commandBox(account)}</section>`;
  }

  const fiveColor = levelColor(v.fiveHour.percent, account.color);
  const sevenColor = levelColor(v.sevenDay.percent, innerTint(account.color));
  const tokens = v.tokens
    ? `<div class="foot">토큰 · 5시간 ${formatTokens(v.tokens.fiveHour)} · 7일 ${formatTokens(v.tokens.sevenDay)}</div>`
    : '';
  return `<section class="card">
    ${head}
    <div class="card-body">
      ${rings(v)}
      <div class="metrics">
        ${windowRow('현재 세션', v.fiveHour, fiveColor, now)}
        ${windowRow('주간', v.sevenDay, sevenColor, now)}
      </div>
    </div>
    ${tokens}
  </section>`;
}

function commandBox(account: Account): string {
  const cmd = launchCommand(account);
  return `<button class="cmd" data-action="copy" data-text="${esc(cmd)}" title="복사">
    <code>${esc(cmd)}</code>${icons.copy}
  </button>`;
}

function header(title: string, opts: { back?: boolean; settings?: boolean } = {}): string {
  return `<header class="bar">
    ${opts.back ? `<button class="icon-btn" data-action="back" aria-label="뒤로">${icons.back}</button>` : ''}
    <h1>${title}</h1>
    <span class="spacer"></span>
    ${opts.settings ? `<button class="icon-btn" data-action="settings" aria-label="설정">${icons.gear}</button>` : ''}
    <button class="icon-btn" data-action="hide" aria-label="숨기기">${icons.close}</button>
  </header>`;
}

function homeView(s: WidgetState, now: number): string {
  if (s.accounts.length === 0) {
    return `${header('Claude 사용량', { settings: true })}
      <section class="card empty">
        <div class="empty-rings">${rings({
          account: { color: 'var(--blue)' } as Account,
          fiveHour: { percent: 70, resetsAt: null, hasReset: false },
          sevenDay: { percent: 45, resetsAt: null, hasReset: false },
        } as AccountView)}</div>
        <h2>계정을 추가해 보세요</h2>
        <p>업무용 1개, 개인용 3개까지 등록할 수 있어요. 인증 토큰은 읽지도, 전송하지도 않습니다.</p>
        <button class="btn btn-filled" data-action="add" data-kind="work">업무용 계정 추가</button>
        <button class="btn btn-plain" data-action="add" data-kind="personal">개인용 계정 추가</button>
      </section>`;
  }
  return `${header('Claude 사용량', { settings: true })}
    ${s.demo ? '<div class="demo">데모 데이터</div>' : ''}
    <div class="list">${s.accounts.map((v) => accountCard(v, now)).join('')}</div>`;
}

function settingsView(s: WidgetState): string {
  const group = (kind: AccountKind) => {
    const items = s.accounts.filter((v) => v.account.kind === kind);
    const full = items.length >= ACCOUNT_LIMITS[kind];
    return `<div class="group-title">${KIND_LABEL[kind]}용 · ${items.length}/${ACCOUNT_LIMITS[kind]}</div>
      <div class="group">
        ${items
          .map(
            (v) => `<button class="row" data-action="edit" data-id="${v.account.id}">
              <i class="dot" style="background:${v.account.color}"></i>
              <span class="row-text"><span>${esc(v.account.name)}</span><small>${esc(v.account.configDir)}</small></span>
              <span class="row-status ${v.bridge === 'installed' ? 'ok' : ''}">${v.bridge === 'installed' ? '연결됨' : '미연결'}</span>
              ${icons.chevron}
            </button>`,
          )
          .join('')}
        ${full ? '' : `<button class="row row-add" data-action="add" data-kind="${kind}">${icons.plus}<span>${KIND_LABEL[kind]}용 계정 추가</span></button>`}
      </div>`;
  };
  return `${header('설정', { back: true })}
    <div class="scroll">
      ${group('work')}
      ${group('personal')}
      <div class="group-title">위젯</div>
      <div class="group">
        <label class="row"><span class="row-text"><span>항상 위에 표시</span></span>
          <input type="checkbox" class="switch" data-setting="alwaysOnTop" ${s.settings.alwaysOnTop ? 'checked' : ''}/></label>
        <label class="row"><span class="row-text"><span>로그인 시 실행</span></span>
          <input type="checkbox" class="switch" data-setting="openAtLogin" ${s.settings.openAtLogin ? 'checked' : ''}/></label>
      </div>
      <p class="footnote">사용량은 각 계정의 Claude Code 상태줄 데이터(rate_limits)에서 읽습니다. 인증 정보는 읽거나 전송하지 않으며, 모든 데이터는 이 기기 안에만 저장됩니다.</p>
    </div>`;
}

function editView(s: WidgetState, v: Extract<View, { name: 'edit' }>): string {
  const existing = v.id ? s.accounts.find((a) => a.account.id === v.id) : undefined;
  const acc = existing?.account;
  const kind = acc?.kind ?? v.kind;
  const color = acc?.color ?? '';
  return `${header(acc ? '계정 편집' : `${KIND_LABEL[kind]}용 계정 추가`, { back: true })}
    <form class="scroll" id="account-form">
      <div class="group-title">이름</div>
      <div class="group"><input class="field" name="name" placeholder="${kind === 'work' ? '예: 회사' : '예: 개인 Max'}" value="${esc(acc?.name ?? '')}" maxlength="24" required/></div>

      <div class="group-title">Claude Code 설정 폴더</div>
      <div class="group">
        <div class="field-row">
          <input class="field" name="configDir" value="${esc(acc?.configDir ?? '')}" required spellcheck="false"/>
          <button type="button" class="btn-small" data-action="browse">찾기</button>
        </div>
      </div>
      <p class="footnote">계정마다 다른 폴더(CLAUDE_CONFIG_DIR)를 씁니다. 폴더가 없다면 아래 명령으로 그 계정에 로그인하면 만들어집니다.</p>

      <div class="group-title">색상</div>
      <div class="swatches">
        ${ACCOUNT_COLORS.map(
          (c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${color === c ? 'checked' : ''}/><span></span></label>`,
        ).join('')}
      </div>

      ${acc ? `<div class="group-title">실행 명령</div><div class="group pad">${commandBox(acc)}</div>` : ''}

      <button type="submit" class="btn btn-filled">${acc ? '저장' : '추가'}</button>
      ${
        acc
          ? `${existing!.bridge === 'installed' ? `<button type="button" class="btn btn-plain" data-action="uninstall" data-id="${acc.id}">상태줄 연결 해제</button>` : `<button type="button" class="btn btn-plain" data-action="install" data-id="${acc.id}">상태줄 연결</button>`}
             <button type="button" class="btn btn-destructive" data-action="remove" data-id="${acc.id}">계정 삭제</button>`
          : ''
      }
    </form>`;
}

// ---------- render loop ----------

function render(): void {
  if (!state) return;
  const now = Date.now();
  let html: string;
  if (view.name === 'settings') html = settingsView(state);
  else if (view.name === 'edit') html = editView(state, view);
  else html = homeView(state, now);
  if (toast) html += `<div class="toast ${toast.error ? 'error' : ''}">${esc(toast.text)}</div>`;
  app.innerHTML = html;
  requestAnimationFrame(() => api.resize(app.getBoundingClientRect().height));
}

async function openEdit(id: string | null, kind: AccountKind): Promise<void> {
  view = { name: 'edit', id, kind };
  render();
  if (!id) {
    const input = app.querySelector<HTMLInputElement>('input[name=configDir]');
    if (input) input.value = await api.defaultConfigDir(kind);
  }
  app.querySelector<HTMLInputElement>('input[name=name]')?.focus();
}

async function report(promise: Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
  const res = await promise;
  if (res.ok) {
    after?.();
    showToast(success);
  } else {
    showToast(res.error ?? '실패했습니다.', true);
  }
}

app.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const { action, id, kind, text } = el.dataset;
  switch (action) {
    case 'hide':
      api.hide();
      break;
    case 'settings':
      view = { name: 'settings' };
      render();
      break;
    case 'back':
      view = view.name === 'edit' ? { name: 'settings' } : { name: 'home' };
      render();
      break;
    case 'add':
      await openEdit(null, kind as AccountKind);
      break;
    case 'edit':
      await openEdit(id!, 'personal');
      break;
    case 'browse': {
      const dir = await api.pickDirectory();
      const input = app.querySelector<HTMLInputElement>('input[name=configDir]');
      if (dir && input) input.value = dir;
      break;
    }
    case 'copy':
      await api.copyText(text ?? '');
      showToast('복사했습니다');
      break;
    case 'install':
      await report(api.installBridge(id!), '상태줄을 연결했습니다');
      break;
    case 'uninstall':
      await report(api.uninstallBridge(id!), '연결을 해제했습니다');
      break;
    case 'remove':
      if (confirm('이 계정을 위젯에서 삭제할까요? 상태줄 설정은 원래대로 되돌립니다.')) {
        await report(api.removeAccount(id!), '삭제했습니다', () => (view = { name: 'settings' }));
      }
      break;
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (view.name !== 'edit') return;
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  const input = {
    name: String(data.get('name') ?? ''),
    configDir: String(data.get('configDir') ?? ''),
    color: (data.get('color') as string | null) ?? undefined,
  };
  const current = view;
  if (current.id) {
    await report(api.updateAccount(current.id, input), '저장했습니다', () => (view = { name: 'settings' }));
  } else {
    await report(api.addAccount({ ...input, kind: current.kind }), '추가했습니다', () => (view = { name: 'home' }));
  }
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.setting) void api.setSettings({ [el.dataset.setting]: el.checked });
});

async function init(): Promise<void> {
  state = await api.getState();
  document.documentElement.classList.add(`platform-${state.platform}`);
  render();
  api.onState((next) => {
    state = next;
    // Re-rendering a form would wipe what the user is typing.
    if (view.name !== 'edit') render();
  });
  // Countdowns.
  setInterval(() => {
    if (view.name === 'home') render();
  }, 1000);
}

void init();
