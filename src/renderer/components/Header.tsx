import { api } from '../lib/api';
import { BackIcon, CloseIcon, GearIcon } from './Icons';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  onSettings?: () => void;
}

/** Top bar. Doubles as the window's drag handle. */
export function Header({ title, onBack, onSettings }: HeaderProps) {
  return (
    <header className="bar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          <BackIcon />
        </button>
      )}
      <h1>{title}</h1>
      <span className="spacer" />
      {onSettings && (
        <button className="icon-btn" onClick={onSettings} aria-label="설정">
          <GearIcon />
        </button>
      )}
      <button className="icon-btn" onClick={() => api.hide()} aria-label="숨기기">
        <CloseIcon />
      </button>
    </header>
  );
}
