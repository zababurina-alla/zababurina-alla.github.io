// Свет за курсором (как у «Сверки рейсов»): одна подписка на весь документ. Поверхности с классом из SURFACES
// получают --mx / --my (где мышь) и --fx-on: 1, пока мышь над ними; рисует свет styles/fx.css.
// Замер — только в обработчике pointermove, запись — в следующем кадре (requestAnimationFrame), без чтения после записи.
const SURFACES = '.tally, .hero';

let current: HTMLElement | null = null;
let raf = 0;
let last: PointerEvent | null = null;

function frame() {
  raf = 0;
  const e = last;
  if (!e) return;
  const el = (e.target instanceof Element ? e.target.closest<HTMLElement>(SURFACES) : null);
  if (el !== current) {
    current?.style.setProperty('--fx-on', '0');
    current = el;
  }
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
  el.style.setProperty('--fx-on', '1');
}

if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    last = e;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { current?.style.setProperty('--fx-on', '0'); current = null; });
}

// Прилипшие шапки (таблица «Клиентов», заголовки дней на «Сроках», «Платежах», «Задачах»): прилипла — класс is-stuck,
// под ней тень (styles/fx.css). Проверка — раз за кадр при прокрутке; шапок на экране немного (до 30).
const STICKY = '.ctable__head, .dgroup__title, .deadlines-grid > aside';
let stuckRaf = 0;
function markStuck() {
  stuckRaf = 0;
  for (const el of document.querySelectorAll<HTMLElement>(STICKY)) {
    const top = parseFloat(getComputedStyle(el).top) || 0;
    const r = el.getBoundingClientRect();
    const box = el.parentElement?.getBoundingClientRect();
    // Прилипла: стоит на своей высоте, а её блок уже уехал выше — значит, прокрутили за начало блока.
    const stuck = r.height > 0 && Math.abs(r.top - top) < 1 && box !== undefined && box.top < top - 1;
    el.classList.toggle('is-stuck', stuck);
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => { if (!stuckRaf) stuckRaf = requestAnimationFrame(markStuck); }, { passive: true, capture: true });
}
