// «Сегодня», вид A, две колонки разной высоты (владелец 25.10: «блоки в ряду разной высоты», и пустоты нельзя).
// Карточки не растягиваем — растяжка даёт пустоту внутри карточки. Вместо этого каждая колонка липнет (sticky):
// top = мин(16, высота окна − высота колонки − 16). Короче окна — стоит у верха, длиннее — её низ останавливается
// в 16 px от низа окна (как зазор между карточками), пока длинная докручивается. Ниже конца ряда sticky колонку
// не пускает, поэтому в конце страницы низы колонок вровень.
// Пересчёт — когда меняется высота колонки или окна. Правило sticky — в look-a/look.css (≥ 1280 px).
import { useEffect } from 'react';
import type { RefObject } from 'react';

const GAP = 16; // --space-4: зазор между колонкой и краем окна, как между карточками

export function useStickyColumns(grid: RefObject<HTMLElement | null>, on: boolean): void {
  useEffect(() => {
    const g = grid.current;
    if (!on || !g) return;
    const cols = [...g.children] as HTMLElement[];
    const set = () => {
      for (const c of cols) c.style.setProperty('--stick-top', `${Math.min(GAP, window.innerHeight - c.offsetHeight - GAP)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    for (const c of cols) ro.observe(c);
    window.addEventListener('resize', set);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', set);
      for (const c of cols) c.style.removeProperty('--stick-top');
    };
  }, [grid, on]);
}
