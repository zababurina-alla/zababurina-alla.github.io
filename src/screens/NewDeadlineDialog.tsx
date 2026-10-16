// «➕ Новый срок» (deadlines.create v5.88): клиент, что сдать, дата, как часто, заметка. Мимо очереди: ответ нужен
// сразу — у клиента уже есть такой открытый срок (CONFLICT) → «открыть его». Нет связи — «ещё раз» тем же requestId,
// сервер не задвоит. periodEnd не спрашиваем: сервер считает его сам. Оформление — за отделом дизайна.
import { useId, useState } from 'react';
import { useStore } from '../data/store';
import { newRequestId } from '../data/api';
import type { Deadline } from '../data/types';
import { TODAY, addDays, endOfMonth, fmtDate, parseUserDate } from '../lib/dates';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';
import { useUi } from '../app/ui-context';

const PERIODS: [Deadline['periodicity'], string][] = [['once', 'Разово'], ['month', 'Каждый месяц'], ['quarter', 'Каждый квартал'], ['year', 'Каждый год']];

export function NewDeadlineDialog({ open, clientId, onClose }: { open: boolean; clientId: string | null; onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const toast = useToast();
  const ids = useId();
  const [who, setWho] = useState<string>(clientId ?? '');
  const [what, setWhat] = useState('');
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState<Deadline['periodicity']>('once');
  const [note, setNote] = useState('');
  const [rid, setRid] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<{ field: string | null; text: string; current: Deadline | null } | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setWho(clientId ?? ''); setWhat(''); setDate(''); setPeriod('once'); setNote(''); setRid(newRequestId()); setBusy(false); setTried(false); setErr(null); }
  }

  const due = parseUserDate(date);
  const whatError = !what.trim() ? 'Напишите, что сдать — например «Декларація ЄП за IV квартал»' : what.length > 300 ? 'До 300 знаков' : '';
  const dateError = !date.trim() ? 'Укажите дату' : !due ? 'Не понял дату — напишите, например, 20.11.2026 или «20 ноября»' : '';
  const whoError = who ? '' : 'Выберите клиента';
  // Подсказки «что сдать» — обязательства, которые уже есть в сроках (как пишет таблица).
  const known = [...new Set(store.deadlines.map((d) => d.what))].sort((a, b) => a.localeCompare(b, 'uk')).slice(0, 200);
  const clients = [...store.clients].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const create = store.createDeadline;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!create || whatError || dateError || whoError || !due || busy) { play('attention'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await create({ clientId: who, obligation: what.trim(), due, periodicity: period, note: note.trim() }, rid);
      if (r.ok) {
        play('saved');
        toast({ text: `Новый срок: ${r.deadline.what} — до ${fmtDate(r.deadline.due ?? due)}` });
        onClose();
        return;
      }
      setErr({ field: r.field, text: r.message, current: r.code === 'CONFLICT' ? r.current : null });
      setRid(newRequestId()); // отказ окончательный — следующая попытка новая
      play('attention');
    } catch {
      setErr({ field: null, text: 'Таблица не ответила — нажмите «Создать срок» ещё раз, дубля не будет', current: null });
    } finally {
      setBusy(false);
    }
  }

  const fieldErr = (f: string) => (err && err.field === f && !err.current ? err.text : '');
  const quick: [string, string][] = [['завтра', addDays(TODAY, 1)], ['через неделю', addDays(TODAY, 7)], ['конец месяца', endOfMonth(TODAY)]];

  return (
    <Modal open={open} onClose={onClose} title="Новый срок" footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Закрыть</button>
        <button type="submit" form={`${ids}-form`} className="btn btn--primary btn--grow" disabled={busy}>{busy ? 'Создаю…' : 'Создать срок'}</button>
      </>
    }>
      <form id={`${ids}-form`} className="form" onSubmit={(e) => { void submit(e); }} noValidate>
        {!clientId && (
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-who`}>Клиент</label>
            <select id={`${ids}-who`} className="input" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">— выберите —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {tried && (whoError || fieldErr('clientId')) && <p className="field__error" role="alert">{whoError || fieldErr('clientId')}</p>}
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-what`}>Что сдать или оплатить</label>
          <input id={`${ids}-what`} className="input" list={`${ids}-known`} value={what} maxLength={300} autoComplete="off"
            onChange={(e) => { setWhat(e.target.value); if (err?.current) setErr(null); }} aria-invalid={Boolean(tried && (whatError || fieldErr('obligation')))} />
          <datalist id={`${ids}-known`}>{known.map((k) => <option key={k} value={k} />)}</datalist>
          {tried && (whatError || fieldErr('obligation')) && <p className="field__error" role="alert">{whatError || fieldErr('obligation')}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-due`}>Срок</label>
          <input id={`${ids}-due`} className="input" value={date} placeholder="20.11.2026" autoComplete="off" onChange={(e) => setDate(e.target.value)}
            aria-invalid={Boolean(tried && (dateError || fieldErr('due')))} />
          <div className="chips" role="group" aria-label="Быстрая дата">
            {quick.map(([label, iso]) => <button key={label} type="button" className="chip" onClick={() => setDate(fmtDate(iso))}>{label}</button>)}
          </div>
          {tried && (dateError || fieldErr('due'))
            ? <p className="field__error" role="alert">{dateError || fieldErr('due')}</p>
            : due ? <p className="field__hint">Будет: <strong>{fmtDate(due)}</strong></p> : null}
        </div>
        <div className="field">
          <span className="field__label">Как часто</span>
          <div className="seg" role="group" aria-label="Как часто">
            {PERIODS.map(([p, label]) => <button key={p} type="button" className="seg__opt" aria-pressed={period === p} onClick={() => setPeriod(p)}>{label}</button>)}
          </div>
          {period !== 'once' && <p className="field__hint">Когда закроете — следующий период таблица создаст сама.</p>}
          {fieldErr('periodicity') && <p className="field__error" role="alert">{fieldErr('periodicity')}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-note`}>Заметка <span className="sub">— необязательно</span></label>
          <textarea id={`${ids}-note`} className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {err?.current && (
          <div className="offline offline--info" role="alert">
            <Icon name="info" />
            <span>У клиента уже есть открытый срок <strong>«{err.current.what}»</strong>{err.current.due ? ` — до ${fmtDate(err.current.due)}` : ''}. Второй такой не нужен.</span>
            <button type="button" className="link" onClick={() => { const id = err.current?.clientId ?? who; onClose(); ui.openClient(id); }}>Открыть его</button>
          </div>
        )}
        {err && !err.current && !err.field && <p className="field__error" role="alert">{err.text}</p>}
      </form>
    </Modal>
  );
}
