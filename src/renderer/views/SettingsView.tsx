import { Header } from '../components/Header';
import { ChevronIcon, PlusIcon } from '../components/Icons';
import { api } from '../lib/api';
import { KIND_LABEL } from '../lib/usage';
import { ACCOUNT_LIMITS, type AccountKind, type WidgetSettings, type WidgetState } from '../../shared/types';

interface SettingsViewProps {
  state: WidgetState;
  onBack: () => void;
  onEdit: (id: string) => void;
  onAdd: (kind: AccountKind) => void;
}

export function SettingsView({ state, onBack, onEdit, onAdd }: SettingsViewProps) {
  const toggle = (key: keyof WidgetSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    void api.setSettings({ [key]: e.target.checked });

  const group = (kind: AccountKind) => {
    const items = state.accounts.filter((v) => v.account.kind === kind);
    const full = items.length >= ACCOUNT_LIMITS[kind];
    return (
      <>
        <div className="group-title">
          {KIND_LABEL[kind]}용 · {items.length}/{ACCOUNT_LIMITS[kind]}
        </div>
        <div className="group">
          {items.map(({ account, bridge }) => (
            <button key={account.id} className="row" onClick={() => onEdit(account.id)}>
              <i className="dot" style={{ background: account.color }} />
              <span className="row-text">
                <span>{account.name}</span>
                <small>{account.configDir}</small>
              </span>
              <span className={`row-status ${bridge === 'installed' ? 'ok' : ''}`}>
                {bridge === 'installed' ? '연결됨' : '미연결'}
              </span>
              <ChevronIcon />
            </button>
          ))}
          {!full && (
            <button className="row row-add" onClick={() => onAdd(kind)}>
              <PlusIcon />
              <span>{KIND_LABEL[kind]}용 계정 추가</span>
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <Header title="설정" onBack={onBack} />
      <div className="scroll">
        {group('work')}
        {group('personal')}

        <div className="group-title">위젯</div>
        <div className="group">
          <label className="row">
            <span className="row-text">
              <span>항상 위에 표시</span>
            </span>
            <input type="checkbox" className="switch" checked={state.settings.alwaysOnTop} onChange={toggle('alwaysOnTop')} />
          </label>
          <label className="row">
            <span className="row-text">
              <span>로그인 시 실행</span>
            </span>
            <input type="checkbox" className="switch" checked={state.settings.openAtLogin} onChange={toggle('openAtLogin')} />
          </label>
        </div>
        <p className="footnote">
          사용량은 각 계정의 Claude Code 상태줄 데이터(rate_limits)에서 읽습니다. 인증 정보는 읽거나 전송하지 않으며, 모든
          데이터는 이 기기 안에만 저장됩니다.
        </p>
      </div>
    </>
  );
}
