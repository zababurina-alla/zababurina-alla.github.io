// Разлиновка учётной книги — знак вида A «Тихий премиум» (DESIGN.md, 25.10.2026; перенос из образца
// docs/дизайн/борд-бухгалтерия/A). Строки через 28 px, каждая пятая — «итоговая», плотнее; двойные линии граф.
// Открытие: строки прочерчиваются слева направо сверху вниз, потом опускаются графы (1 с). Дальше — лёгкое дыхание,
// курсор раздвигает строки, как лупа; смена темы — кольцевая рябь; при прокрутке разлиновка плывёт на ±12 px.
// Рисуем ~30 кадров в секунду и только пока лист виден. Меньше движения — одна неподвижная разлиновка.
import { useEffect, useRef } from 'react';
import { subscribeTheme } from '../lib/theme';
import { reducedMotion } from './kit';

const GAP = 28;
const TOP = 20;
const BIRTH = 1000;
const COLS = [8, -120]; // графы: от левого края и от правого (минус)

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (p: number) => 1 - (1 - p) ** 3;

export function Ledger() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const box = cv?.parentElement;
    const ctx = cv?.getContext('2d');
    if (!cv || !box || !ctx) return;
    const still = reducedMotion();
    let W = 0, H = 0, dpr = 1, col = '';
    let visible = true, raf = 0, last = 0, born0 = -1, rip = -1;
    let t = 0.6, now = 0, sy = 0;
    let tx = 0.5, ty = 0.5, cx = 0.5, cy = 0.5, bt = 0, bc = 0;

    const recolor = () => { col = getComputedStyle(cv).getPropertyValue('--accent').trim() || col; };
    const draw = () => {
      if (!W || !H) return;
      const born = still ? 1 : born0 < 0 ? 0 : clamp((now - born0) / BIRTH, 0, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (born <= 0) return;
      const n = Math.ceil(H / GAP) + 2, bx = cx * W, by = cy * H, amp = 10 * bc, s2 = 90 * 90;
      const ra = rip < 0 ? 0 : (now - rip) / 1600, ripOn = ra > 0 && ra < 1;
      const rAmp = ripOn ? 7 * (1 - ra) : 0, rR = ra * Math.max(W, H) * 1.05, hx = W / 2, hy = H / 2;
      ctx.translate(0, sy);
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      for (let l = 0; l < n; l++) {
        const y0 = TOP + (l - 1) * GAP;
        const major = (l + 3) % 5 === 0;
        const prog = clamp(born * 1.6 - (l / n) * 0.6, 0, 1);
        if (prog <= 0) continue;
        const xEnd = W * easeOut(prog);
        ctx.beginPath();
        for (let x = 0; ; x += 10) {
          const xx = Math.min(x, xEnd);
          let y = y0 + Math.sin(xx * 0.011 + t * 1.3 + l * 0.55) * 1.2;
          if (amp > 0.05) {
            const dx = xx - bx, dy = y0 - by, d2 = (dx * dx + dy * dy) / s2;
            if (d2 < 9) y += (dy >= 0 ? 1 : -1) * amp * Math.exp(-d2) * Math.min(1, Math.abs(dy) / GAP);
          }
          if (ripOn) {
            const rq = (Math.hypot(xx - hx, y0 - hy) - rR) / 36;
            if (rq > -3 && rq < 3) y += rAmp * Math.cos(rq * 2) * Math.exp(-rq * rq * 0.5);
          }
          if (x === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
          if (xx >= xEnd) break;
        }
        ctx.globalAlpha = (major ? 0.42 : 0.16) * Math.min(1, prog * 3);
        ctx.lineWidth = major ? 1.4 : 1;
        ctx.stroke();
      }
      const vp = easeOut(clamp(born * 1.8 - 0.8, 0, 1));
      if (vp > 0) {
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const c of COLS) {
          const x = c < 0 ? W + c : c, yTop = -GAP, yB = yTop + (H + 2 * GAP) * vp;
          ctx.moveTo(x, yTop); ctx.lineTo(x, yB);
          ctx.moveTo(x + 4, yTop); ctx.lineTo(x + 4, yB);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      recolor(); draw();
    };
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !visible || ts - last < 32) return;
      last = ts; now = ts; t = ts * 0.0006 + 0.6;
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; bc += (bt - bc) * 0.07;
      const r = cv.getBoundingClientRect();
      if (r.height) sy = clamp(-((r.top + r.height / 2 - innerHeight / 2) / innerHeight) * 24, -12, 12);
      draw();
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      tx = clamp((e.clientX - r.left) / r.width, 0, 1);
      ty = clamp((e.clientY - r.top) / r.height, 0, 1);
      bt = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom ? 1 : 0;
    };
    const onLeave = () => { bt = 0; };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);
    // Тема сменилась: перекрасить и пустить рябь (цвет берём со следующего кадра — когда стили уже новые)
    const unTheme = subscribeTheme(() => requestAnimationFrame(() => { recolor(); if (!still) rip = performance.now(); draw(); }));
    if (still) return () => { ro.disconnect(); unTheme(); };

    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(box);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    born0 = performance.now();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); unTheme();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
