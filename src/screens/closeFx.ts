// Эффекты закрытия срока. Назначение — подтвердить действие и показать, куда делась строка.
// 1) Вспышка у галочки: 8 точек разлетаются на 16–22 px и тают за 450 мс (WAAPI, только transform/opacity).
// 2) Полёт: копия строки сжимается в плашку и летит по дуге в счётчик «Закрыто сегодня», счётчик вздрагивает.
import gsap from 'gsap';
import { reducedMotion } from '../ui/kit';

export function burst(at: HTMLElement, color = 'var(--dot-green)'): void {
  if (reducedMotion()) return;
  const r = at.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 8; i++) {
    const dot = document.createElement('span');
    dot.className = 'fx-dot';
    dot.style.left = `${cx - 3}px`;
    dot.style.top = `${cy - 3}px`;
    dot.style.background = color;
    document.body.appendChild(dot);
    const angle = (Math.PI * 2 * i) / 8 + Math.PI / 8;
    const dist = 16 + (i % 2) * 6;
    dot.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 450, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    ).onfinish = () => dot.remove();
  }
}

/** Плашка «✓ что закрыто» летит из строки в счётчик. Возвращает обещание конца полёта. */
export function flyToCounter(from: HTMLElement, text: string): Promise<void> {
  const target = document.querySelector<HTMLElement>('[data-closed-counter]');
  if (!target || reducedMotion() || target.getBoundingClientRect().width === 0) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = document.createElement('span');
  ghost.className = 'fx-ghost';
  ghost.textContent = `✓ ${text}`;
  ghost.style.left = `${a.left}px`;
  ghost.style.top = `${a.top + a.height / 2 - 18}px`;
  document.body.appendChild(ghost);
  const gw = ghost.getBoundingClientRect().width;
  const dx = b.left + b.width / 2 - (a.left + gw / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: () => { ghost.remove(); resolve(); } })
      .fromTo(ghost, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.14, ease: 'power2.out' })
      // Дуга: по X — ровно, по Y — сначала чуть вниз, потом вверх к счётчику; к концу плашка сжимается в точку.
      .to(ghost, { x: dx, duration: 0.62, ease: 'power2.inOut' }, 0.1)
      .to(ghost, { y: dy, duration: 0.62, ease: 'back.in(1.2)' }, 0.1)
      .to(ghost, { scale: 0.35, opacity: 0, duration: 0.24, ease: 'power2.in' }, 0.5)
      .add(() => {
        target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
          { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }, 0.68);
  });
}
