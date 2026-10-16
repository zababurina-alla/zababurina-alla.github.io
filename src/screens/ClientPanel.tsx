// Карточка клиента — выезжает справа (на телефоне — во весь экран). Вкладки: обзор, сроки, платежи, история.
import { useEffect, useRef, useState } from 'react';
import { RemindDialog } from './RemindDialog';
import { roAttrs } from '../ui/readonly';
import { emailProblem, normEmail, phoneProblem } from '../lib/contact';
import { play } from '../lib/sound';
import { KeyRenew } from './KeyRenew';
import { canWrite } from '../config';
import gsap from 'gsap';
import { kindLabel } from '../data/fake';
import { useStore } from '../data/store';
import { MARK_LABEL, METHOD_LABEL } from '../data/types';
import type { Activity } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { formatMoney, formatPayMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar, Money, SaveBadge, Tabs, reducedMotion } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { URGENCY_ICON } from './DeadlineTable';
import { Modal } from '../ui/Modal';
import { useUi } from '../app/ui-context';
import { TableText } from '../ui/TableText';
import { QuestionAnswer } from './Questions';
import { DeadlineTable } from './DeadlineTable';
import { useRoute } from '../router';

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

/** Поле карточки с правкой на месте: телефон, почта. Версия — та, что мама видела, начиная правку (конфликт). */
// Телефон и почта (clients.update v2.2): проверка до отправки — те же правила, что у сервера (lib/contact).
// Пустое поле — очистить (сервер запишет null). Почта уходит нижним регистром.
function EditableField({ clientId, value, version, label, inputMode, empty, onSave }: {
  clientId: string; value: string; version: number; label: string; inputMode: 'tel' | 'email';
  empty: string; onSave: (v: string, base: number) => void;
}) {
  const store = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  const [base, setBase] = useState(version);
  const problem = edit === null ? null : inputMode === 'tel' ? phoneProblem(edit) : emailProblem(edit);
  const next = edit === null ? '' : inputMode === 'email' ? normEmail(edit) : edit.trim();
  const saving = store.pending.some((p) => p.op.kind === 'updateClient' && p.op.id === clientId);
  if (edit === null) {
    return (
      <p className="row-gap">
        {value ? <span className="num">{value}</span> : <span className="nil">{empty}</span>}
        {saving ? <SaveBadge state="saving" offline={!store.online} /> : (canWrite('clients') ? <button type="button" className="link" onClick={() => { setBase(version); setEdit(value); }}>Изменить</button> : <span className="sub">изменить — в таблице</span>)}
      </p>
    );
  }
  return (
    <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); if (problem) return; if (next !== value) onSave(next, base); setEdit(null); }}>
      <input className="input num" value={edit} onChange={(e) => setEdit(e.target.value)} inputMode={inputMode} type={inputMode === 'email' ? 'email' : 'text'} autoFocus
        aria-label={label} aria-invalid={problem !== null} aria-describedby={problem ? `${clientId}-${inputMode}-err` : undefined} />
      <button type="submit" className="btn btn--primary btn--sm" disabled={problem !== null}>{next || !value ? 'Сохранить' : 'Очистить'}</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Отмена</button>
      {problem && <span id={`${clientId}-${inputMode}-err`} className="field__error" role="alert">{problem}</span>}
    </form>
  );
}

function PhoneField({ clientId, phone, version }: { clientId: string; phone: string; version: number }) {
  const store = useStore();
  return <EditableField clientId={clientId} value={phone} version={version} label="Телефон" inputMode="tel" empty="не указан"
    onSave={(v, base) => store.updatePhone(clientId, v, base)} />;
}

