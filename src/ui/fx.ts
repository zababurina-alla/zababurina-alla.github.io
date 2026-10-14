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

if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    last = e;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { current?.style.setProperty('--fx-on', '0'); current = null; });
}
