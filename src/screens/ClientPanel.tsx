// Карточка клиента — выезжает справа (на телефоне — во весь экран). Вкладки: обзор, сроки, платежи, история.
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { KIND_LABEL } from '../data/fake';
import { useStore } from '../data/store';
import { MARK_LABEL, METHOD_LABEL } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar, SaveBadge, StatusPill, Tabs, reducedMotion } from '../ui/kit';
import { Modal } from '../ui/Modal';
import { useUi } from '../app/ui-context';
import { DeadlineTable } from './DeadlineTable';

type Tab = 'overview' | 'deadlines' | 'payments' | 'history';

// Пароль показывается 30 с и исчезает; не хранится ни в памяти страницы дольше показа, ни в черновиках (бриф, 6б).
const PASSWORD_SHOW_MS = 30_000;

function PasswordReveal({ clientId }: { clientId: string }) {
  const store = useStore();
  const [stage, setStage] = useState<'hidden' | 'confirm' | 'loading' | 'shown'>('hidden');
  // Логин и пароль — только в состоянии этого блока и только на время показа; уходит — стираем.
  const [secret, setSecret] = useState<{ login: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (stage !== 'shown') return;
    const started = Date.now();
    const t = window.setInterval(() => {
      const rest = PASSWORD_SHOW_MS - (Date.now() - started);
      if (rest <= 0) { setSecret(null); setStage('hidden'); window.clearInterval(t); } else setLeft(Math.ceil(rest / 1000));
    }, 250);
    return () => { window.clearInterval(t); setSecret(null); };
  }, [stage]);
  const reveal = async () => {
    setStage('loading');
    setError(null);
    try {
      const r = await store.revealPassword(clientId);
      setSecret({ login: r.login, password: r.password });
      setStage('shown');
    } catch (e) {
      // RATE_LIMIT и прочее — сами не повторяем (контракт, у. 10): говорим, что случилось.
      setError(e instanceof Error && e.message ? e.message : 'Не получилось показать пароль — попробуйте ещё раз');
      setStage('hidden');
    }
  };
  if (stage === 'confirm' || stage === 'loading') {
    return (
      <div className="pw pw--confirm" role="group" aria-label="Подтвердите показ пароля">
        <p>Показать пароль от кабинета налоговой на 30 секунд?</p>
        <div className="row-gap">
          <button type="button" className="btn btn--primary btn--sm" disabled={stage === 'loading'} onClick={() => void reveal()}>
            {stage === 'loading' ? 'Запрашиваю…' : 'Показать'}
          </button>
          <button type="button" className="btn btn--secondary btn--sm" disabled={stage === 'loading'} onClick={() => setStage('hidden')}>Не нужно</button>
        </div>
      </div>
    );
  }
  if (stage === 'shown' && secret) {
    return (
      <div className="pw">
        <span className="sub">Логин</span>
        <code className="pw__value">{secret.login}</code>
        <span className="sub">Пароль</span>
        <code className="pw__value">{secret.password}</code>
        <span className="sub">исчезнет через {left} с</span>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setStage('confirm')}><Icon name="eye" />Показать пароль</button>
      {error && <p className="field__error" role="alert">{error}</p>}
    </>
  );
}

function PhoneField({ clientId, phone, version }: { clientId: string; phone: string; version: number }) {
  const store = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  // Версия, которую мама видела в момент начала правки — с ней правка и уйдёт в таблицу.
  const [base, setBase] = useState(version);
  const saving = store.pending.some((p) => p.op.kind === 'updateClient' && p.op.id === clientId);
  if (edit === null) {
    return (
      <p className="row-gap">
        <span className="num">{phone}</span>
        {saving ? <SaveBadge state="saving" offline={!store.online} /> : <button type="button" className="link" onClick={() => { setBase(version); setEdit(phone); }}>Изменить</button>}
      </p>
    );
  }
  return (
    <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); if (edit.trim() && edit !== phone) store.updatePhone(clientId, edit.trim(), base); setEdit(null); }}>
      <input className="input num" value={edit} onChange={(e) => setEdit(e.target.value)} inputMode="tel" autoFocus aria-label="Телефон" />
      <button type="submit" className="btn btn--primary btn--sm">Сохранить</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Отмена</button>
    </form>
  );
}

