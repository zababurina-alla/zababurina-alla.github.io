// Оболочка: плавающее стеклянное меню слева на ноутбуке; верхняя полоса, нижние вкладки и кнопка «+» на телефоне.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { hasFeature } from '../config';
import { auth, useAuth } from '../data/session';
import { roAttrs } from '../ui/readonly';
import { getTheme, subscribeTheme, toggleTheme } from '../lib/theme';
import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { TODAY, daysBetween } from '../lib/dates';
import { play, soundSettings } from '../lib/sound';
import type { SoundMode } from '../lib/sound';
import { RollingNumber } from '../ui/kit';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import type { RouteName } from '../router';
import { navigate, toHash } from '../router';
import { useUi } from './ui-context';
import { demoWords, readOnlyAreas, visibleAreas } from '../config';
import '../ui/fx';
import { BrandMark } from '../ui/BrandMark';

const NAV: { id: RouteName; label: string; icon: IconName; group: 'work' | 'ref' }[] = [
  { id: 'today', label: 'Сегодня', icon: 'today', group: 'work' },
  { id: 'inbox', label: 'Входящие', icon: 'message', group: 'work' },
  { id: 'clients', label: 'Клиенты', icon: 'clients', group: 'work' },
  { id: 'deadlines', label: 'Сроки', icon: 'calendar', group: 'work' },
  { id: 'payments', label: 'Платежи', icon: 'wallet', group: 'work' },
  { id: 'tasks', label: 'Задачи', icon: 'tasks', group: 'work' },
  { id: 'keys', label: 'Ключи ЭЦП', icon: 'key', group: 'ref' },
  { id: 'reference', label: 'Справочник', icon: 'book', group: 'ref' },
  // «Помощь» — словом в меню, а не значком внизу без подписи (приёмка 16.10, С-10)
  { id: 'help', label: 'Помощь', icon: 'help', group: 'ref' },
];
const PHONE_NAV: RouteName[] = ['today', 'clients', 'deadlines', 'payments'];

export function useTheme(): [string, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  return [theme, toggleTheme];
}

const SOUND_MODES: { id: SoundMode; label: string }[] = [
  { id: 'on', label: 'Вкл' }, { id: 'night', label: 'Ночью тихо' }, { id: 'off', label: 'Выкл' },
];

/** Звук: режим (вкл / ночью тихо 22–7 / выкл), громкость, «Проверить». Настройка — удобство этого браузера (localStorage). */
export function SoundSettings() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SoundMode>(soundSettings.mode);
  const [vol, setVol] = useState(Math.round(soundSettings.volume * 100));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const label = mode === 'off' ? 'выключен' : mode === 'night' ? `ночью тихо, ${vol} %` : `включён, ${vol} %`;
  return (
    <div ref={ref} className="pop-wrap">
      <button type="button" className="icon-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
        aria-label={`Звук: ${label}`} title={`Звук: ${label}`}>
        <Icon name={mode === 'off' ? 'soundOff' : 'sound'} />
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Звук">
          <p className="pop__title">Звук</p>
          <div className="seg seg--fill" role="group" aria-label="Когда звучит">
            {SOUND_MODES.map((m) => (
              <button key={m.id} type="button" className="seg__opt" aria-pressed={mode === m.id}
                onClick={() => { soundSettings.mode = m.id; setMode(m.id); }}>{m.label}</button>
            ))}
          </div>
          <p className="sub">{mode === 'night' ? 'С 22:00 до 7:00 — тишина.' : mode === 'on' ? 'Звучит всегда, только в ответ на ваши действия.' : 'Без звуков.'}</p>
          <label className="pop__range">
            <span>Громкость <strong className="num">{vol} %</strong></span>
            <input type="range" min={0} max={100} step={5} value={vol} disabled={mode === 'off'}
              onChange={(e) => { const v = Number(e.target.value); setVol(v); soundSettings.volume = v / 100; }} />
          </label>
          <button type="button" className="btn btn--secondary btn--sm" disabled={mode === 'off'} onClick={() => play('closed', true)}>Проверить звук</button>
        </div>
      )}
    </div>
  );
}

