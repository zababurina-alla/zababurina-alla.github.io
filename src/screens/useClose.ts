// Закрытие срока одинаково на всех экранах: проверка периода → галочка → строка уходит, остальные плавно
// поднимаются (Flip, только transform) → звук → уведомление «Следующий создан… Отменить».
import { useState } from 'react';
import gsap from 'gsap';
import { useStore } from '../data/store';
import { TODAY, addDays, fmtDate, daysBetween, plural } from '../lib/dates';
import { play } from '../lib/sound';
import { reducedMotion } from '../ui/kit';
import { useToast } from '../ui/toast';
import { burst, flyToCounter } from './closeFx';
import { canWrite } from '../config';
import { roMessage } from '../ui/readonly';

const FAR_DAYS = 30;

// Находка «Пользователя» № 8: строка закрытого срока уезжает, список поднимается — под курсором оказывается кружок
// следующего срока, и второй щелчок закрыл бы чужой срок. Поэтому 1,2 с после закрытия нажатие на кружок без движения
// мыши (меньше 12 px) не считается: кружок только качнётся. Сдвинули мышь или нажали позже — закрывается как обычно.
const GUARD_MS = 1200;
// Находка № 24 (проход 2): через ~3 с щелчок всё равно попадал в подъехавший срок. Теперь закрытая строка — «призрак»:
// 3 с остаётся на месте (зачёркнута, бледная, не нажимается), только потом уходит — список не подъезжает под курсор.
const GHOST_MS = 3000;
const GUARD_PX = 12;
let guard: { until: number; x: number; y: number } | null = null;
let px = 0;
let py = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { capture: true, passive: true });
}
const guarded = () => guard !== null && Date.now() < guard.until && Math.hypot(px - guard.x, py - guard.y) < GUARD_PX;
/** Включить защиту: с этой точки курсора, на время анимации строки + GUARD_MS. */
const armGuard = (animMs: number) => { guard = { until: Date.now() + animMs + GUARD_MS, x: px, y: py }; };

export function useCloseDeadline(rowSelector = '[data-row]') {
  const store = useStore();
  const toast = useToast();
  const [closing, setClosing] = useState<string | null>(null);
  const [warn, setWarn] = useState<Record<string, string>>({});
  // Срок далеко (> 30 дней): первое нажатие — переспросить в строке, второе — закрыть. Окна у сервера нет (решение «Мамы CRM»).
  const [armed, setArmed] = useState<string | null>(null);

  function close(id: string) {
    const d = store.deadlines.find((x) => x.id === id);
    if (!d || closing) return;
    if (guarded()) {
      const btn = document.querySelector<HTMLElement>(`${rowSelector}[data-id="${id}"] .check-btn`);
      if (btn && !reducedMotion()) gsap.fromTo(btn, { x: -3 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.35)' });
      return;
    }
    // Сроки с сайта пока не закрываются (только просмотр) — подпись в строке, как с периодом.
    if (!canWrite('deadlines')) {
      setWarn((w) => ({ ...w, [id]: roMessage('deadlines') }));
      return;
    }
    // Проверка периода до анимации: если нельзя — мягкое предупреждение в строке, ничего не уезжает.
    if (d.periodEnd && TODAY <= d.periodEnd) {
      setWarn((w) => ({ ...w, [id]: `Период ещё не закончился — закрыть можно с ${fmtDate(addDays(d.periodEnd ?? TODAY, 1))}` }));
      play('attention');
      return;
    }
    const ahead = daysBetween(TODAY, d.due);
    if (ahead > FAR_DAYS && armed !== id) {
      setArmed(id);
      setWarn((w) => ({ ...w, [id]: `До срока ещё ${ahead} ${plural(ahead, 'день', 'дня', 'дней')} — нажмите галочку ещё раз, если уже сдано и оплачено` }));
      play('attention');
      return;
    }
    setArmed(null);
    setWarn((w) => Object.fromEntries(Object.entries(w).filter(([k]) => k !== id)));
    setClosing(id);
    const row = document.querySelector<HTMLElement>(`${rowSelector}[data-id="${id}"]`);
    const animate = Boolean(row) && !reducedMotion();
    armGuard(animate ? GHOST_MS : 0);
    const name = store.client(d.clientId)?.name.split(' ').slice(0, 2).join(' ') ?? '';
    // Запись уходит в очередь сразу по нажатию. «Закрыто в таблице» — только после ответа сервера (бриф, п. 6).
    const res = store.closeDeadline(id, (_next, notifyAt) => {
      play('closed');
      // Уведомление клиенту уходит через 2 мин (контракт v2, п. 31) — «Вернуть срок» успевает его остановить.
      // Находки «Пользователя» № 7, № 9: одна строка «кто и какой срок», без «сообщим… можно отменить»; кнопка говорит,
      // что вернёт. Следующий срок виден в списке — в уведомлении не нужен.
      const what = d.what.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
      toast({
        text: `Закрыт: ${name} — ${what}.${notifyAt ? ' Клиенту — через 2 мин.' : ''}`,
        action: { label: 'Вернуть срок', run: () => store.reopenDeadline(id) },
        // № 7: срок закрыт, но клиенту не писать — кнопка есть, только если сервер это умеет (иначе cancelCloseNotice — null)
        ...(notifyAt && store.cancelCloseNotice ? { secondary: { label: 'Не писать клиенту', run: () => { void cancelNotice(id); } } } : {}),
        timeout: 12_000,
      });
    }, animate ? GHOST_MS : 0);
    window.setTimeout(() => setClosing(null), animate ? 600 : 0);
    if (!res.ok) { toast({ text: res.reason, tone: 'error' }); return; }
    if (!row || !animate) return;
    // Только вид: галочка вспыхивает (CSS + 8 точек), плашка «улетает» в счётчик «Закрыто сегодня», строка 3 с —
    // призрак на своём месте, потом тает.
    row.classList.add('is-closing');
    const btn = row.querySelector<HTMLElement>('.check-btn');
    if (btn) burst(btn);
    const what = row.querySelector<HTMLElement>('.dtable__what') ?? row;
    window.setTimeout(() => { void flyToCounter(what, d.what); }, 320);
    window.setTimeout(() => row.classList.add('is-ghost'), 420);
    gsap.to(row, { opacity: 0, duration: 0.28, ease: 'power2.in', delay: (GHOST_MS - 320) / 1000 });
  }

  async function cancelNotice(id: string) {
    const cancel = store.cancelCloseNotice;
    if (!cancel) return;
    try {
      const r = await cancel(id);
      toast({ text: r.status === 'sent' ? (r.sentAt ? `Уже отправлено в ${r.sentAt.slice(11, 16)}` : 'Уже отправлено клиенту') : 'Клиенту не напишем — срок остаётся закрытым', tone: 'info' });
    } catch {
      toast({ text: 'Не получилось снять сообщение: таблица не ответила', tone: 'error' });
    }
  }

  return { close, closing, warn };
}
