// «Добавить клиента» — три коротких шага, на каждом одно главное действие; в конце видно, что создала система.
import { useEffect, useRef, useState } from 'react';
import { isLive } from '../config';
import gsap from 'gsap';
import { KIND_LABEL } from '../data/fake';
import { useStore } from '../data/store';
import { useDraft } from '../data/drafts';
import { MARK_LABEL, marksProblem } from '../data/types';
import type { Client, ClientKind, ClientMark, Deadline, Rates } from '../data/types';
import { useKvedSearch, useRates } from '../data/reference';
import { TODAY, addDays, fmtDate, fmtDue } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { reducedMotion } from '../ui/kit';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';
import { useUi } from '../app/ui-context';

const GROUP: Partial<Record<ClientKind, number>> = { fop1: 1, fop2: 2, fop3: 3 };

// Начисления для предпросмотра — из reference.rates, цифр в коде нет. Окончательные посчитает таблица, карточка
// получит их в ответе clients.create. Сумму ЄП не выводим из текста ставки («20 % МЗП») — пусть считает сервер.
function charges(kind: ClientKind, r: Rates | null): Client['monthly'] {
  if (!r) return [];
  const esv = { name: 'ЄСВ', kopecks: r.esvMonthlyKopecks, note: r.esvRatePct !== null ? `${r.esvRatePct} % МЗП` : 'минимальный взнос' };
  const g = GROUP[kind];
  const rule = g ? r.groups.find((x) => x.group === g)?.epRule : undefined;
  if (g) return [...(rule ? [{ name: 'ЄП', kopecks: null, note: rule }] : []), esv];
  if (kind === 'fopGeneral') return [esv];
  return [];
}

const KINDS: { id: ClientKind; icon: IconName; hint: string }[] = [
  { id: 'fop1', icon: 'clients', hint: 'рынок, бытовые услуги' },
  { id: 'fop2', icon: 'clients', hint: 'услуги, торговля' },
  { id: 'fop3', icon: 'clients', hint: 'процент с дохода' },
  { id: 'fopGeneral', icon: 'fopGeneral', hint: 'налог с прибыли' },
  { id: 'tov3', icon: 'tov', hint: 'ТОВ на едином налоге' },
  { id: 'tovGeneral', icon: 'tov', hint: 'ТОВ, налог на прибыль' },
];

const MARKS: ClientMark[] = ['pensioner', 'employed', 'allUkraine'];

// На телефоне не открываем клавиатуру сразу: она закрыла бы плитки и шаги.
const finePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

