// Витрина значков для Дмитрия: все значки по категориям, линейный вид и плитка, обе темы (переключатель — в меню).
// Открывается по адресу #/icons (в меню её нет — это рабочая страница, не для мамы).
import { useState } from 'react';
import { ICONS } from '../ui/icons';
import type { IconDef } from '../ui/icons';
import { Icon } from '../ui/Icon';
import type { IconName, TileTone } from '../ui/Icon';

const TONE_BY_CAT: Record<string, TileTone> = {
  'Срочность': 'grey', 'Статус работы': 'accent', 'Статус платежа': 'green', 'Аудит': 'yellow', 'Приоритет': 'orange',
};
const URGENCY_TONE: Record<string, TileTone> = { overdue: 'red', burning: 'orange', soon: 'yellow', ok: 'green', inactive: 'grey' };

export function IconGallery() {
  const [view, setView] = useState<'line' | 'tile'>('line');
  const entries = Object.entries(ICONS) as [IconName, IconDef][];
  const cats = [...new Set(entries.map(([, d]) => d.cat))];
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Значки «Бухгалтерии»</h1>
          <p className="page__sub">{entries.length} значков, {cats.length} категорий. Свои, сетка 24, линия 1,75. Тема — переключателем в меню.</p>
        </div>
        <div className="seg" role="group" aria-label="Вид">
          <button type="button" aria-pressed={view === 'line'} className="seg__opt" onClick={() => setView('line')}>Линия</button>
          <button type="button" aria-pressed={view === 'tile'} className="seg__opt" onClick={() => setView('tile')}>Плитка</button>
        </div>
      </header>
      {cats.map((cat) => (
        <section key={cat} className="panel" aria-labelledby={`ic-${cat}`}>
          <header className="panel__head"><h2 id={`ic-${cat}`} className="panel__title">{cat}</h2>
            <span className="sub">{entries.filter(([, d]) => d.cat === cat).length}</span></header>
          <ul className="icon-grid">
            {entries.filter(([, d]) => d.cat === cat).map(([name, d]) => {
              const urgency = cat === 'Срочность';
              const tone: TileTone = (urgency ? URGENCY_TONE[name] : TONE_BY_CAT[cat]) ?? 'accent';
              return (
                <li key={name} className="icon-cell">
                  <span className={`icon-cell__view${urgency ? ` urgency urgency--${URGENCY_TONE[name]}` : ''}`}>
                    {view === 'tile' && !urgency ? <Icon name={name} size={22} tile={tone} /> : <Icon name={name} size={view === 'tile' ? 28 : 24} />}
                  </span>
                  <span className="icon-cell__label">{d.label}</span>
                  <code className="icon-cell__name">{name}</code>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