/** «Закрыто сегодня»: сюда улетает закрытый срок (closeFx.flyToCounter — в тот счётчик, что виден). */
function ClosedCounter({ compact = false }: { compact?: boolean }) {
  const { closed } = useStore();
  return (
    <a href="#/deadlines/closed" className={`closed-chip${compact ? ' closed-chip--compact' : ''}${closed.length ? ' is-on' : ''}`} data-closed-counter
      aria-label={`Закрыто сегодня: ${closed.length}`} title="Закрыто сегодня">
      <span className="closed-chip__tick" aria-hidden="true"><Icon name="check" size={14} /></span>
      {!compact && <span className="closed-chip__label">Закрыто сегодня</span>}
      <RollingNumber value={closed.length} className="closed-chip__n" />
    </a>
  );
}

/** Честный статус связи с таблицей: сколько записей ещё не в таблице и почему. */
// Ответ таблицы может идти до 10–12 с (оценка архитектора «Мамы CRM», не замер): после 5 с говорим, что всё в порядке.
const SLOW_HINT_MS = 5000;

function SyncStatus() {
  const { pending, online, loaded, stale } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const sending = pending.some((p) => p.state === 'sending');
  useEffect(() => {
    if (!sending) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [sending]);
  const slow = pending.some((p) => p.state === 'sending' && p.sentAt && now - p.sentAt > SLOW_HINT_MS);
  const failed = pending.filter((p) => p.state === 'failed' || p.state === 'conflict').length;
  const waiting = pending.length - failed;
  // Сервер попросил подождать (ночное обслуживание, занято) — говорим его словами.
  const waitReason = online ? pending.find((p) => p.state === 'queued' && p.error)?.error : undefined;
  // Пока снимок не пришёл — не «всё сохранено», а «связываемся»; когда запись выключена во всех разделах — честно
  // «только просмотр» (находка «Пользователя» № 10). Очередь и ошибки важнее — их показываем как раньше.
  // С видимыми разделами, а не со всеми: «Входящие» за флагом на живом сайте не видны (иначе 5 ≠ 6 и «всё сохранено»).
  const readOnly = readOnlyAreas().length === visibleAreas().length;
  // Снимок из прошлой загрузки вкладки на экране — «обновляем», пока свежий не пришёл (п. 20).
  if (!pending.length && online && (!loaded || stale || readOnly)) {
    const busy = !loaded || stale;
    return (
      <p className={`sync ${busy ? 'is-saving' : 'is-readonly'}`} role="status">
        <span className="sync__dot" aria-hidden="true" />
        <span className="sync__text">{!loaded ? 'Связываемся с таблицей…' : stale ? 'Обновляем из таблицы…' : 'Только просмотр'}</span>
      </p>
    );
  }
  // Нет связи — точка не зелёная, даже когда ничего не ждёт отправки (находка № 4).
  const state = failed ? 'is-failed' : !online ? 'is-offline' : waiting ? 'is-saving' : '';
  const text = failed ? `Не сохранилось: ${failed}`
    : !online && waiting ? `Нет связи — ждут отправки: ${waiting}`
      : waitReason ? waitReason
      : slow ? 'Таблица отвечает дольше обычного — запись не потеряется'
        : waiting ? `Сохраняется в таблицу: ${waiting}` : !online ? 'Нет связи с таблицей' : 'Всё сохранено в таблице';
  return (
    <p className={`sync ${state}`} role="status">
      <span className="sync__dot" aria-hidden="true" />
      <span className="sync__text">{demoWords(text)}</span>
    </p>
  );
}

/** Кто вошёл. На выдуманных данных — честная пометка вместо пользователя. */
// Профиль внизу меню (владелец 17.10: голая ссылка «Выйти» — «это премиум?»): аватар, имя и значок выхода.
// Выход — в два нажатия: значок → красная «Выйти?» на 4 секунды; Esc, уход фокуса или время — отмена.
export function Me({ tools }: { tools?: ReactNode } = {}) {
  const state = useAuth();
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = window.setTimeout(() => setSure(false), 4000);
    return () => window.clearTimeout(t);
  }, [sure]);
  if (!auth || !state.user) {
    return (
      <span className="me">
        <span className="avatar avatar--sm" aria-hidden="true">Д</span>
        <span className="me__who"><span className="me__text">Выдуманные данные</span><span className="me__sub">учебный режим</span></span>
        {tools && <span className="me__tools">{tools}</span>}
      </span>
    );
  }
  const initials = state.user.name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  return (
    <span className="me">
      <span className="avatar avatar--sm" aria-hidden="true">{initials}</span>
      <span className="me__who"><span className="me__text">{state.user.name}</span></span>
      {tools && <span className="me__tools">{tools}</span>}
      {sure ? (
        <button type="button" className="btn btn--danger btn--sm me__out" autoFocus onClick={() => auth?.signOut()}
          onBlur={() => setSure(false)} onKeyDown={(e) => { if (e.key === 'Escape') setSure(false); }}>Выйти?</button>
      ) : (
        <button type="button" className="icon-btn me__out" aria-label="Выйти из кабинета" title="Выйти из кабинета"
          onClick={() => setSure(true)}><Icon name="logout" /></button>
      )}
    </span>
  );
}

