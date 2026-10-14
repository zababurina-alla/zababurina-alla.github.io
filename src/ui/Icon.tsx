// Значок из набора «Сверки» (src/ui/icons.tsx). Цвет — currentColor; tile — значок на мягкой цветной плитке
// (для дашбордов и списков), цвет плитки — из пар статусов или акцента, контраст уже проверен.
import { ICONS, resolveIcon } from './icons';

export type IconName = keyof typeof ICONS | 'calendar' | 'wallet' | 'key' | 'book' | 'sync' | 'phone' | 'question' | 'alert' | 'building';
export type TileTone = 'accent' | 'red' | 'orange' | 'yellow' | 'green' | 'grey';

export function Icon({ name, size = 20, className = '', tile, label }: {
  name: IconName; size?: number; className?: string; tile?: TileTone; label?: string;
}) {
  const def = resolveIcon(name);
  const svg = (
    <svg className={`icon${def?.filled ? ' icon--filled' : ''} ${tile ? '' : className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {def?.el}
    </svg>
  );
  if (!tile) return svg;
  return <span className={`icon-tile icon-tile--${tile} ${className}`}>{svg}</span>;
}
