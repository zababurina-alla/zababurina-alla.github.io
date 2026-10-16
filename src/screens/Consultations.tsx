// Консультации клиента (лист «📞 Консультации», API v5.87): записать разговор — тема, минуты, заметка — и список за 90 дней.
// Запись — через очередь (consultations.create, requestId): на экране сразу, «сохраняется…» до ответа таблицы.
// Оформление — за отделом дизайна.
import { useId, useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/Empty';
import { roAttrs } from '../ui/readonly';
import { TableText } from '../ui/TableText';

const TOPIC_MAX = 300;
const NOTE_MAX = 1000;

/** Минуты: пусто — не указано; иначе целое 1–1440 (как проверяет сервер). */
export function parseMinutes(s: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = s.trim().replace(/\s*(мин\.?|хв\.?)$/i, '');
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: 'Минуты — целым числом, например 15' };
  const n = Number(t);
  return n >= 1 && n <= 1440 ? { ok: true, value: n } : { ok: false, error: 'Минуты — от 1 до 1440' };
}

export function ConsultationsTab({ clientId }: { clientId: string }) {
  const store = useStore();
  const ids = useId();
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const can = canWrite('consultations');
  const list = store.consultations.filter((k) => k.clientId === clientId)
    .sort((a, b) => (b.at ?? '9999').localeCompare(a.at ?? '9999'));
  const saving = new Set(store.pending.filter((p) => p.op.kind === 'createConsultation').map((p) => p.op.requestId));
  const mins = parseMinutes(minutes);
  const topicError = !topic.trim() ? 'Напишите тему — о чём говорили' : topic.length > TOPIC_MAX ? `Тема — до ${TOPIC_MAX} знаков` : '';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!can) { store.addConsultation({ clientId, topic: topic.trim(), minutes: null, note: '' }); return; } // скажет, где записать
    if (topicError || !mins.ok || note.length > NOTE_MAX) return;
    store.addConsultation({ clientId, topic: topic.trim(), minutes: mins.value, note: note.trim() });
    setTopic(''); setMinutes(''); setNote(''); setTried(false);
  }

  return (
    <>
      <form className="consult__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-topic`}>О чём говорили</label>
          <input id={`${ids}-topic`} className="input" value={topic} maxLength={TOPIC_MAX} autoComplete="off"
            placeholder="Например: переход на третью группу" onChange={(e) => setTopic(e.target.value)}
            aria-invalid={Boolean(tried && topicError)} />
          {tried && topicError && <p className="field__error" role="alert">{topicError}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-min`}>Минут</label>
          <input id={`${ids}-min`} className="input input--sm num" value={minutes} inputMode="numeric" autoComplete="off"
            placeholder="15" onChange={(e) => setMinutes(e.target.value)} aria-invalid={Boolean(tried && !mins.ok)} />
          {tried && !mins.ok && <p className="field__error" role="alert">{mins.error}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-note`}>Заметка <span className="sub">— необязательно</span></label>
          <textarea id={`${ids}-note`} className="input" rows={2} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" className="btn btn--primary btn--sm" {...roAttrs('consultations')}><Icon name="consult" size={16} />Записать консультацию</button>
      </form>
      {list.length ? (
        <ul className="feed consult__list">{list.map((k) => (
          <li key={k.id} className="feed__item">
            <span className="feed__icon"><Icon name="consult" size={16} /></span>
            <span className="feed__text">
              <strong><TableText text={k.topic} /></strong>
              {k.note && <span><TableText text={k.note} /></span>}
              <span className="sub">
                {saving.has(k.id) ? 'сохраняется…' : k.at ? `${fmtDate(k.at.slice(0, 10))}${k.at.length > 10 ? `, ${k.at.slice(11, 16)}` : ''}` : 'без даты'}
                {k.minutes !== null ? ` · ${k.minutes} мин` : ''}
              </span>
            </span>
          </li>
        ))}</ul>
      ) : <Empty pic="tasks" title="Консультаций пока нет">Записанные здесь и через бота за 90 дней появятся в этом списке.</Empty>}
    </>
  );
}
