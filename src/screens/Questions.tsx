// Вопросы по таблице маме (системные: пакеты сверки и импорта, лист «❓ Вопросы»; тестовые — test: true — не показываем): ответ кнопками или полем, «Позже» (только на сайте, localStorage — ui/later.ts),
// весь список — по клиентам. Одна деталь на «Сегодня»; ответ на вопрос — и в карточке клиента.
import { useEffect, useState } from 'react';
import { questionBotLink } from '../lib/botLink';
import { BOT_URL, canWrite, hasFeature } from '../config';
import { HOLD_MS } from '../data/store';
import { useStore } from '../data/store';
import type { Question } from '../data/types';
import { fmtDayMonth, plural } from '../lib/dates';
import { forgetAnswered, rememberAnswered, startEdit, stopEdit, useEditing } from '../ui/answered';
import { Icon } from '../ui/Icon';
import { TableText } from '../ui/TableText';
import { setLater, useLater } from '../ui/later';
import { shortName } from '../ui/names';
import { useToast } from '../ui/toast';

/** Ответ на вопрос: варианты — кнопками, текст или число — полем. Записывается в таблицу, вопрос уходит из списка.
 *  replace — прежний ответ: вопрос показан снова ради «Изменить» (флаг answerReplace), ответ уходит как замена. */
export function QuestionAnswer({ q, replace }: { q: Question; replace?: string }) {
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState(replace ?? '');
  const canReplace = hasFeature('answerReplace');
  const saving = replace !== undefined && store.pending.some((p) => p.op.kind === 'answerQuestion' && p.op.id === q.id);
  // Ссылка сразу на этот вопрос: бот пришлёт его заново с кнопками (формат отдела «Бот»). Пока ключ считается — просто бот.
  const [href, setHref] = useState(BOT_URL);
  const ro = !canWrite('questions');
  useEffect(() => {
    if (!ro) return;
    let alive = true;
    questionBotLink(q.id).then((h) => { if (alive) setHref(h); }, () => undefined);
    return () => { alive = false; };
  }, [ro, q.id]);
  // Запись ответов выключена — не пустота, а куда идти (находка «Пользователя» № 1).
  if (ro) {
    return (
      <div className="question__answers question__answers--ro">
        <span className="sub">На сайте ответить пока нельзя.</span>
        <a className="btn btn--secondary btn--sm" href={href} target="_blank" rel="noopener noreferrer"><Icon name="bot" size={16} />Ответить в Telegram</a>
      </div>
    );
  }
  const send = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const again = canReplace ? { action: { label: 'Изменить', run: () => { startEdit(q.id); } } } : {};
    if (replace !== undefined) {
      // Замена записанного ответа: без ожидания; отказ сервера (уже применено, от ответа зависят следующие вопросы) — уведомлением с его текстом.
      if (v === replace) { stopEdit(q.id); return; }
      store.answerQuestion(q.id, v, () => { rememberAnswered(q, v); stopEdit(q.id); toast({ text: `Ответ изменён: «${v}»`, ...again }); }, true);
      return;
    }
    if (canReplace) rememberAnswered(q, v);
    // 10 с на «Отменить»: нажатая не та кнопка не уходит в таблицу (находка № 2).
    const rid = store.answerQuestion(q.id, v, () => toast({ text: `Ответ «${v}» записан в таблицу`, ...again }));
    toast({ text: `Ответ «${v}» — отправлю через 10 с`, tone: 'info', timeout: HOLD_MS, action: { label: 'Отменить', run: () => {
      void store.undoHeld(rid).then((ok) => {
        if (ok) forgetAnswered(q.id);
        toast(ok ? { text: 'Ответ отменён — вопрос снова в списке', tone: 'info' }
          : canReplace ? { text: 'Ответ уже записан', tone: 'info', ...again }
          : { text: 'Ответ уже в таблице — исправить можно в таблице', tone: 'info' });
      });
    } } });
  };
  if (q.type === 'choice') {
    return (
      <div className="question__answers" role="group" aria-label="Варианты ответа">
        {q.options.map((o) => <button key={o} type="button" className={`btn btn--${o === replace ? 'primary' : 'secondary'} btn--sm`} disabled={saving} aria-pressed={replace === undefined ? undefined : o === replace} onClick={() => send(o)}>{o}</button>)}
      </div>
    );
  }
  return (
    <form className="question__answers" onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <input className="input input--sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Ваш ответ"
        inputMode={q.type === 'number' ? 'decimal' : 'text'} placeholder={q.type === 'number' ? 'Число' : 'Ответ'} autoComplete="off" />
      <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim() || saving}>{replace === undefined ? 'Ответить' : 'Изменить'}</button>
    </form>
  );
}

