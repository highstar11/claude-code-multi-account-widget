import { useEffect, useRef, useState } from 'react';
import { useAutoResize } from './hooks/useAutoResize';
import { useWidgetState } from './hooks/useWidgetState';
import { EditView } from './views/EditView';
import { HomeView } from './views/HomeView';
import { SettingsView } from './views/SettingsView';
import type { AccountKind } from '../shared/types';

/** Which screen is showing. Add a new screen here and in the switch below. */
type Route = { name: 'home' } | { name: 'settings' } | { name: 'edit'; id: string | null; kind: AccountKind };

export function App() {
  const state = useWidgetState();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const rootRef = useRef<HTMLDivElement>(null);
  useAutoResize(rootRef);

  // Platform-specific styles hang off <html class="platform-mac | platform-win">.
  useEffect(() => {
    if (state) document.documentElement.classList.add(`platform-${state.platform}`);
  }, [state?.platform]);

  const goHome = () => setRoute({ name: 'home' });
  const goSettings = () => setRoute({ name: 'settings' });
  const add = (kind: AccountKind) => setRoute({ name: 'edit', id: null, kind });
  const edit = (id: string) => setRoute({ name: 'edit', id, kind: 'personal' });

  return (
    <div ref={rootRef} className="widget">
      {state &&
        (route.name === 'settings' ? (
          <SettingsView state={state} onBack={goHome} onEdit={edit} onAdd={add} />
        ) : route.name === 'edit' ? (
          <EditView
            // Remount when switching accounts so the form starts fresh.
            key={route.id ?? `new-${route.kind}`}
            state={state}
            id={route.id}
            kind={route.kind}
            onBack={goSettings}
            onDone={(added) => (added ? goHome() : goSettings())}
          />
        ) : (
          <HomeView state={state} onSettings={goSettings} onAdd={add} />
        ))}
    </div>
  );
}