export function ClientPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('overview');
  const body = useRef<HTMLDivElement>(null);
  const [shownId, setShownId] = useState(id);
  if (id && id !== shownId) { setShownId(id); setTab('overview'); }
  const c = shownId ? store.client(shownId) : undefined;

  // Содержимое вкладки проявляется снизу (12 px, 200 мс) — видно, что сменилась вкладка.
  useEffect(() => {
    if (!body.current || reducedMotion()) return;
    gsap.fromTo(body.current.children, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, [tab, shownId]);

  const own = c ? store.deadlines.filter((d) => d.clientId === c.id).sort((a, b) => a.due.localeCompare(b.due)) : [];
  const pays = c ? store.payments.filter((p) => p.clientId === c.id) : [];
  const history = c ? store.activity.filter((a) => a.text.includes(c.name.split(' ')[0]?.slice(0, 5) ?? '#')) : [];
  const keyDays = c?.keyUntil ? daysBetween(TODAY, c.keyUntil) : null;

  return (
    <Modal open={Boolean(id)} onClose={onClose} kind="panel" labelledBy="cp-name">
      {c && (
        <div className="cp">
          <header className="cp__head">
            <button type="button" className="icon-btn cp__close" aria-label="Закрыть карточку" onClick={onClose}><Icon name="close" /></button>
            <span className="vt-avatar"><Avatar name={c.name} size="lg" /></span>
            <div className="cp__who">
              <h2 id="cp-name" className="cp__name"><span className="vt-name">{c.name}</span></h2>
              <p className="cp__kind"><span className="tag">{KIND_LABEL[c.kind]}</span>{c.employer && <span className="tag">работодатель</span>}{c.marks.map((m) => <span key={m} className="tag">{MARK_LABEL[m]}</span>)}</p>
            </div>
            <div className="cp__actions">
              <a className="btn btn--secondary btn--sm" href={`tel:${c.phone.replace(/\s/g, '')}`}><Icon name="phone" />Позвонить</a>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => ui.openPayment(c.id)}><Icon name="plus" />Платёж</button>
            </div>
          </header>

          <Tabs label="Раздел карточки" value={tab} onChange={setTab} items={[
            { id: 'overview', label: 'Обзор' },
            { id: 'deadlines', label: 'Сроки', count: own.length },
            { id: 'payments', label: 'Платежи', count: pays.length },
            { id: 'history', label: 'История' },
          ]} />

          <div ref={body} className="cp__body">
            {tab === 'overview' && (
              <>
                <section className="cp__block">
                  <h3 className="cp__h">Начисления в месяц</h3>
                  {c.monthly.length ? (
                    <dl className="charges">
                      {c.monthly.map((m) => (
                        <div key={m.name} className="charges__item">
                          <dt>{m.name}</dt>
                          <dd className="charges__sum num">{m.kopecks !== null ? formatMoney(m.kopecks) : 'по доходу'}</dd>
                          <dd className="sub">{m.note}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="sub">Начисления ТОВ считаются по отчётности.</p>}
                </section>
                <section className="cp__block cp__facts">
                  <div><h3 className="cp__h">Ключ ЭЦП</h3>{keyDays === null ? <p className="sub">Нет данных</p>
                    : <p className="row-gap"><span className="num">до {fmtDate(c.keyUntil ?? '')}</span><StatusPill status={statusByDays(keyDays)}>{daysLabel(keyDays)}</StatusPill></p>}</div>
                  <div><h3 className="cp__h">Ключ выпущен</h3><p>{c.keyIssuer || '—'}</p></div>
                  <div><h3 className="cp__h">Телефон</h3><PhoneField clientId={c.id} phone={c.phone} version={c.version} /></div>
                  <div><h3 className="cp__h">Пароль от кабинета</h3><PasswordReveal clientId={c.id} /></div>
                </section>
                <section className="cp__block">
                  <h3 className="cp__h">КВЕД</h3>
                  <ul className="kved">{c.kved.map((k) => <li key={k.code}><span className="num kved__code">{k.code}</span>{k.title}</li>)}</ul>
                </section>
                <section className="cp__block">
                  <h3 className="cp__h">Ближайшие сроки</h3>
                  <DeadlineTable items={own.slice(0, 3)} showClient={false} empty="Открытых сроков нет" />
                </section>
              </>
            )}
            {tab === 'deadlines' && <DeadlineTable items={own} showClient={false} empty="Открытых сроков нет" />}
            {tab === 'payments' && (pays.length ? (
              <ul className="plist">{pays.map((p) => (
                <li key={p.id} className="plist__row"><span><strong className="num">{formatMoney(p.kopecks)}</strong><span className="sub">{p.period}, {METHOD_LABEL[p.method]}</span></span><span className="num sub">{fmtDate(p.date)}</span></li>
              ))}</ul>
            ) : <p className="empty">Платежей пока нет</p>)}
            {tab === 'history' && (history.length ? (
              <ul className="feed">{history.map((a) => (
                <li key={a.id} className="feed__item"><span className="feed__icon"><Icon name="clock" size={16} /></span><span className="feed__text">{a.text}<span className="sub">{fmtDate(a.when.slice(0, 10))}, {a.when.slice(11)}, {a.source}</span></span></li>
              ))}</ul>
            ) : <p className="empty">Изменений пока не было</p>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
