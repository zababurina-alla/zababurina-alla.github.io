// Пустое место с рисунком. Рисунки свои, в стиле значков: мягкая подложка + линия 1,6, 96×64. При наведении на
// пустое место рисунок чуть оживает (styles/fx.css): календарь «перелистывается», лупа ищет, кошелёк покачивается.
import type { ReactNode } from 'react';

type Pic = 'calm' | 'search' | 'wallet' | 'keys' | 'tasks';

const PICS: Record<Pic, ReactNode> = {
  // Все сроки закрыты: лист календаря с галочкой, рядом листок с чашкой — можно выдохнуть
  calm: (
    <>
      <path className="pic__tone" d="M22 14h40a4 4 0 0 1 4 4v8H18v-8a4 4 0 0 1 4-4z" />
      <rect x="18" y="14" width="48" height="42" rx="4" />
      <path d="M18 26h48M30 9v9M54 9v9" />
      <path className="pic__check" d="m33 41 6 6 12-13" />
      <path className="pic__tone" d="M72 40h12v9a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6z" />
      <path d="M72 40h12v9a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6zM84 43h2.5a2.5 2.5 0 0 1 0 5H84" />
      <path className="pic__steam" d="M76 35c-1.5-2 1.5-3 0-5M80 35c-1.5-2 1.5-3 0-5" strokeOpacity=".55" />
    </>
  ),
  // Никого не нашли: карточки клиентов и лупа
  search: (
    <>
      <rect className="pic__tone" x="14" y="16" width="44" height="30" rx="4" />
      <rect x="14" y="16" width="44" height="30" rx="4" />
      <circle cx="26" cy="28" r="5" />
      <path d="M20 40c1.2-3 3.5-4.5 6-4.5s4.8 1.5 6 4.5M38 26h13M38 32h9" strokeOpacity=".6" />
      <g className="pic__lens">
        <circle className="pic__tone" cx="66" cy="38" r="11" />
        <circle cx="66" cy="38" r="11" />
        <path d="m74 46 9 9" strokeWidth="2.6" />
      </g>
    </>
  ),
  // Платежей нет: кошелёк и монета
  wallet: (
    <>
      <path className="pic__tone" d="M18 22h52a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z" />
      <path d="M18 22h52a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4h40" />
      <path d="M74 32H62a6 6 0 0 0 0 12h12" />
      <circle cx="63" cy="38" r="1.6" fill="currentColor" stroke="none" />
      <g className="pic__coin">
        <circle className="pic__tone" cx="80" cy="14" r="7" />
        <circle cx="80" cy="14" r="7" />
        <path d="M80 10.5v7" strokeOpacity=".6" />
      </g>
    </>
  ),
  // Ключей нет: ключ на кольце
  keys: (
    <>
      <circle className="pic__tone" cx="34" cy="38" r="12" />
      <circle cx="34" cy="38" r="12" />
      <circle cx="34" cy="38" r="4" />
      <path d="M43 30 66 12M58 18l5 5M63 14l5 5" />
    </>
  ),
  // Задач нет: список с отмеченными делами
  tasks: (
    <>
      <rect className="pic__tone" x="24" y="10" width="48" height="46" rx="4" />
      <rect x="24" y="10" width="48" height="46" rx="4" />
      <path className="pic__check" d="m31 23 3 3 5-6M31 35l3 3 5-6" />
      <path d="M44 24h20M44 36h20M44 48h14" strokeOpacity=".6" />
      <circle cx="35" cy="47" r="3.5" />
    </>
  ),
};

export function Empty({ pic, title, children, action }: { pic: Pic; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" data-pic={pic}>
      <svg className="pic" viewBox="0 0 96 64" width="96" height="64" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PICS[pic]}</svg>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}
