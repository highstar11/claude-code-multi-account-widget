import { api } from '../lib/api';
import { launchCommand } from '../lib/usage';
import { useToast } from './Toast';
import { CopyIcon } from './Icons';
import type { Account, Platform } from '../../shared/types';

/** Click-to-copy command that starts Claude Code with this account. */
export function CommandBox({ account, platform }: { account: Account; platform: Platform }) {
  const toast = useToast();
  const cmd = launchCommand(account, platform);
  const copy = async () => {
    await api.copyText(cmd);
    toast.show('복사했습니다');
  };
  return (
    <button className="cmd" onClick={copy} title="복사">
      <code>{cmd}</code>
      <CopyIcon />
    </button>
  );
}
