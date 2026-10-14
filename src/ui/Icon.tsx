// Значок из набора «Бухгалтерии» (src/ui/icons.tsx). Цвет — currentColor; у части значков — мягкая подложка 16 %
// (как в «Сверке рейсов»). data-icon — имя значка: по нему дизайн-слой оживляет значок при наведении (styles/fx.css).
// tile — значок на мягкой цветной плитке (для списков), цвет плитки — из пар статусов или акцента, контраст уже проверен.
import { ICONS, resolveIcon } from './icons';

export type IconName = keyof typeof ICONS | 'calendar' | 'wallet' | 'key' | 'book' | 'sync' | 'phone' | 'question' | 'alert' | 'building';
export type TileTone = 'accent' | 'red' | 'orange' | 'yellow' | 'green' | 'grey' | 'wheat';

export function Icon({ name, size = 20, className = '', tile, label }: {
  name: IconName; size?: number; className?: string; tile?: TileTone; label?: string;
}) {
  const def = resolveIcon(name);
  const svg = (
    <svg className={`icon${def?.filled ? ' icon--filled' : ''} ${tile ? '' : className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" data-icon={name}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {def?.tone && <g className="icon__tone" fill="currentColor" stroke="none">{def.tone}</g>}
      <g className="icon__line">{def?.el}</g>
    </svg>
  );
  if (!tile) return svg;
  return <span className={`icon-tile icon-tile--${tile} ${className}`}>{svg}</span>;
}
