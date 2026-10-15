// «Ключ продлён»: новая дата окончания, дата выпуска и где выпущен (clients.update: keyUntil, keyFrom, keyIssuer).
// Раскрывается в карточке клиента. Срок по умолчанию — через год: так выдают чаще всего; поправить — одно поле.
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { Client } from '../data/types';
import { TODAY, addDays, fmtDate } from '../lib/dates';
import { roAttrs } from '../ui/readonly';

export function KeyRenew({ c }: { c: Client }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(addDays(TODAY, 365));
  const [from, setFrom] = useState(TODAY);
  const [issuer, setIssuer] = useState(c.keyIssuer);
  const can = canWrite('clients');
  if (!open) {
    return (
      <button type="button" className="link" onClick={() => (can ? setOpen(true) : store.renewKey(c.id, until, null, null))} {...roAttrs('clients')}>
        Ключ продлён…
      </button>
    );
  }
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(until) && until > TODAY;
  return (
    <form className="keyrenew" onSubmit={(e) => {
      e.preventDefault();
      if (!ok) return;
      store.renewKey(c.id, until, from || null, issuer.trim() && issuer.trim() !== c.keyIssuer ? issuer.trim() : null);
      setOpen(false);
    }}>
      <label><span className="sub">Действует до</span><input type="date" className="input input--sm" value={until} min={addDays(TODAY, 1)} onChange={(e) => setUntil(e.target.value)} /></label>
      <label><span className="sub">Выпущен</span><input type="date" className="input input--sm" value={from} max={TODAY} onChange={(e) => setFrom(e.target.value)} /></label>
      <label><span className="sub">Где выпущен</span><input className="input input--sm" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="ПриватБанк, Дія, АЦСК…" /></label>
      <div className="keyrenew__act">
        <button type="submit" className="btn btn--primary btn--sm" disabled={!ok}>Записать: до {ok ? fmtDate(until) : '…'}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Отмена</button>
      </div>
    </form>
  );
}
