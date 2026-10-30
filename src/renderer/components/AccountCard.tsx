import { useState } from 'react';
import { api } from '../lib/api';
import { KIND_LABEL, levelColor } from '../lib/usage';
import { formatAgo, formatDuration, formatTokens } from '../../shared/format';
import { CommandBox } from './CommandBox';
import { RefreshIcon } from './Icons';
import { UsageBar } from './UsageBar';
import { useToast } from './Toast';
import type { AccountView, Platform, UsageWindow } from '../../shared/types';

interface MetricProps {
    label: string;
    window: UsageWindow;
    color: string;
    now: number;
}

function Metric({ label, window: w, color, now }: MetricProps) {
    let sub = '정보 없음';
    if (w.hasReset) sub = '초기화됨';
    else if (w.resetsAt) sub = `${formatDuration(w.resetsAt - now)} 후 초기화`;
    return (
        <div className="metric">
            <div className="metric-top">
                <span className="metric-label">{label}</span>
                <span className="metric-value">
          {w.percent === null ? '—' : <>{Math.round(w.percent)}<small>%</small></>}
        </span>
            </div>
            <UsageBar percent={w.percent} color={color} />
            <div className="metric-sub">{sub}</div>
        </div>
    );
}

const BRIDGE_HINT = {
    'no-config-dir': '설정 폴더가 아직 없습니다. 아래 명령으로 이 계정에 로그인해 주세요.',
    'invalid-settings': 'settings.json 형식이 올바르지 않아 연결할 수 없습니다.',
    missing: 'Claude Code 상태줄과 연결하면 사용량이 표시됩니다.',
} as const;

interface AccountCardProps {
    view: AccountView;
    platform: Platform;
    now: number;
}

/** One account on the home screen: setup hints until data arrives, then bars and numbers. */
export function AccountCard({ view: v, platform, now }: AccountCardProps) {
    const toast = useToast();
    const { account } = v;
    const [refreshing, setRefreshing] = useState(false);

    const refresh = async () => {
        setRefreshing(true);
        await toast.report(api.refreshUsage(account.id), '사용량을 갱신했습니다');
        setRefreshing(false);
    };

    const head = (
        <div className="card-head">
            <span className="name">{account.name}</span>
            <span className={`chip chip-${account.kind}`}>{KIND_LABEL[account.kind]}</span>
            <span className="spacer" />
            {v.capturedAt && <span className="ago">{formatAgo(now - v.capturedAt)}</span>}
            {v.bridge !== 'no-config-dir' && (
                <button
                    className={`icon-btn refresh-btn ${refreshing ? 'spinning' : ''}`}
                    onClick={refresh}
                    disabled={refreshing}
                    aria-label="지금 갱신"
                    title="지금 갱신 (Claude Code로 아주 짧은 요청을 한 번 보냅니다)"
                >
                    <RefreshIcon />
                </button>
            )}
        </div>
    );

    // Without the status line, a manual refresh can still provide numbers.
    if (v.bridge !== 'installed' && !v.capturedAt) {
        const canInstall = v.bridge === 'missing' || v.bridge === 'no-config-dir';
        return (
            <section className="card">
                {head}
                <p className="hint">{BRIDGE_HINT[v.bridge]}</p>
                {v.bridge === 'no-config-dir' && <CommandBox account={account} platform={platform} />}
                {canInstall && (
                    <button
                        className="btn btn-tinted"
                        onClick={() => toast.report(api.installBridge(account.id), '상태줄을 연결했습니다')}
                    >
                        상태줄 연결
                    </button>
                )}
            </section>
        );
    }

    if (!v.capturedAt) {
        return (
            <section className="card">
                {head}
                <p className="hint">
                    {v.noRateLimits
                        ? '이 계정은 한도 정보를 제공하지 않습니다. Pro / Max 구독 계정에서만 표시됩니다.'
                        : '연결됨. 이 계정으로 Claude Code에서 메시지를 보내거나 오른쪽 위 ↻ 버튼을 누르면 표시됩니다.'}
                </p>
                {!v.noRateLimits && <CommandBox account={account} platform={platform} />}
            </section>
        );
    }

    return (
        <section className="card">
            {head}
            <div className="metrics">
                <Metric label="현재 세션 (5시간)" window={v.fiveHour} color={levelColor(v.fiveHour.percent, account.color)} now={now} />
                <Metric label="주간 (7일)" window={v.sevenDay} color={levelColor(v.sevenDay.percent, account.color)} now={now} />
            </div>
            {v.tokens && (
                <div className="foot">
                    토큰 · 5시간 {formatTokens(v.tokens.fiveHour)} · 7일 {formatTokens(v.tokens.sevenDay)}
                </div>
            )}
        </section>
    );
}