export function AddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const ui = useUi();
  const stepRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClientKind | null>(null);
  const [employer, setEmployer] = useState(false);
  const [kq, setKq] = useState('');
  const [kved, setKved] = useState<string | null>(null);
  const [kvedTitle, setKvedTitle] = useState('');
  const found = useKvedSearch(kq);
  const rates = useRates();
  const r = rates.state === 'ok' ? rates.data : null;
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('ПриватБанк');
  const [marks, setMarks] = useState<ClientMark[]>([]);
  const [keyUntil, setKeyUntil] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // created = null, пока таблица не подтвердила запись; потом — сроки, которые создала система.
  const [result, setResult] = useState<{ client: Client; created: Deadline[] | null } | null>(null);
  const savedClient = Boolean(result?.created);
  // Черновик в IndexedDB: незаконченный ввод переживает закрытие окна и перезагрузку страницы.
  const draft = useDraft('addClient', open && step < 4, { step, name, kind, employer, marks, kved, kvedTitle, phone, bank, keyUntil },
    (v) => { setStep(Math.min(v.step, 3)); setName(v.name); setKind(v.kind); setEmployer(v.employer); setMarks(v.marks ?? []); setKved(v.kved); setKvedTitle(v.kvedTitle ?? ''); setPhone(v.phone); setBank(v.bank); setKeyUntil(v.keyUntil); },
    (v) => !v.name && !v.kind);

  // Звук «сохранено» — в момент подтверждения сервером, не раньше.
  useEffect(() => { if (savedClient) play('saved'); }, [savedClient]);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    // Незаконченный ввод не теряется: окно открывается там, где остановились. (Переживёт перезагрузку — этап 2, IndexedDB.)
    if (open && (result || !name)) { setStep(1); setName(''); setKind(null); setEmployer(false); setMarks([]); setKq(''); setKved(null); setKvedTitle(''); setPhone(''); setKeyUntil(null); setTried(false); setResult(null); }
  }

  // Смена шага: новый шаг въезжает справа (24 px) и проявляется — видно направление движения по шагам.
  useEffect(() => {
    if (!stepRef.current || reducedMotion()) return;
    gsap.fromTo(stepRef.current, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, [step]);

  const err1 = !name.trim() ? 'Напишите ФИО или название' : !kind ? 'Выберите тип' : marksProblem(kind, marks) ?? '';
  const err2 = !kved ? 'Выберите КВЕД — можно искать по словам' : '';

  function next() {
    setTried(true);
    if (step === 1 && err1) {
      play('attention');
      if (!name.trim()) document.getElementById('ac-name')?.focus();
      else document.querySelector<HTMLElement>('.tiles .tile')?.focus();
      return;
    }
    if (step === 2 && err2) { play('attention'); document.getElementById('ac-kved')?.focus(); return; }
    setTried(false);
    if (step < 3) { setStep(step + 1); return; }
    const added = store.addClient({
      name: name.trim(), kind: kind ?? 'fop2', marks, employer, kved: kved ? [{ code: kved, title: kvedTitle }] : [], phone: phone || '—',
      keyIssuer: bank, keyUntil, monthly: isLive() ? [] : charges(kind ?? 'fop2', r),
    }, (created, client) => setResult((r) => (r ? { client, created } : r)));
    setResult({ client: added, created: null });
    void draft.clear();
    setStep(4);
  }

  const footer = step === 4 ? (
    <>
      <button type="button" className="btn btn--secondary" onClick={onClose}>Готово</button>
      <button type="button" className="btn btn--primary btn--grow" onClick={() => { const id = result?.client.id; onClose(); if (id) setTimeout(() => ui.openClient(id), 200); }}>Открыть карточку</button>
    </>
  ) : (
    <>
      {step > 1 ? <button type="button" className="btn btn--secondary" onClick={() => { setTried(false); setStep(step - 1); }}><Icon name="chevronLeft" />Назад</button>
        : <button type="button" className="btn btn--secondary" onClick={onClose}>Отмена</button>}
      <button type="button" className="btn btn--primary btn--grow" onClick={next}>{step === 3 ? 'Добавить клиента' : 'Дальше'}{step < 3 && <Icon name="chevronRight" />}</button>
    </>
  );

  return (
    <Modal open={open} onClose={() => { if (step === 4 || (!name && !kind)) onClose(); else { toast({ text: 'Черновик сохранён — нажмите «Добавить клиента», чтобы продолжить', tone: 'info' }); onClose(); } }}
      title={step === 4 ? (savedClient ? 'Клиент добавлен' : 'Добавляю клиента…') : 'Новый клиент'} footer={footer}>
      {step < 4 && draft.restoredAt && (
        <p className="draft-note" role="status">
          <Icon name="edited" size={16} />Продолжаем с того места, где остановились
          <button type="button" className="link" onClick={() => { void draft.clear(); setStep(1); setName(''); setKind(null); setKved(null); setKvedTitle(''); setPhone(''); setKeyUntil(null); }}>Начать заново</button>
        </p>
      )}
      {step < 4 && (
        <ol className="steps" aria-label={`Шаг ${step} из 3`}>
          {['Кто это', 'Чем занимается', 'Связь и ключ'].map((t, i) => (
            <li key={t} className={`steps__item${i + 1 < step ? ' is-done' : ''}${i + 1 === step ? ' is-current' : ''}`} aria-current={i + 1 === step ? 'step' : undefined}>
              <span className="steps__bar" /><span className="steps__label">{t}</span>
            </li>
          ))}
        </ol>
      )}
      <div ref={stepRef} className="form">
        {step === 1 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ac-name">ФИО или название</label>
              <input id="ac-name" name="clientName" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Коваленко Марія Іванівна…"
                autoComplete="off" spellCheck={false} autoFocus={finePointer} aria-invalid={Boolean(tried && !name.trim())} aria-describedby="ac-err1" />
            </div>
            <fieldset className="field">
              <legend className="field__label">Тип</legend>
              <div className="tiles">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" className="tile" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                    <Icon name={k.icon} /><span className="tile__title">{KIND_LABEL[k.id]}</span><span className="sub">{k.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field__label">Пометки</legend>
              <div className="checks">
                <label className="check"><input type="checkbox" checked={employer} onChange={(e) => setEmployer(e.target.checked)} />Есть работники (работодатель)</label>
                {MARKS.map((m) => (
                  <label key={m} className="check">
                    <input type="checkbox" checked={marks.includes(m)}
                      onChange={(e) => setMarks((xs) => (e.target.checked ? [...xs, m] : xs.filter((x) => x !== m)))} />
                    {MARK_LABEL[m].replace(/^./, (c) => c.toUpperCase())}
                  </label>
                ))}
              </div>
            </fieldset>
            {tried && err1 && <p id="ac-err1" className="field__error" role="alert">{err1}</p>}
          </>
        )}
        {step === 2 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ac-kved">КВЕД</label>
              <div className="combo">
                <span className="combo__icon"><Icon name="search" /></span>
                <input id="ac-kved" className="input input--icon" value={kq} onChange={(e) => setKq(e.target.value)} placeholder="Код или слово: «перукар», «інтернет»…" autoComplete="off" autoFocus={finePointer} />
              </div>
              {kved && <p className="field__hint">Выбран: <span className="num">{kved}</span> {kvedTitle}</p>}
              <div aria-live="polite">
                {found.state === 'idle' && !kved && <p className="field__hint">Наберите хотя бы два знака — поиск по листу «📑 КВЕДы».</p>}
                {found.state === 'loading' && <p className="field__hint">Ищу в таблице…</p>}
                {found.state === 'error' && <p className="field__hint">{found.message}</p>}
                {found.state === 'ok' && !found.data.length && <p className="field__hint">«{kq.trim()}» в таблице не нашёлся — попробуйте код или другое слово.</p>}
              </div>
              {found.state === 'ok' && found.data.length > 0 && (
                <ul className="kved-list" aria-label="КВЕД">
                  {found.data.map((k) => (
                    <li key={k.code}>
                      <button type="button" className="kved-opt" aria-pressed={kved === k.code} onClick={() => { setKved(k.code); setKvedTitle(k.title); }}>
                        <span className="num kved__code">{k.code}</span><span>{k.title}</span>{kved === k.code && <Icon name="check" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {kind && isLive() && (
              <p className="sub">Начисления в месяц посчитает таблица по ставкам из «⚙️ Справочники» — они появятся в карточке после добавления.</p>
            )}
            {kind && !isLive() && (
              <div className="estimate">
                <p className="field__label">Начисления в месяц ({KIND_LABEL[kind]})</p>
                <dl className="charges charges--sm">
                  {charges(kind, r).map((m) => (
                    <div key={m.name} className="charges__item"><dt>{m.name}</dt><dd className="charges__sum num">{m.kopecks !== null ? formatMoney(m.kopecks) : kind === 'fop3' ? 'по доходу' : '—'}</dd><dd className="sub">{m.note}</dd></div>
                  ))}
                </dl>
                <p className="sub">{r ? `Ставки ${r.year} из справочника.` : 'Ставки загружаются из справочника…'} Сумму ЄП по рішенню Миколаївської міськради сервер подставит сам.</p>
              </div>
            )}
            {tried && err2 && <p className="field__error" role="alert">{err2}</p>}
          </>
        )}
        {step === 3 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ac-phone">Телефон</label>
              <input id="ac-phone" name="clientPhone" type="tel" className="input num" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380 …" autoFocus={finePointer} />
              <p className="field__hint">Можно оставить пустым и добавить потом.</p>
            </div>
            <div className="field">
              <span className="field__label">Где выпущен ключ ЭЦП</span>
              <div className="seg" role="group" aria-label="Где выпущен ключ ЭЦП">
                {['ПриватБанк', 'Монобанк', 'Ощадбанк', 'ДПС', 'Дія'].map((b) => (
                  <button key={b} type="button" aria-pressed={bank === b} className="seg__opt" onClick={() => setBank(b)}>{b}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Ключ ЭЦП действует до</span>
              <div className="chips">
                {[['через год', addDays(TODAY, 365)], ['через 2 года', addDays(TODAY, 730)], ['ключа нет', '']].map(([l, iso]) => (
                  <button key={l} type="button" className="chip" aria-pressed={keyUntil === (iso || null)} onClick={() => setKeyUntil(iso || null)}>{l}</button>
                ))}
              </div>
              {keyUntil && <p className="field__hint num">до {fmtDate(keyUntil)}</p>}
            </div>
          </>
        )}
        {step === 4 && result && (savedClient ? (
          <div className="created">
            <p className="created__lead"><span className="created__ok"><Icon name="check" /></span><span><strong>{result.client.name}</strong> записан в таблицу. Система сама создала сроки:</span></p>
            <ul className="created__list">
              {(result.created ?? []).map((d, i) => (
                <li key={d.id} className="created__item" style={{ animationDelay: `${120 * i + 150}ms` }}><Icon name="calendar" size={18} /><span>{d.what}</span><span className="num sub">до {fmtDue(d.due)}</span></li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="created">
            <p className="created__lead"><span className="save__pulse created__wait" aria-hidden="true" /><span>Записываю <strong>{result.client.name}</strong> в таблицу. Система создаёт сроки…</span></p>
            <ul className="created__list" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="created__item created__item--ghost" />)}</ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
