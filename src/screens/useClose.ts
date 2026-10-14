// Закрытие срока одинаково на всех экранах: проверка периода → галочка → строка уходит, остальные плавно
// поднимаются (Flip, только transform) → звук → уведомление «Следующий создан… Отменить».
import { useState } from 'react';
import gsap from 'gsap';
import { useStore } from '../data/store';
import { TODAY, addDays, fmtDate, fmtDue, daysBetween, plural } from '../lib/dates';
import { play } from '../lib/sound';
import { reducedMotion } from '../ui/kit';
import { useToast } from '../ui/toast';
import { burst, flyToCounter } from './closeFx';
import { canWrite } from '../config';
import { roMessage } from '../ui/readonly';

const FAR_DAYS = 30;

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
    const name = store.client(d.clientId)?.name.split(' ').slice(0, 2).join(' ') ?? '';
    // Запись уходит в очередь сразу по нажатию. «Закрыто в таблице» — только после ответа сервера (бриф, п. 6).
    const res = store.closeDeadline(id, (next, notifyAt) => {
      play('closed');
      // Уведомление клиенту уходит через 2 мин (контракт v2, п. 31) — «Отменить» успевает его остановить.
      const notice = notifyAt ? ' Клиенту сообщим через 2 мин — можно отменить.' : '';
      toast({
        text: (next ? `Закрыто в таблице: ${name}. Следующий срок создан — до ${fmtDue(next.due)}.` : `Закрыто в таблице: ${name}.`) + notice,
        action: { label: 'Отменить', run: () => store.reopenDeadline(id) },
      });
    }, animate ? 600 : 0);
    window.setTimeout(() => setClosing(null), animate ? 600 : 0);
    if (!res.ok) { toast({ text: res.reason, tone: 'error' }); return; }
    if (!row || !animate) return;
    // Только вид: галочка вспыхивает (CSS + 8 точек), плашка «улетает» в счётчик «Закрыто сегодня», строка тает.
    row.classList.add('is-closing');
    const btn = row.querySelector<HTMLElement>('.check-btn');
    if (btn) burst(btn);
    const what = row.querySelector<HTMLElement>('.dtable__what') ?? row;
    window.setTimeout(() => { void flyToCounter(what, d.what); }, 320);
    gsap.to(row, { opacity: 0, x: 16, duration: 0.24, ease: 'power2.in', delay: 0.34 });
  }

  return { close, closing, warn };
}