export function ClientPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('overview');
  // Сменили экран (нижнее меню, ссылка) — карточка закрывается, а не висит поверх другого раздела (находка № 26).
  const route = useRoute();
  const lastRoute = useRef(route.name);
  useEffect(() => {
    if (lastRoute.current !== route.name && id) onClose();
    lastRoute.current = route.name;
  }, [route.name, id, onClose]);
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
  // Всё про клиента на одном экране: его открытые задачи и вопросы Дмитрия о нём — прямо в обзоре.
  const tasks = c ? store.tasks.filter((t) => t.clientId === c.id && !t.done) : [];
  const questions = c ? store.questions.filter((q) => q.clientId === c.id) : [];
  // Карточка целиком и история — из clients.get (п. 3, 9): снимок показывается сразу, ответ (до 7 с) дополняет его.
  const [card, setCard] = useState<{ id: string; history: Activity[] | null; error: string | null } | null>(null);
  const { loadClientCard } = store;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadClientCard(id).then(
      (history) => { if (alive) setCard({ id, history, error: null }); },
      (e: unknown) => { if (alive) setCard({ id, history: null, error: e instanceof Error && e.name === 'ApiError' ? e.message : 'Таблица не ответила' }); },
    );
    return () => { alive = false; };
  }, [id, loadClientCard]);
  const cardNow = card && card.id === shownId ? card : null;
  const history = cardNow?.history ?? [];
  const keyDays = c?.keyUntil ? daysBetween(TODAY, c.keyUntil) : null;
  const [remindKey, setRemindKey] = useState(false);

  return (
    <Modal open={Boolean(id)} onClose={onClose} kind="panel" labelledBy="cp-name">
      {c && (
        <div className="cp">
          <header className="cp__head">
            <button type="button" className="icon-btn cp__close" aria-label="Закрыть карточку" onClick={onClose}><Icon name="close" /></button>
            <span className="vt-avatar"><Avatar name={c.name} size="lg" /></span>
            <div className="cp__who">
              <h2 id="cp-name" className="cp__name"><span className="vt-name">{c.name}</span></h2>
              <p className="cp__kind"><span className="tag">{c.kind ? kindLabel(c.kind) : 'тип не указан'}</span>{c.employer && <span className="tag">работодатель</span>}{c.marks.map((m) => <span key={m} className="tag">{MARK_LABEL[m]}</span>)}
                {/* Находка № 12: горящий ключ виден сразу, в шапке, а не ниже первого экрана (до 14 дней или уже закончился) */}
                {keyDays !== null && keyDays <= 14 && (
                  <span className={`tag cp__keytag cp__keytag--${keyDays < 0 ? 'gone' : 'soon'}`}>
                    <Icon name="key" size={14} />{keyDays < 0 ? `ключ закончился ${fmtDate(c.keyUntil ?? '')}` : `ключ до ${fmtDate(c.keyUntil ?? '')}`}
                  </span>
                )}</p>
            </div>
            <div className="cp__actions">
              {c.phone
                ? <a className="btn btn--secondary btn--sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Позвонить</a>
                : <button type="button" className="btn btn--secondary btn--sm" disabled title="Телефон в таблице не указан"><Icon name="phone" />Телефона нет</button>}
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
                  <h3 className="cp__h">Ближайшие сроки{own.length > 3 && <button type="button" className="link cp__all" onClick={() => setTab('deadlines')}>все {own.length}</button>}</h3>
                  <DeadlineTable items={own.slice(0, 3)} showClient={false} empty="Открытых сроков нет" />
                </section>
                {questions.length > 0 && (
                  <section className="cp__block cp__questions">
                    <h3 className="cp__h">Вопрос от Дмитрия</h3>
                    {questions.map((q) => (
                      <div key={q.id} className="question">
                        <p className="question__text"><TableText text={q.text} /></p>
                        <QuestionAnswer q={q} />
                      </div>
                    ))}
                  </section>
                )}
                {tasks.length > 0 && (
                  <section className="cp__block">
                    <h3 className="cp__h">Задачи по клиенту</h3>
                    <ul className="tasks cp__tasks">
                      {tasks.map((t) => (
                        <li key={t.id} className="tasks__row">
                          <button type="button" className="check-btn tasks__check" aria-pressed={false} aria-label={`Сделано: ${t.text}`}
                            onClick={() => { play('done'); store.toggleTask(t.id, true); }}>
                            <span className="check-btn__ring" aria-hidden="true"><Icon name="check" size={16} /></span>
                          </button>
                          <span className="tasks__text"><TableText text={t.text} /></span>
                          {t.due && <span className={`tasks__when due--${statusByDays(daysBetween(TODAY, t.due))}`}>{daysLabel(daysBetween(TODAY, t.due))}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="cp__block">
                  <h3 className="cp__h">Начисления</h3>
                  {c.monthly.length ? (
                    <dl className="charges">
                      {c.monthly.map((m) => (
                        <div key={m.name} className="charges__item">
                          <dt><TableText text={m.name} size={16} /></dt>
                          <dd className="charges__sum display">{m.kopecks !== null ? <Money text={formatMoney(m.kopecks)} /> : <span className="nil">не посчитано</span>}</dd>
                          <dd className="sub">{m.note}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="sub">Начисления ТОВ считаются по отчётности.</p>}
                </section>
                {/* «Связь» — как достучаться до клиента: телефон, почта, бот. Отдельным блоком над фактами (координатор). */}
                <section className="cp__block" aria-labelledby={`${c.id}-contact`}>
                  <h3 id={`${c.id}-contact`} className="cp__h">Связь</h3>
                  <ul className="contact">
                    <li className="contact__row"><Icon name="call" tile="accent" />
                      <div className="contact__body"><span className="contact__label">Телефон</span><PhoneField clientId={c.id} phone={c.phone} version={c.version} /></div></li>
                    <li className="contact__row"><Icon name="email" tile="accent" />
                      <div className="contact__body"><span className="contact__label">Почта</span><EditableField clientId={c.id} value={c.email ?? ''} version={c.version} label="Почта" inputMode="email"
                        empty="не указана" onSave={(v, base) => store.updateEmail(c.id, v, base)} /></div></li>
                    {c.botConnected !== undefined && (
                      <li className="contact__row"><Icon name="bot" tile={c.botConnected ? 'green' : 'grey'} />
                        <div className="contact__body"><span className="contact__label">Telegram-бот</span>
                          <p className={`contact__bot${c.botConnected ? ' is-on' : ''}`}>{c.botConnected ? 'подключён — уведомления уходят клиенту' : 'не подключён — уведомлений клиенту нет'}</p></div></li>
                    )}
                  </ul>
                </section>
                <section className="cp__block cp__facts">
                  <div><h3 className="cp__h">Ключ ЭЦП</h3>{keyDays === null ? <p className="cp__key"><Icon name="inactive" size={18} className="urgency--grey" /><span className="nil">ключа нет в таблице</span></p>
                    : <p className="cp__key"><Icon name={URGENCY_ICON[statusByDays(keyDays)]} size={18} className={`urgency--${statusByDays(keyDays)}`} /><span className="num">до {fmtDate(c.keyUntil ?? '')}</span><span className={`due--${statusByDays(keyDays)}`}>{daysLabel(keyDays)}</span></p>}{c.keyFrom && <p className="sub">выпущен {fmtDate(c.keyFrom)}</p>}<KeyRenew c={c} />
                    {keyDays !== null && keyDays <= 30 && (
                      <button type="button" className="btn btn--secondary btn--sm cp__remind" onClick={() => setRemindKey(true)} {...roAttrs('remind')}>Напомнить про ключ</button>
                    )}
                    {remindKey && <RemindDialog open onClose={() => setRemindKey(false)} client={c} keyReminder />}</div>
                  <div><h3 className="cp__h">Ключ выпущен</h3><p>{c.keyIssuer ? <TableText text={c.keyIssuer} tidy /> : <span className="nil">не указано</span>}</p></div>
                  <div><h3 className="cp__h">Пароль от кабинета</h3><PasswordReveal clientId={c.id} /></div>
                </section>
                <section className="cp__block">
                  <h3 className="cp__h">КВЕД</h3>
                  {c.kved.length ? <ul className="kved">{c.kved.map((k) => <li key={k.code}><span className="num kved__code">{k.code}</span>{k.title}</li>)}</ul> : <p className="nil">КВЕД в таблице не указан</p>}
                </section>
              </>
            )}
            {tab === 'deadlines' && <DeadlineTable items={own} showClient={false} empty="Открытых сроков нет" />}
            {tab === 'payments' && (pays.length ? (
              <ul className="plist">{pays.map((p) => (
                <li key={p.id} className="plist__row"><span><strong className="display"><Money text={formatPayMoney(p.kopecks)} /></strong><span className="sub">{p.period}, {METHOD_LABEL[p.method]}</span></span><span className="num sub">{p.date ? fmtDate(p.date) : <span className="nil">без даты</span>}</span></li>
              ))}</ul>
            ) : <Empty pic="wallet" title="Платежей пока нет" />)}
            {tab === 'history' && !cardNow && (
              <div className="cp__loading" role="status" aria-label="Загружаем историю из таблицы">
                <p className="sk-note"><Icon name="saving" />Загружаем историю из таблицы…</p>
                {[0, 1, 2].map((i) => <div key={i} className="sk-row"><span className="sk sk--avatar" /><span className="sk sk--line" style={{ width: `${45 + i * 12}%` }} /></div>)}
              </div>
            )}
            {tab === 'history' && cardNow?.error && <p className="offline" role="alert"><Icon name="warning" /><span>История не загрузилась: {cardNow.error}</span></p>}
            {tab === 'history' && cardNow?.history && (history.length ? (
              <ul className="feed">{history.map((a) => (
                <li key={a.id} className="feed__item"><span className="feed__icon"><Icon name="clock" size={16} /></span><span className="feed__text"><TableText text={a.text} /><span className="sub">{fmtDate(a.when.slice(0, 10))}, {a.when.slice(11)}, {a.source}</span></span></li>
              ))}</ul>
            ) : <Empty pic="tasks" title="Изменений пока не было">Журнал по клиентам ведётся с 15.10.2026 — правки с сайта, через бота и в таблице появятся здесь.</Empty>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
