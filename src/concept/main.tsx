// Макеты этапа 1. Параметры адреса: ?screen=today|clients|card|deadlines|payment&theme=light|dark&dir=stamp|graphite
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import './concept.css';
import { ClientsScreen, DeadlinesScreen, PaymentScreen, Shell, TodayScreen } from './screens';
import type { Screen } from './screens';
import { ShtilToday } from './dirs/Shtil';
import { TabloToday } from './dirs/Tablo';
import { PapkaToday } from './dirs/Papka';
import { FintechToday, GlassToday, ProToday, SwissToday } from './styles/Styles';

const params = new URLSearchParams(window.location.search);
const SCREENS: Screen[] = ['today', 'clients', 'card', 'deadlines', 'payment'];
const initial = (SCREENS as string[]).includes(params.get('screen') ?? '') ? (params.get('screen') as Screen) : 'today';

const root = document.documentElement;
const theme = params.get('theme');
root.dataset.theme = theme === 'dark' || theme === 'light'
  ? theme
  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const dir = params.get('dir') ?? '';
if (['graphite', 'shtil', 'tablo', 'papka', 'fintech', 'pro', 'glass', 'swiss'].includes(dir)) root.dataset.direction = dir;
const STYLE_SCREENS: Record<string, () => React.JSX.Element> = {
  shtil: ShtilToday, tablo: TabloToday, papka: PapkaToday,
  fintech: FintechToday, pro: ProToday, glass: GlassToday, swiss: SwissToday,
};
const DirToday = STYLE_SCREENS[dir] ?? TodayScreen;

function Concept() {
  const [screen, setScreen] = useState<Screen>(initial);
  const go = (s: Screen) => {
    setScreen(s);
    const p = new URLSearchParams(window.location.search);
    p.set('screen', s);
    window.history.replaceState(null, '', `?${p.toString()}`);
  };
  return (
    <Shell screen={screen} go={go}>
      {screen === 'today' && <DirToday />}
      {(screen === 'clients' || screen === 'card') && <ClientsScreen screen={screen} go={go} />}
      {screen === 'deadlines' && <DeadlinesScreen />}
      {screen === 'payment' && <PaymentScreen go={go} />}
    </Shell>
  );
}

const el = document.getElementById('root');
if (!el) throw new Error('Нет элемента #root');
createRoot(el).render(
  <StrictMode>
    <Concept />
  </StrictMode>,
);