/** Вопросы, открытые на изменение ответа («Изменить»). В карточке клиента (clientId) — свой блок, на «Сегодня» — внутри панели. */
export function QuestionEdits({ clientId }: { clientId?: string }) {
  const store = useStore();
  const open = new Set(store.questions.map((q) => q.id));
  // Если вопрос снова открыт в списке (ответ отменён или не записался) — менять нечего.
  const edits = useEditing().filter((e) => !open.has(e.q.id) && (clientId === undefined || e.q.clientId === clientId));
  if (!edits.length) return null;
  const items = edits.map((e) => (
    <div key={e.q.id} className="question question--edit">
      <p className="question__text"><TableText text={e.q.text} /></p>
      <QuestionAnswer q={e.q} replace={e.answer} />
      <p className="question__foot sub">
        <span>Записано: «{e.answer}»</span>
        <button type="button" className="link question__later" onClick={() => stopEdit(e.q.id)}>Не менять</button>
      </p>
    </div>
  ));
  return clientId === undefined ? <>{items}</> : <section className="cp__block cp__questions"><h3 className="cp__h">Изменить ответ</h3>{items}</section>;
}

function QuestionItem({ q, later }: { q: Question; later: boolean }) {
  return (
    <div className={`question${later ? ' question--later' : ''}`}>
      <p className="question__text"><TableText text={q.text} /></p>
      <QuestionAnswer q={q} />
      <p className="question__foot sub">
        <span>{q.askedAt ? `${fmtDayMonth(q.askedAt.slice(0, 10))}, ${q.askedAt.slice(11, 16)}` : ''}{canWrite('questions') ? `${q.askedAt ? ' · ' : ''}можно ответить и в Telegram-боте` : ''}</span>
        <button type="button" className="link question__later" onClick={() => setLater(q.id, !later)}>
          <Icon name={later ? 'undo' : 'later'} size={16} />{later ? 'Вернуть' : 'Позже'}
        </button>
      </p>
    </div>
  );
}

const SHOWN = 2; // на «Сегодня» видно 2 вопроса; вопросов бывает десятки (на живой таблице 48)

export function QuestionsPanel() {
  const store = useStore();
  const laterIds = useLater();
  const [all, setAll] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const editing = useEditing().filter((e) => !store.questions.some((q) => q.id === e.q.id)).length;
  if (!store.questions.length && !editing) return null;
  const active = store.questions.filter((q) => !laterIds.includes(q.id));
  const later = store.questions.filter((q) => laterIds.includes(q.id));
  // Весь список — по клиентам: так вопросы об одном клиенте разбираются разом.
  const groups = new Map<string, Question[]>();
  for (const q of active) groups.set(q.clientId ?? '', [...(groups.get(q.clientId ?? '') ?? []), q]);
  const title = (id: string) => (id ? shortName(store.client(id)?.name ?? 'Клиент не найден') : 'Общие вопросы');
  return (
    <section className="panel panel--wheat reveal" aria-labelledby="t-q">
      <header className="panel__head">
        <h2 id="t-q" className="panel__title"><Icon name="questions" tile="wheat" />
          {active.length === 1 ? 'Вопрос по таблице' : active.length ? `Вопросы по таблице: ${active.length}` : later.length ? 'Вопросы отложены' : 'Изменить ответ'}</h2>
        {all && <button type="button" className="link" onClick={() => setAll(false)}>Свернуть</button>}
      </header>
      <QuestionEdits />
      {!all && active.slice(0, SHOWN).map((q) => <QuestionItem key={q.id} q={q} later={false} />)}
      {/* Все вопросы — в листе со своей прокруткой (не выше 70 % экрана): 48 вопросов растягивали «Сегодня» на 10 000 px
          (находки «Пользователя» № 2, 44). Имя клиента прилипает сверху, «Свернуть» — в шапке. */}
      {all && (
        <div className="qall" tabIndex={0} aria-label="Все вопросы по клиентам">
          {[...groups.entries()].map(([id, list]) => (
            <div key={id || 'none'} className="qgroup">
              <h3 className="qgroup__title"><Icon name={id ? 'clients' : 'questions'} size={16} />{title(id)}<span className="sub num">{list.length}</span></h3>
              {list.map((q) => <QuestionItem key={q.id} q={q} later={false} />)}
            </div>
          ))}
        </div>
      )}
      {!all && active.length > SHOWN && (
        <button type="button" className="dgroup__more" onClick={() => setAll(true)}>
          Показать все {active.length} {plural(active.length, 'вопрос', 'вопроса', 'вопросов')} — по клиентам
        </button>
      )}
      {later.length > 0 && (
        <div className="qlater">
          <button type="button" className="link qlater__toggle" aria-expanded={showLater} onClick={() => setShowLater(!showLater)}>
            <Icon name="later" size={16} />Отложенные: {later.length}
          </button>
          {showLater && later.map((q) => <QuestionItem key={q.id} q={q} later />)}
        </div>
      )}
    </section>
  );
}
