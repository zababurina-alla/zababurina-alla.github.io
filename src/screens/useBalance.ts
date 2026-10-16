// «Сегодня», две колонки (владелец 16.10: «справа длинная колонка, слева закончилось — пусто»): нижние карточки
// боковой колонки (задачи, ключи, деньги, «Что изменилось») встают под список сроков, если так колонки ровнее.
// Порядок карточек не меняется; верх правой колонки (входящие, вопрос Дмитрия, «Требуют внимания») — всегда справа.
// Пересчёт — когда меняется состав данных (подпись sig) или ширина переходит 1280 px, а не от каждой перерисовки.
import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

const WIDE = '(min-width: 1280px)';

export function useBalance(grid: RefObject<HTMLElement | null>, tail: string[], sig: string): string[] {
  const [left, setLeft] = useState<string[]>([]);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const key = tail.join(',');
  useLayoutEffect(() => {
    const g = grid.current;
    if (!wide || !g) return;
    const keys = key ? key.split(',') : [];
    const gap = parseFloat(getComputedStyle(g).rowGap) || 0;
    const h = (sel: string) => g.querySelector(sel)?.getBoundingClientRect().height ?? 0;
    const part = Object.fromEntries(keys.map((k) => [k, h(`[data-tail="${k}"]`) + gap]));
    // Где карточка стоит сейчас — по самой странице
    const now = keys.filter((k) => g.querySelector(`.today-main [data-tail="${k}"]`));
    const inLeft = new Set(now);
    const coreLeft = h('.today-list');
    const coreRight = h('.today-side') - keys.filter((k) => !inLeft.has(k)).reduce((a, k) => a + (part[k] ?? 0), 0);
    // Карточек не больше четырёх — перебираем все 16 раскладок; при равенстве — меньше переносов влево
    let best: string[] = [], bestDiff = Infinity;
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const moved = keys.filter((_, i) => mask & (1 << i));
      const l = coreLeft + moved.reduce((a, k) => a + (part[k] ?? 0), 0);
      const r = coreRight + keys.filter((k) => !moved.includes(k)).reduce((a, k) => a + (part[k] ?? 0), 0);
      const diff = Math.abs(l - r);
      if (diff < bestDiff - 1 || (Math.abs(diff - bestDiff) <= 1 && moved.length < best.length)) { best = moved; bestDiff = diff; }
    }
    // Раскладка — из замера страницы, до отрисовки (иначе карточки мигнут справа); повтор — только при новой подписи
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (best.join(',') !== now.join(',')) setLeft(best);
  }, [grid, key, sig, wide]);

  // Узкий экран — одна колонка: все карточки на своих местах
  return wide ? left : [];
}
