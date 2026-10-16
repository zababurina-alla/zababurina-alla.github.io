// Архив сроков клиента (deadlines.listArchive): снимок держит закрытые за 30 дней, остальное — здесь, по кнопке
// (чтение сервера, не на каждый показ карточки). Только просмотр. Оформление — за отделом дизайна.
import { useState } from 'react';
import { useStore } from '../data/store';
import type { ArchivedDeadline } from '../data/api';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { TableText } from '../ui/TableText';

export function ArchiveBlock({ clientId }: { clientId: string }) {
  const { archive } = useStore();
  const [rows, setRows] = useState<ArchivedDeadline[] | null>(null);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!archive) return null;

  async function load(offset: number) {
    if (!archive) return;
    setBusy(true); setError(null);
    try {
      const p = await archive(clientId, offset);
      setRows((r) => [...(offset ? r ?? [] : []), ...p.items]);
      setMore(p.more); setTotal(p.total);
    } catch (e) {
      setError(e instanceof Error && e.name === 'ApiError' ? e.message : 'Архив не загрузился — таблица не ответила');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cp__block archive" aria-label="Архив сроков">
      {rows === null ? (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { void load(0); }}>
          <Icon name="archive" size={16} />{busy ? 'Загружаю архив…' : 'Показать архив сроков'}</button>
      ) : (
        <>
          <h3 className="cp__h">Архив сроков: {total}</h3>
          {rows.length ? (
            <ul className="feed">{rows.map((d, i) => (
              <li key={d.id ?? `old-${i}`} className="feed__item">
                <span className="feed__icon"><Icon name="done" size={16} /></span>
                <span className="feed__text"><TableText text={d.what} />
                  <span className="sub">{d.due ? `срок ${fmtDate(d.due)}` : 'без срока'}{d.closedAt ? ` · сдано ${fmtDate(d.closedAt.slice(0, 10))}` : ''}</span></span>
              </li>
            ))}</ul>
          ) : <p className="sub">В архиве сроков пока ничего нет.</p>}
          {more && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { void load(rows.length); }}>{busy ? 'Загружаю…' : 'Ещё'}</button>}
        </>
      )}
      {error && <p className="field__error" role="alert">{error}</p>}
    </section>
  );
}
