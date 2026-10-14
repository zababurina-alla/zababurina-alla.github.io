// Оболочка: левое меню на ноутбуке; верхняя полоса, нижние вкладки и кнопка «+» на телефоне.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { TODAY, daysBetween } from '../lib/dates';
import { soundSettings } from '../lib/sound';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import type { RouteName } from '../router';
import { navigate, toHash } from '../router';
import { useUi } from './ui-context';

const NAV: { id: RouteName; label: string; icon: IconName; group: 'work' | 'ref' }[] = [
  { id: 'today', label: 'Сегодня', icon: 'today', group: 'work' },
  { id: 'clients', label: 'Клиенты', icon: 'clients', group: 'work' },
  { id: 'deadlines', label: 'Сроки', icon: 'calendar', group: 'work' },
  { id: 'payments', label: 'Платежи', icon: 'wallet', group: 'work' },
  { id: 'tasks', label: 'Задачи', icon: 'tasks', group: 'work' },
  { id: 'keys', label: 'Ключи ЭЦП', icon: 'key', group: 'ref' },
  { id: 'reference', label: 'Справочник', icon: 'book', group: 'ref' },
];
const PHONE_NAV: RouteName[] = ['today', 'clients', 'deadlines', 'payments'];

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem('sverka.theme', next); } catch { /* не запомнится — не страшно */ }
    setTheme(next);
  };
  return [theme, toggle];
}

/** Честный статус связи с таблицей: сколько записей ещё не в таблице и почему. */
function SyncStatus() {
  const { pending, online } = useStore();
  const failed = pending.filter((p) => p.state === 'failed' || p.state === 'conflict').length;
  const waiting = pending.length - failed;
  const state = failed ? 'is-failed' : !online && waiting ? 'is-offline' : waiting ? 'is-saving' : '';
  const text = failed ? `Не сохранилось: ${failed}`
    : !online && waiting ? `Нет связи — ждут отправки: ${waiting}`
      : waiting ? `Сохраняется в таблицу: ${waiting}` : !online ? 'Нет связи с таблицей' : 'Всё сохранено в таблице';
  return (
    <p className={`sync ${state}`} role="status">
      <span className="sync__dot" aria-hidden="true" />
      <span className="sync__text">{text}</span>
    </p>
  );
}

export function Shell({ route, children }: { route: RouteName; children: ReactNode }) {
  const { deadlines } = useStore();
  const ui = useUi();
  const [theme, toggleTheme] = useTheme();
  const [soundOn, setSoundOn] = useState(soundSettings.on);
  const overdue = deadlines.filter((d) => daysBetween(TODAY, d.due) < 0).length;
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Подсветка выбранного раздела переезжает к новому пункту (transform, 280 мс) — видно, куда перешли.
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.nav__item[aria-current="page"]');
    const pill = pillRef.current;
    if (!pill) return;
    if (!active) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.transform = `translateY(${active.offsetTop}px)`;
  }, [route]);

  // Горячие клавиши (ноутбук): Alt+N — платёж, Ctrl+K или «/» — поиск клиента. Без анимации: действие частое.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.altKey && (e.code === 'KeyN')) { e.preventDefault(); ui.openPayment(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); ui.openPalette(); }
      if (!typing && e.key === '/') { e.preventDefault(); navigate('#/clients/search'); }
    };
    // Переходы по ссылкам «#/…» внутри приложения — с плавной сменой экрана.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/"]');
      if (!a) return;
      e.preventDefault();
      navigate(a.getAttribute('href') ?? '#/today');
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [ui]);

  const navLink = (n: (typeof NAV)[number]) => (
    <a key={n.id} href={toHash({ name: n.id, params: [] })} className="nav__item" aria-current={route === n.id ? 'page' : undefined}>
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {n.id === 'deadlines' && overdue > 0 && <span className="nav__badge num" aria-label={`просрочено ${overdue}`}>{overdue}</span>}
    </a>
  );

  return (
    <div className="shell">
      <aside className="rail" aria-label="Меню">
        <a href="#/today" className="brand" aria-label="Сверка — на главную">
          <span className="brand__mark" aria-hidden="true">С</span>
          <span className="brand__name">Сверка</span>
        </a>
        <button type="button" className="btn btn--primary rail__cta" onClick={() => ui.openPayment()} aria-keyshortcuts="Alt+N">
          <Icon name="plus" />Записать платёж<kbd className="kbd kbd--on-accent">Alt N</kbd>
        </button>
        <nav ref={navRef} className="nav" aria-label="Разделы">
          <span ref={pillRef} className="nav__pill" aria-hidden="true" />
          {NAV.filter((n) => n.group === 'work').map(navLink)}
          <p className="nav__group">Справка</p>
          {NAV.filter((n) => n.group === 'ref').map(navLink)}
        </nav>
        <div className="rail__foot">
          <SyncStatus />
          <div className="rail__tools">
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button type="button" className="icon-btn" aria-pressed={soundOn}
              onClick={() => { soundSettings.on = !soundOn; setSoundOn(!soundOn); }} aria-label={soundOn ? 'Выключить звуки' : 'Включить звуки'}>
              <Icon name={soundOn ? 'sound' : 'soundOff'} />
            </button>
            <span className="me"><span className="avatar avatar--sm" aria-hidden="true">АЕ</span><span className="me__text">Вход через Google</span></span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <a href="#/today" className="brand"><span className="brand__mark" aria-hidden="true">С</span><span className="brand__name">Сверка</span></a>
        <div className="topbar__tools">
          <SyncStatus />
          <a href="#/clients/search" className="icon-btn" aria-label="Поиск клиента"><Icon name="search" /></a>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      <main className="main" id="main">
        <div key={route} className="screen">{children}</div>
      </main>

      <button type="button" className="fab" onClick={() => ui.openPayment()} aria-label="Записать платёж"><Icon name="plus" size={26} /></button>

      <nav className="tabbar" aria-label="Разделы">
        {PHONE_NAV.map((id) => {
          const n = NAV.find((x) => x.id === id);
          if (!n) return null;
          return (
            <a key={id} href={toHash({ name: id, params: [] })} className="tabbar__item" aria-current={route === id ? 'page' : undefined}>
              <span className="tabbar__icon"><Icon name={n.icon} />{id === 'deadlines' && overdue > 0 && <span className="tabbar__badge" aria-hidden="true" />}</span>
              <span>{n.label}</span>
            </a>
          );
        })}
        <a href="#/more" className="tabbar__item" aria-current={route === 'more' || route === 'keys' || route === 'reference' || route === 'tasks' ? 'page' : undefined}>
          <span className="tabbar__icon"><Icon name="more" /></span><span>Ещё</span>
        </a>
      </nav>
    </div>
  );
}
