import { AccountCard } from '../components/AccountCard';
import { Header } from '../components/Header';
import { UsageRings } from '../components/UsageRings';
import { useNow } from '../hooks/useWidgetState';
import type { AccountKind, WidgetState } from '../../shared/types';

interface HomeViewProps {
  state: WidgetState;
  onSettings: () => void;
  onAdd: (kind: AccountKind) => void;
}

export function HomeView({ state, onSettings, onAdd }: HomeViewProps) {
  const now = useNow();
  const headerTitle = "클로드 사용량";

  if (state.accounts.length === 0) {
    return (
      <>
        <Header title={headerTitle} onSettings={onSettings} />
        <section className="card empty">
          <div className="empty-rings">
            <UsageRings
              size={76}
              outer={{ percent: 70, color: 'var(--blue)' }}
              inner={{ percent: 45, color: 'var(--blue)' }}
            />
          </div>
          <h2>계정을 추가해 보세요</h2>
          <p>업무용 1개, 개인용 3개까지 등록할 수 있어요. 인증 토큰은 읽지도, 전송하지도 않습니다.</p>
          <button className="btn btn-filled" onClick={() => onAdd('work')}>
            업무용 계정 추가
          </button>
          <button className="btn btn-plain" onClick={() => onAdd('personal')}>
            개인용 계정 추가
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <Header title={headerTitle} onSettings={onSettings} />
      {state.demo && <div className="demo">데모 데이터</div>}
      <div className="list">
        {state.accounts.map((v) => (
          <AccountCard key={v.account.id} view={v} platform={state.platform} now={now} />
        ))}
      </div>
    </>
  );
}
