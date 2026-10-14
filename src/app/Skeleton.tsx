// Заготовка экрана, пока данные идут из таблицы: силуэт первого экрана, плашек и строк с бегущим бликом, а не крутилка.
// Форма — как у «Сегодня», чтобы при приходе данных ничего не прыгало. Блик — transform на псевдоэлементе;
// при «уменьшить движение» силуэты неподвижны.
import { Icon } from '../ui/Icon';

export function Skeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <section className="hero">
        <span className="sk sk--line" style={{ width: '12rem' }} />
        <span className="sk sk--title" />
        <span className="sk sk--title" style={{ width: '60%' }} />
        <p className="sk-note"><Icon name="saving" />Загружаем из таблицы…</p>
        <div className="tallies">
          {[0, 1, 2, 3].map((i) => <span key={i} className="sk sk--kpi" />)}
        </div>
      </section>
      <div className="panel sk-rows">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sk-row">
            <span className="sk sk--avatar" />
            <span className="sk-stack" style={{ flex: 1 }}>
              <span className="sk sk--line" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
              <span className="sk sk--line" style={{ width: `${20 + ((i * 11) % 25)}%`, opacity: 0.6 }} />
            </span>
            <span className="sk sk--line sk--short" />
          </div>
        ))}
      </div>
    </div>
  );
}