export function Shell({ route, children }: { route: RouteName; children: ReactNode }) {
  const { deadlines, inbox } = useStore();
  const inboxNew = inbox.filter((i) => i.status === 'new').length;
  const ui = useUi();
  const [theme, toggleTheme] = useTheme();
  const overdue = deadlines.filter((d) => daysBetween(TODAY, d.due) < 0).length;
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Подсветка выбранного раздела переезжает к новому пункту пружиной (только transform) — видно, куда перешли.
  // Высота — по пункту: на ноутбуке пункты 38 и 34 px (Р-4), а подсветка была 44 — выше пункта на 6–10 px, слово
  // не по центру, низ наезжал на соседний пункт (17.10). Окно сменило высоту — пункты другие, подсветка следом.
  // Меню и при смене размера окна: открыли узким (меню скрыто, offsetTop 0), растянули — подсветка стояла на
  // «Сегодня», а открыт другой раздел (проход 22.10).
  useLayoutEffect(() => {
    const nav = navRef.current, pill = pillRef.current;
    if (!nav || !pill) return;
    const place = () => {
      if (!nav.offsetHeight) return; // меню скрыто (телефон) — подсветку не трогаем, встанет при показе
      const active = nav.querySelector<HTMLElement>('.nav__item[aria-current="page"]');
      if (!active) { pill.style.opacity = '0'; return; }
      pill.style.opacity = '1';
      pill.style.transform = `translateY(${active.offsetTop}px)`;
      pill.style.height = `${active.offsetHeight}px`;
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [route]);

  // Горячие клавиши (ноутбук): Alt+N — платёж, Ctrl+K или «/» — поиск клиента. Без анимации: действие частое.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.altKey && (e.code === 'KeyN')) { e.preventDefault(); ui.openPayment(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); ui.openPalette(); }
      // F1 — «Помощь» (находка «Пользователя» № 17); браузерную справку не открываем.
      if (e.key === 'F1') { e.preventDefault(); navigate('#/help'); }
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

  // Шапка телефона: после прокрутки — тень под стеклом (класс на <html>, одно чтение на кадр).
  // Кнопка «+» на телефоне закрывала время, суммы и значки под собой (проход 22.10, № 2): листаем вниз — она уходит,
  // чуть вверх или к началу — возвращается. Внизу страницы запас 9rem, там она ничего не закрывает — тоже видна.
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const root = document.documentElement;
        root.classList.toggle('is-scrolled', y > 8);
        const atEnd = y + window.innerHeight >= root.scrollHeight - 8;
        if (y < 80 || atEnd || y < lastY - 4) root.classList.remove('fab-away');
        else if (y > lastY + 4) root.classList.add('fab-away');
        if (Math.abs(y - lastY) > 4) lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf);
      document.documentElement.classList.remove('fab-away'); // вышли и вошли снова — «+» видна, а не спрятана
    };
  }, []);

  // Подпись — действие, а не состояние: «Светлая тема» на светлой читалась как «сейчас светлая» (приёмка М-5)
  const themeLabel = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
  const navLink = (n: (typeof NAV)[number]) => (
    <a key={n.id} href={toHash({ name: n.id, params: [] })} className="nav__item" aria-current={route === n.id ? 'page' : undefined}>
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {n.id === 'deadlines' && overdue > 0 && <span className="nav__badge num" title="Просрочено"><span aria-hidden="true">{overdue}</span><span className="visually-hidden">, просрочено: {overdue}</span></span>}
      {n.id === 'inbox' && inboxNew > 0 && <span className="nav__badge num" title="Ждут решения"><span aria-hidden="true">{inboxNew}</span><span className="visually-hidden">, ждут решения: {inboxNew}</span></span>}
    </a>
  );

  return (
    <div className="shell">
      <button type="button" className="skip" onClick={() => document.getElementById('main')?.focus()}>К содержимому</button>
      <aside className="rail" aria-label="Меню">
        <a href="#/today" className="brand" aria-label="Бухгалтерия — на главную">
          <BrandMark />
          <span className="brand__name">Бухгалтерия</span>
        </a>
        <SyncStatus />
        <button type="button" className="btn btn--primary rail__cta" onClick={() => ui.openPayment()} aria-keyshortcuts="Alt+N" {...roAttrs('payments')}>
          <Icon name="plus" />Записать платёж<kbd className="kbd kbd--on-btn">Alt N</kbd>
        </button>
        <button type="button" className="search-field rail__search" onClick={ui.openPalette} aria-keyshortcuts="Control+K">
          <Icon name="search" /><span>Найти клиента</span><kbd className="kbd">Ctrl K</kbd>
        </button>
        <nav ref={navRef} className="nav" aria-label="Разделы">
          <span ref={pillRef} className="nav__pill" aria-hidden="true" />
          {NAV.filter((n) => n.group === 'work' && (n.id !== 'inbox' || hasFeature('inbox'))).map(navLink)}
          <p className="nav__group">Справка</p>
          {NAV.filter((n) => n.group === 'ref').map(navLink)}
        </nav>
        <div className="rail__foot">
          <ClosedCounter />
          {/* Профиль одной карточкой: кто вошёл, тема и звук значками, выход — меню целиком на 800 px (Р-4) */}
          <Me tools={<>
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <SoundSettings />
          </>} />
        </div>
      </aside>

      <header className="topbar">
        <a href="#/today" className="brand" aria-label="Бухгалтерия — на главную"><BrandMark /><span className="brand__name">Бухгалтерия</span></a>
        <div className="topbar__tools">
          <SyncStatus />
          <ClosedCounter compact />
          <a href="#/clients/search" className="icon-btn" aria-label="Поиск клиента"><Icon name="search" /></a>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={themeLabel}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      <main className="main" id="main" tabIndex={-1}>
        <div key={route} className="screen">{children}</div>
      </main>

      {/* На «Ещё» записывать нечего, а «+» закрывал нижний лист (находка № 25) */}
      {route !== 'more' && <button type="button" className="fab" onClick={() => ui.openPayment()} aria-label="Записать платёж" {...roAttrs('payments')}><Icon name="plus" size={26} /></button>}

      <nav className="tabbar" aria-label="Разделы">
        {PHONE_NAV.map((id) => {
          const n = NAV.find((x) => x.id === id);
          if (!n) return null;
          return (
            <a key={id} href={toHash({ name: id, params: [] })} className="tabbar__item" aria-current={route === id ? 'page' : undefined}>
              <span className="tabbar__icon"><Icon name={n.icon} />{id === 'deadlines' && overdue > 0 && <><span className="tabbar__badge" aria-hidden="true" /><span className="visually-hidden">, просрочено: {overdue}</span></>}</span>
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
