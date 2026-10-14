// Закрытие срока одинаково на всех экранах: проверка периода → галочка → строка уходит, остальные плавно
// поднимаются (Flip, только transform) → звук → уведомление «Следующий создан… Отменить».
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useStore } from '../data/store';
import { TODAY, fmtDate } from '../lib/dates';
import { play } from '../lib/sound';
import { reducedMotion } from '../ui/kit';
import { useToast } from '../ui/toast';

gsap.registerPlugin(Flip);

export function useCloseDeadline(rowSelector = '[data-row]') {
  const store = useStore();
  const toast = useToast();
  const [closing, setClosing] = useState<string | null>(null);
  const [warn, setWarn] = useState<Record<string, string>>({});
  const flipState = useRef<Flip.FlipState | null>(null);

  useLayoutEffect(() => {
    if (!flipState.current) return;
    Flip.from(flipState.current, { duration: 0.32, ease: 'power2.inOut' });
    flipState.current = null;
  }, [store.deadlines]);

  function close(id: string) {
    const d = store.deadlines.find((x) => x.id === id);
    if (!d || closing) return;
    // Проверка периода до анимации: если нельзя — мягкое предупреждение в строке, ничего не уезжает.
    if (d.periodEnds && d.periodEnds > TODAY) {
      setWarn((w) => ({ ...w, [id]: `Период ещё не закончился — закрыть можно с ${fmtDate(d.periodEnds ?? '')}` }));
      play('attention');
      return;
    }
    setClosing(id);
    const row = document.querySelector<HTMLElement>(`${rowSelector}[data-id="${id}"]`);
    const commit = () => {
      flipState.current = Flip.getState(rowSelector);
      const name = store.client(d.clientId)?.name.split(' ').slice(0, 2).join(' ') ?? '';
      // «Закрыто в таблице» — только после подтверждения сервера (бриф, п. 6); до этого статус «сохраняется» в меню.
      const res = store.closeDeadline(id, () => {
        play('closed');
        toast({
          text: next ? `Закрыто в таблице: ${name}. Следующий срок создан — до ${fmtDate(next.due)}` : `Закрыто в таблице: ${name}`,
          action: { label: 'Отменить', run: () => store.reopenDeadline(id) },
        });
      });
      setClosing(null);
      const next = res.ok ? res.next : null;
      if (!res.ok) toast({ text: res.reason, tone: 'error' });
    };
    if (!row || reducedMotion()) return commit();
    // Галочка дорисовывается (CSS, класс is-closing), через 360 мс строка уходит вправо и тает.
    row.classList.add('is-closing');
    gsap.timeline()
      .to(row, { opacity: 0, x: 24, duration: 0.24, ease: 'power2.in', delay: 0.36 })
      .add(commit);
  }

  return { close, closing, warn };
}
