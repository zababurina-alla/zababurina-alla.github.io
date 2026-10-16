// Командная строка (Ctrl+K): найти клиента, раздел или действие и выполнить с клавиатуры.
// Открывается мгновенно, без анимации: действие частое и с клавиатуры (правило навыка animate).
// Пустая строка (владелец 16.10: «Найти клиента» открывает смесь действий и разделов) — сначала клиенты: недавно
// открытые отсюда, потом те, по кому последние платежи; ниже два частых действия. Разделы — только при наборе.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { kindLabel } from '../data/fake';
import { fold, search } from '../lib/search';
import { splitFieldQuery } from '../lib/fieldQuery';
import type { ClientField } from '../lib/fieldQuery';
import type { Client } from '../data/types';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { useUi } from './ui-context';
import { TODAY, daysBetween, daysLabel, fmtDate } from '../lib/dates';
import { formatPayMoney } from '../lib/money';
import { obligationKind } from '../lib/obligation';
import { OBLIGATION_ICON } from '../ui/obligationIcon';
import { shortName } from '../ui/names';
import { splitEmoji } from '../ui/TableText';


interface Item { id: string; group: string; label: string; hint?: string | undefined; icon: IconName; run: () => void }

// Недавно открытые из поиска клиенты — только в этом браузере, только номера строк (не данные клиента)
const RECENT_KEY = 'palette.recent';
const RECENT_MAX = 6;
function readRecent(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
function rememberRecent(id: string): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX))); } catch { /* хранилище закрыто — без «недавних» */ }
}

