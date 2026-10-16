// Плавная перестановка строк таблиц (FLIP, владелец 16.10: «по таблицам мало моушна»): поиск, фильтр, сортировка,
// «сделано» — строки, что остались, переезжают на новые места, а не прыгают. Новые появляются своей CSS-лесенкой
// (row-in). Ключ — порядок строк: прочие обновления (сохраняется…, подсветка) не дёргают перестановку.
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { reducedMotion } from './kit';

gsap.registerPlugin(Flip);

export function useFlipRows(scope: RefObject<HTMLElement | null>, selector: string, order: string): void {
  const state = useRef<Flip.FlipState | null>(null);
  useLayoutEffect(() => {
    const rows = scope.current ? gsap.utils.toArray<HTMLElement>(selector, scope.current) : [];
    if (state.current && !reducedMotion()) Flip.from(state.current, { targets: rows, duration: 0.38, ease: 'power3.out', simple: true });
    state.current = Flip.getState(rows);
  }, [order, scope, selector]);
}
