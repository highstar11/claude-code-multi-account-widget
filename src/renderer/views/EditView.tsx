import { useEffect, useState, type FormEvent } from 'react';
import { CommandBox } from '../components/CommandBox';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { KIND_LABEL } from '../lib/usage';
import { ACCOUNT_COLORS, type AccountKind, type WidgetState } from '../../shared/types';

interface EditViewProps {
  state: WidgetState;
  /** null when adding a new account. */
  id: string | null;
  kind: AccountKind;
  onBack: () => void;
  onDone: (added: boolean) => void;
}

/** Add or edit one account. */
export function EditView({ state, id, kind: newKind, onBack, onDone }: EditViewProps) {
  const toast = useToast();
  const existing = id ? state.accounts.find((v) => v.account.id === id) : undefined;
  const account = existing?.account;
  const kind = account?.kind ?? newKind;

  const [name, setName] = useState(account?.name ?? '');
  const [configDir, setConfigDir] = useState(account?.configDir ?? '');
  const [color, setColor] = useState<string | undefined>(account?.color);

  // Suggest a folder for a new account (~/.claude for work, ~/.claude-personal… for personal).
  useEffect(() => {
    if (!account) void api.defaultConfigDir(kind).then((dir) => setConfigDir((cur) => cur || dir));
  }, [account, kind]);

  const browse = async () => {
    const dir = await api.pickDirectory();
    if (dir) setConfigDir(dir);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = { name, configDir, color };
    if (account) {
      if (await toast.report(api.updateAccount(account.id, input), '저장했습니다')) onDone(false);
    } else if (await toast.report(api.addAccount({ ...input, kind }), '추가했습니다')) {
      onDone(true);
    }
  };

  const remove = async () => {
    if (!account) return;
    if (!confirm('이 계정을 위젯에서 삭제할까요? 상태줄 설정은 원래대로 되돌립니다.')) return;
    if (await toast.report(api.removeAccount(account.id), '삭제했습니다')) onDone(false);
  };

  return (
    <>
      <Header title={account ? '계정 편집' : `${KIND_LABEL[kind]}용 계정 추가`} onBack={onBack} />
      <form className="scroll" id="account-form" onSubmit={submit}>
        <div className="group-title">이름</div>
        <div className="group">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'work' ? '예: 회사' : '예: 개인 Max'}
            maxLength={24}
            required
            autoFocus
          />
        </div>

        <div className="group-title">Claude Code 설정 폴더</div>
        <div className="group">
          <div className="field-row">
            <input
              className="field"
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
              required
              spellCheck={false}
            />
            <button type="button" className="btn-small" onClick={browse}>
              찾기
            </button>
          </div>
        </div>
        <p className="footnote">
          계정마다 다른 폴더(CLAUDE_CONFIG_DIR)를 씁니다. 폴더가 없다면 아래 명령으로 그 계정에 로그인하면 만들어집니다.
        </p>

        <div className="group-title">색상</div>
        <div className="swatches">
          {ACCOUNT_COLORS.map((c) => (
            <label key={c} className="swatch" style={{ '--c': c } as React.CSSProperties}>
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} />
              <span />
            </label>
          ))}
        </div>

        {account && (
          <>
            <div className="group-title">실행 명령</div>
            <div className="group pad">
              <CommandBox account={account} platform={state.platform} />
            </div>
          </>
        )}

        <button type="submit" className="btn btn-filled">
          {account ? '저장' : '추가'}
        </button>
        {account && existing && (
          <>
            {existing.bridge === 'installed' ? (
              <button
                type="button"
                className="btn btn-plain"
                onClick={() => toast.report(api.uninstallBridge(account.id), '연결을 해제했습니다')}
              >
                상태줄 연결 해제
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-plain"
                onClick={() => toast.report(api.installBridge(account.id), '상태줄을 연결했습니다')}
              >
                상태줄 연결
              </button>
            )}
            <button type="button" className="btn btn-destructive" onClick={remove}>
              계정 삭제
            </button>
          </>
        )}
      </form>
    </>
  );
}
