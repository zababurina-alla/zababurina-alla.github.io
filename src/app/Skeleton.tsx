// Заготовка экрана, пока данные идут из таблицы: силуэты строк с бегущим бликом, а не крутилка.
// Блик — transform на псевдоэлементе; при «уменьшить движение» силуэты неподвижны.
import { Icon } from '../ui/Icon';

export function Skeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <header className="page__head">
        <div className="sk-stack">
          <span className="sk sk--title" />
          <span className="sk sk--line" style={{ width: '14rem' }} />
        </div>
      </header>
      <p className="sk-note"><Icon name="saving" />Загружаем из таблицы…</p>
      <div className="sk-kpis">
        {[0, 1, 2, 3].map((i) => <span key={i} className="sk sk--kpi" />)}
      </div>
      <div className="panel sk-rows">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sk-row">
            <span className="sk sk--avatar" />
            <span className="sk sk--line" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
            <span className="sk sk--line sk--short" />
          </div>
        ))}
      </div>
    </div>
  );
}
