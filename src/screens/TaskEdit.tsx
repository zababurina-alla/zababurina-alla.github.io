// Правка и удаление задачи (п. 14, tasks.update / tasks.delete). Поля — то, что мама реально меняет: текст, срок,
// важность. Удалить — вторым нажатием («Вернуть» на сервере нет). Сделанную задачу сервер править не даёт.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../data/store';
import type { TaskPatch } from '../data/api';
import type { Priority, Task } from '../data/types';
import { TODAY } from '../lib/dates';

const PRIORITIES: [Priority, string][] = [['critical', 'Критический'], ['high', 'Высокий'], ['medium', 'Средний'], ['low', 'Низкий']];

export function TaskEdit({ t, onDone }: { t: Task; onDone: () => void }) {
  const store = useStore();
  const [text, setText] = useState(t.text);
  const [due, setDue] = useState(t.due ?? '');
  const [priority, setPriority] = useState<Priority>(t.priority);
  const [sure, setSure] = useState(false);
  const empty = !text.trim();

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    const patch: TaskPatch = {};
    if (text.trim() !== t.text) patch.text = text.trim();
    if ((due || null) !== t.due) patch.due = due || null;
    if (priority !== t.priority) patch.priority = priority;
    if (Object.keys(patch).length) store.updateTask(t.id, patch);
    onDone();
  };
  const remove = () => {
    if (!sure) { setSure(true); return; }
    store.deleteTask(t.id);
    onDone();
  };

  return (
    <form className="tedit" onSubmit={save} aria-label={`Изменить задачу: ${t.text}`}>
      <label className="tedit__text"><span className="visually-hidden">Текст задачи</span>
        <input className="input input--sm" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-invalid={empty} /></label>
      <label className="tedit__due"><span className="sub">Срок</span>
        <input type="date" className="input input--sm" value={due} min={t.due && t.due < TODAY ? t.due : TODAY} onChange={(e) => setDue(e.target.value)} /></label>
      {due && <button type="button" className="link" onClick={() => setDue('')}>без срока</button>}
      <label className="tedit__prio"><span className="sub">Важность</span>
        <select className="input input--sm" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
        </select></label>
      <span className="tedit__acts">
        <button type="submit" className="btn btn--primary btn--sm" disabled={empty}>Сохранить</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>Отмена</button>
        <button type="button" className={`btn btn--sm ${sure ? 'btn--danger' : 'btn--ghost'}`} onClick={remove}>{sure ? 'Да, удалить' : 'Удалить'}</button>
      </span>
      {empty && <span className="field__error">Текст задачи не может быть пустым</span>}
    </form>
  );
}
