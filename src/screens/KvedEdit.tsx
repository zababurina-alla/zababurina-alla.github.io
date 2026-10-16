// КВЕД клиента в карточке: показать и править — добавить код, убрать код (clients.update patch.kved — весь список).
// Главный КВЕД («⭐ Расчёт ЄП по») сервер выбирает сам по максимальной ставке, как таблица: вручную не выбирается.
// Код — в виде «NN.NN» (читалка parseKvedCode); название подсказывается из листа «📑 КВЕДы». Оформление — за дизайном.
import { useState } from 'react';
import { canWrite, hasFeature } from '../config';
import { useStore } from '../data/store';
import type { Client } from '../data/types';
import { useKvedTitles } from '../data/reference';
import { parseKvedCode } from '../lib/kvedCode';
import { normalizeKved } from '../lib/kvedLookup';
import { Icon } from '../ui/Icon';
import { SaveBadge } from '../ui/kit';
import { roAttrs } from '../ui/readonly';

const MAX = 20; // сервер принимает до 20 кодов

export function KvedEdit({ c }: { c: Client }) {
  const store = useStore();
  const titles = useKvedTitles();
  const [edit, setEdit] = useState<string[] | null>(null);
  const [base, setBase] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const saving = store.pending.some((p) => p.op.kind === 'updateClient' && p.op.id === c.id && 'kved' in p.op.patch);
  const title = (code: string) => c.kved.find((k) => k.code === code)?.title || titles.get(code) || '';

  function add() {
    if (!edit) return;
    const code = parseKvedCode(input);
    if (!code) { setError('Код КВЕД — в виде 47.21 (две цифры, точка, две цифры)'); return; }
    // Сервер хранит 47.20 как 47.2 (как таблица) — сравниваем без нулей в конце, иначе «47.20» рядом с «47.2» — дубль.
    const same = edit.find((k) => normalizeKved(k) === normalizeKved(code));
    if (same) { setError(`${same} уже в списке`); return; }
    if (edit.length >= MAX) { setError(`Не больше ${MAX} кодов`); return; }
    setEdit([...edit, code]); setInput(''); setError('');
  }

  function save() {
    if (!edit) return;
    store.updateKved(c.id, edit, base);
    setEdit(null);
  }

  if (edit) {
    const code = parseKvedCode(input);
    return (
      <div className="kved-edit">
        <ul className="kved">
          {edit.map((k) => (
            <li key={k}><span className="num kved__code">{k}</span>{title(k) || <span className="nil">название не указано</span>}
              <button type="button" className="icon-btn kved-edit__del" aria-label={`Убрать ${k}`} onClick={() => setEdit(edit.filter((x) => x !== k))}><Icon name="close" size={16} /></button></li>
          ))}
        </ul>
        <form className="kved-edit__add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input input--sm num" value={input} onChange={(e) => { setInput(e.target.value); setError(''); }} placeholder="47.21" inputMode="decimal" aria-label="Код КВЕД" autoComplete="off" />
          <button type="submit" className="btn btn--secondary btn--sm" disabled={!input.trim()}><Icon name="plus" size={16} />Добавить</button>
          {code && !edit.some((k) => normalizeKved(k) === normalizeKved(code)) && <span className="sub">{title(code) || 'в листе «📑 КВЕДы» такого кода нет — проверьте'}</span>}
        </form>
        {error && <p className="field__error" role="alert">{error}</p>}
        {/* Главный по ставке — только у ФОП 1–2 группы; у 3 группы и других ЄП от оборота, главного нет (сервер 16.10) */}
        {(c.kind === 'fop1' || c.kind === 'fop2') && <p className="sub">Главный КВЕД (по нему ЄП) таблица выберет сама — по наибольшей ставке.</p>}
        <div className="kved-edit__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>Сохранить</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEdit(null); setError(''); }}>Отмена</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {c.kved.length ? <ul className="kved">{c.kved.map((k) => (
        <li key={k.code}>{hasFeature('kvedEdit') && c.kvedMain === k.code && <Icon name="star" size={14} className="kv__star" label="Главный — по нему считается ЄП" />}
          <span className="num kved__code">{k.code}</span>{title(k.code) || <span className="nil">название не указано</span>}</li>
      ))}</ul> : <p className="nil">КВЕД в таблице не указан</p>}
      {!hasFeature('kvedEdit') ? null : saving ? <SaveBadge state="saving" offline={!store.online} />
        : canWrite('clients')
          ? <button type="button" className="link" onClick={() => { setEdit(c.kved.map((k) => k.code)); setBase(c.version); }}>Изменить КВЕД</button>
          : <span className="sub" {...roAttrs('clients')}>изменить — в таблице</span>}
    </>
  );
}