/** «ромашко ключ» — в строке клиента сразу нужное поле (пароль не показываем: только «Показать» в карточке). */
function fieldHint(c: Client, f: ClientField): string {
  if (f === 'key') return c.keyUntil ? `ключ до ${fmtDate(c.keyUntil)}` : c.keyIssuer.trim() ? 'срок ключа не указан' : 'ключа нет в таблице';
  if (f === 'phone') return c.phone || 'телефона нет в таблице';
  if (f === 'password') return 'пароль — в карточке, «Показать»';
  if (f === 'kved') return c.kved.length ? `КВЕД ${c.kved.map((k) => k.code).join(', ')}` : 'КВЕД не указан';
  return c.email || 'почты нет в таблице';
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) { setQ(''); setActive(0); } }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  const actions: Item[] = [
    { id: 'pay', group: 'Действия', label: 'Записать платёж', hint: 'Alt N', icon: 'plus', run: () => ui.openPayment() },
    { id: 'add', group: 'Действия', label: 'Добавить клиента', icon: 'userPlus', run: ui.openAddClient },
    { id: 'r-today', group: 'Разделы', label: 'Сегодня', icon: 'today', run: () => navigate('#/today') },
    { id: 'r-clients', group: 'Разделы', label: 'Клиенты', icon: 'clients', run: () => navigate('#/clients') },
    { id: 'r-deadlines', group: 'Разделы', label: 'Сроки', icon: 'deadlines', run: () => navigate('#/deadlines') },
    { id: 'r-payments', group: 'Разделы', label: 'Платежи', icon: 'payments', run: () => navigate('#/payments') },
    { id: 'r-keys', group: 'Разделы', label: 'Ключи ЭЦП', icon: 'keys', run: () => navigate('#/keys') },
    { id: 'r-ref', group: 'Разделы', label: 'Справочник', icon: 'reference', run: () => navigate('#/reference') },
  ];
  // «фамилия + поле» (находка «Пользователя» № 11): клиент ищется по имени, в строке — нужное поле.
  const fq = splitFieldQuery(q);
  const clientItems = store.clients.map((c) => ({ ...c, extra: [...c.kved.map((k) => k.code), c.phone],
    words: [...c.kved.map((k) => k.title), c.keyIssuer, ...store.deadlines.filter((d) => d.clientId === c.id).map((d) => d.what)] }));
  const byField = fq.field ? search(clientItems, fq.name) : [];
  const field = byField.length ? fq.field : null;
  const openClient = (id: string) => { rememberRecent(id); ui.openClient(id); };
  const firstClients = (): Client[] => {
    const ids = [...readRecent(), ...store.payments.map((p) => p.clientId), ...store.clients.map((c) => c.id)];
    return [...new Set(ids)].map((id) => store.client(id)).filter((c): c is Client => Boolean(c)).slice(0, RECENT_MAX);
  };
  const clients: Item[] = (q ? (field ? byField : search(clientItems, q)).slice(0, 6) : firstClients())
    .map((c) => ({ id: c.id, group: 'Клиенты', label: c.name, hint: field ? fieldHint(c, field) : kindLabel(c.kind), icon: 'fop' as IconName, run: () => openClient(c.id) }));
  // Сроки, задачи и платежи — по имени клиента и тексту («ромашко єсв», «первичка», «1500»), от 2 букв.
  // Ищем той же читалкой, что и клиентов (search техники сайта): имя клиента + текст записи.
  const who = (id: string | null) => (id ? store.client(id)?.name ?? '' : '');
  const deep = q.trim().length >= 2;
  const deadlines: Item[] = deep
    ? search(store.deadlines.map((d) => ({ ...d, name: `${who(d.clientId)} ${d.what}` })), q)
      .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5)
      .map((d) => ({ id: `d-${d.id}`, group: 'Сроки', label: `${shortName(who(d.clientId)) || 'Клиент не указан'} — ${splitEmoji(d.what).rest}`,
        hint: daysLabel(daysBetween(TODAY, d.due)), icon: OBLIGATION_ICON[obligationKind(d.what)], run: () => openClient(d.clientId) }))
    : [];
  const tasks: Item[] = deep
    ? search(store.tasks.filter((t) => !t.done).map((t) => ({ ...t, name: `${who(t.clientId)} ${t.text}` })), q).slice(0, 4)
      .map((t) => ({ id: `t-${t.id}`, group: 'Задачи', label: splitEmoji(t.text).rest, hint: t.clientId ? shortName(who(t.clientId)) : undefined,
        icon: 'tasks' as IconName, run: () => (t.clientId ? openClient(t.clientId) : navigate('#/tasks')) }))
    : [];
  const payments: Item[] = deep
    ? search(store.payments.map((p) => ({ ...p, name: `${who(p.clientId)} ${p.period}`, extra: [String(Math.round((p.kopecks ?? 0) / 100))] })), q)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 4)
      .map((p) => ({ id: `p-${p.id}`, group: 'Платежи', label: `${shortName(who(p.clientId)) || 'Клиент не указан'} — ${p.period}`,
        hint: formatPayMoney(p.kopecks), icon: 'payments' as IconName, run: () => (p.clientId ? openClient(p.clientId) : navigate('#/payments')) }))
    : [];
  const shortcuts = q ? actions.filter((a) => fold(a.label).includes(fold(q))) : actions.filter((a) => a.group === 'Действия');
  const items = [...clients, ...deadlines, ...tasks, ...payments, ...shortcuts];

  function run(it: Item | undefined) {
    if (!it) return;
    onClose();
    // Окно закрывается, потом действие — чтобы новое окно (карточка, платёж) не открылось под палитрой.
    window.setTimeout(it.run, 0);
  }

  return (
    <dialog ref={ref} className="palette" aria-label="Командная строка"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="palette__box">
        <label className="palette__search">
          <Icon name="search" />
          <span className="visually-hidden">Что найти</span>
          <input ref={input} value={q} placeholder="Фамилия клиента, срок, платёж или раздел…" autoComplete="off"
            role="combobox" aria-expanded={items.length > 0} aria-controls="palette-list" aria-activedescendant={items[active] ? `pal-${active}` : undefined}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
            }} />
          <kbd className="kbd">Esc</kbd>
        </label>
        <div id="palette-list" className="palette__list" role="listbox" aria-label="Результаты">
          {[...new Set(items.map((it) => it.group))].map((g) => (
            <div key={g} role="group" aria-labelledby={`palg-${g}`}>
              <p id={`palg-${g}`} className="palette__group" role="presentation">{g}</p>
              {items.map((it, i) => it.group === g && (
                <div key={it.id} id={`pal-${i}`} role="option" aria-selected={i === active} className="palette__item"
                  onMouseMove={() => setActive(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} />
                  <span className="palette__label">{it.label}</span>
                  {it.hint && <span className="sub">{it.hint}</span>}
                </div>
              ))}
            </div>
          ))}
          {items.length === 0 && <p className="palette__empty sub">Ничего не нашли по «{q}»</p>}
        </div>
      </div>
    </dialog>
  );
}
