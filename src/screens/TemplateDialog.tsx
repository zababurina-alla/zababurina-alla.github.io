// «📋 Шаблон сроков» / «🔁 Пересчитать сроки» (deadlines.applyTemplate v5.88): сначала пробный прогон — что добавится и что
// у клиента уже есть, потом «Создать». Существующие сроки сервер не трогает. Оформление — за отделом дизайна.
import { useEffect, useId, useState } from 'react';
import { useStore } from '../data/store';
import { DEADLINE_TEMPLATES, newRequestId } from '../data/api';
import type { DeadlineTemplate, TemplatePreview } from '../data/api';
import { fmtDate, plural } from '../lib/dates';
import { play } from '../lib/sound';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';

export const TEMPLATE_LABEL: Record<DeadlineTemplate, string> = {
  FOP1: 'ФОП 1 группа', FOP2: 'ФОП 2 группа', FOP3: 'ФОП 3 группа', FOP_GENERAL: 'ФОП, общая система',
  TOV_SIMPLE: 'ТОВ, единый налог', TOV_GENERAL: 'ТОВ, общая система', INDIVIDUAL: 'Физлицо', NONRESIDENT: 'Нерезидент',
  LAND_RENT: 'Аренда земли', EXCISE: 'Акциз', HIRED_WORKERS: 'Наёмные работники (4ДФ)',
};

const PERIOD_WORD: Record<string, string> = { once: 'разово', month: 'каждый месяц', quarter: 'каждый квартал', year: 'каждый год' };

export function TemplateDialog({ open, clientId, onClose }: { open: boolean; clientId: string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const ids = useId();
  const tpl = store.templates;
  const [choice, setChoice] = useState<DeadlineTemplate | ''>(''); // '' — по системе клиента
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [error, setError] = useState<{ text: string; needTemplate: boolean } | null>(null);
  // Для какого «клиент|шаблон» уже пришёл ответ пробного прогона; не совпадает с текущим — считаем.
  const [doneFor, setDoneFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [rid, setRid] = useState(newRequestId);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setChoice(''); setPreview(null); setError(null); setRid(newRequestId()); setBusy(false); setDoneFor(''); }
  }

  // Пробный прогон — при открытии и при смене шаблона.
  useEffect(() => {
    if (!open || !tpl) return;
    let alive = true;
    const key = `${clientId}|${choice}`;
    tpl.preview(clientId, choice || undefined).then((r) => {
      if (!alive) return;
      if ('ok' in r) { setPreview(null); setError({ text: r.message, needTemplate: r.field === 'template' }); }
      else { setPreview(r); setError(null); setRid(newRequestId()); }
      setDoneFor(key);
    }, () => { if (alive) { setError({ text: 'Таблица не ответила — попробуйте ещё раз', needTemplate: false }); setDoneFor(key); } });
    return () => { alive = false; };
  }, [open, tpl, clientId, choice]);

  async function apply() {
    if (!tpl || !preview || busy) return;
    setBusy(true);
    try {
      const r = await tpl.apply(clientId, choice || preview.template, rid);
      if (r.ok) {
        play('saved');
        toast({ text: r.added.length ? `Добавлено ${r.added.length} ${plural(r.added.length, 'срок', 'срока', 'сроков')} по шаблону «${TEMPLATE_LABEL[r.template] ?? r.template}»` : 'Всё уже есть — ничего не добавлено' });
        onClose();
        return;
      }
      setError({ text: r.message, needTemplate: r.field === 'template' });
      play('attention');
    } catch {
      setError({ text: 'Таблица не ответила — нажмите «Создать» ещё раз, дубля не будет', needTemplate: false });
    } finally {
      setBusy(false);
    }
  }

  const loading = open && Boolean(tpl) && doneFor !== `${clientId}|${choice}`;
  const n = preview?.wouldAdd.length ?? 0;
  return (
    <Modal open={open} onClose={onClose} title="Сроки по шаблону" footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Закрыть</button>
        <button type="button" className="btn btn--primary btn--grow" disabled={!preview || !n || busy || loading} onClick={() => { void apply(); }}>
          {busy ? 'Создаю…' : n ? `Создать ${n} ${plural(n, 'срок', 'срока', 'сроков')}` : 'Всё уже есть'}</button>
      </>
    }>
      <div className="form">
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-tpl`}>Шаблон</label>
          <select id={`${ids}-tpl`} className="input" value={choice} onChange={(e) => setChoice(e.target.value as DeadlineTemplate | '')}>
            <option value="">По системе клиента{preview && !choice ? ` — ${TEMPLATE_LABEL[preview.template] ?? preview.template}` : ''}</option>
            {DEADLINE_TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
          </select>
          <p className="field__hint">Добавятся только сроки, которых у клиента ещё нет. Существующие не меняются.</p>
        </div>
        {loading && <p className="sub" role="status">Считаю по таблице…</p>}
        {error && <p className="field__error" role="alert">{error.text}{error.needTemplate ? ' — выберите шаблон выше' : ''}</p>}
        {preview && !loading && (
          <>
            {n > 0 ? (
              <section aria-label="Будет создано">
                <h3 className="cp__h">Будет создано: {n}</h3>
                <ul className="tpl__list">{preview.wouldAdd.map((x) => (
                  <li key={x.obligation}><strong>{x.obligation}</strong> <span className="sub">до {fmtDate(x.due)}, {PERIOD_WORD[x.periodicity] ?? x.periodicity}</span></li>
                ))}</ul>
              </section>
            ) : <p>Все сроки этого шаблона у клиента уже есть.</p>}
            {preview.skipped.length > 0 && (
              <section aria-label="Уже есть">
                <h3 className="cp__h">Уже есть: {preview.skipped.length}</h3>
                <p className="sub">{preview.skipped.join('; ')}</p>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
