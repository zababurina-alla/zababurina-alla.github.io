// Ход первой загрузки из таблицы: на живой таблице снимок идёт 10–15 с — без объяснения так ждать нельзя.
// Прогресс честно неизвестен (сервер не сообщает), поэтому полоса — по ожидаемым ~12 с и никогда не дойдёт до конца
// сама; рядом — сколько секунд уже ждём и что происходит словами.
import { useEffect, useState } from 'react';

const EXPECTED_S = 12;

export function LoadProgress() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setSec(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(t);
  }, []);
  const share = Math.min(0.95, 1 - Math.exp(-sec / (EXPECTED_S / 2.5)));
  // Дольше 10 с — почти всегда холодный старт Google (22.10: до минуты): спокойно, без слова «ошибка».
  const text = sec < 3 ? 'Связываемся с таблицей…'
    : sec < 10 ? 'Загружаем клиентов, сроки и платежи из таблицы…'
      : sec < 90 ? 'Таблица просыпается — это бывает до минуты, ничего не потеряется'
        : 'Таблица просыпается дольше обычного — ещё немного, пробую снова';
  return (
    <div className="load-progress" role="status">
      <p className="load-progress__text">{text}{sec >= 3 && <span className="sub"> {sec} с</span>}</p>
      <div className="load-progress__bar" role="progressbar" aria-label="Загрузка из таблицы" aria-valuetext={`${sec} с`}>
        <span style={{ transform: `scaleX(${share})` }} />
      </div>
    </div>
  );
}
