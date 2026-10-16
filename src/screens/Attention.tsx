// «Требуют внимания» (reports.attention — тот же список, что бот по слову «внимание»): клиенты по баллу риска с причинами.
// Сервер читает три листа — запрашиваем не чаще раза в 5 мин (общий запас на страницу). Оформление — за отделом дизайна.
import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import type { AttentionItem } from '../data/api';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';

const FRESH_MS = 5 * 60_000;
let cache: { at: number; items: AttentionItem[] } | null = null;
/** Свежий ответ в запасе (моложе 5 мин) или null. */
function cached(): AttentionItem[] | null {
  return cache && Date.now() - cache.at < FRESH_MS ? cache.items : null;
}

const LEVEL: Record<AttentionItem['level'], string> = { high: 'высокий', mid: 'средний', low: 'низкий' };

export function AttentionPanel() {
  const { attention } = useStore();
  const ui = useUi();
  const [items, setItems] = useState<AttentionItem[] | null>(cached);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!attention || cached()) return;
    let alive = true;
    attention(10).then((r) => { cache = { at: Date.now(), items: r }; if (alive) setItems(r); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attention]);
  if (!attention || failed || !items || !items.some((i) => i.level !== 'low')) return null;
  const shown = items.filter((i) => i.level !== 'low').slice(0, 5);
  return (
    <section className="panel attention reveal" aria-labelledby="t-att">
      <header className="panel__head">
        <h2 id="t-att" className="panel__title"><Icon name="attention" tile="orange" />Требуют внимания</h2>
      </header>
      <ul className="attention__list">
        {shown.map((i) => (
          <li key={i.clientId} className={`attention__row attention__row--${i.level}`}>
            <button type="button" className="linklike attention__who" onClick={() => ui.openClient(i.clientId)}>
              <Avatar name={i.name} clientId={i.clientId} size="sm" /><strong>{shortName(i.name)}</strong>
            </button>
            {/* Уровень словами («риск средний»), балл — в подсказке: «средний · 45» маме ничего не говорило (приёмка С-2) */}
            <span className="tag" title={`Балл риска ${i.score} из 100 — по просрочкам, ключу и платежам`}>риск {LEVEL[i.level]}</span>
            <span className="sub attention__why">{i.factors.filter((f) => f.weight > 0).map((f) => f.label).join(', ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
