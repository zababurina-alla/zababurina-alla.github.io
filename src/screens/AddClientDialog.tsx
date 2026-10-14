// «Добавить клиента» — три коротких шага, на каждом одно главное действие; в конце видно, что создала система.
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { KIND_LABEL } from '../data/fake';
import { useStore } from '../data/store';
import type { Client, ClientKind, Deadline } from '../data/types';
import { TODAY, addDays, fmtDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { fold } from '../lib/search';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { reducedMotion } from '../ui/kit';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';
import { useUi } from '../app/ui-context';

// Мини-справочник КВЕД для прототипа. На живых данных — поиск по листу 📑 КВЕДы через API.
const KVEDS = [
  ['96.02', 'Надання послуг перукарнями та салонами краси', 'перукар салон краси'],
  ['47.91', 'Роздрібна торгівля через інтернет', 'інтернет магазин торгівля онлайн'],
  ['62.01', "Комп'ютерне програмування", 'програміст айті програмування'],
  ['56.10', 'Діяльність ресторанів', 'кафе ресторан їжа'],
  ['47.81', 'Роздрібна торгівля з лотків харчовими продуктами', 'ринок продукти лоток'],
  ['45.20', 'Технічне обслуговування автотранспортних засобів', 'сто авто ремонт машин'],
  ['85.59', 'Інші види освіти', 'репетитор курси навчання'],
  ['74.10', 'Спеціалізована діяльність із дизайну', 'дизайн дизайнер'],
  ['69.20', 'Діяльність у сфері бухгалтерського обліку', 'бухгалтер облік'],
] as const;

// Начисления по типу — те же ставки 2026, что в fake.ts (бриф: МЗП 8 647, ПМ 3 328). На живых данных их отдаёт сервер.
function charges(kind: ClientKind): Client['monthly'] {
  const esv = { name: 'ЄСВ', kopecks: 190234, note: '22 % МЗП' };
  if (kind === 'fop1') return [{ name: 'ЄП', kopecks: 33280, note: '10 % ПМ' }, esv, { name: 'ВЗ', kopecks: 86470, note: '10 % МЗП' }];
  if (kind === 'fop2') return [{ name: 'ЄП', kopecks: 172940, note: '20 % МЗП' }, esv, { name: 'ВЗ', kopecks: 86470, note: '10 % МЗП' }];
  if (kind === 'fop3') return [{ name: 'ЄП', kopecks: 0, note: '5 % дохода' }, esv];
  if (kind === 'general') return [esv];
  return [];
}

const KINDS: { id: ClientKind; icon: IconName; hint: string }[] = [
  { id: 'fop1', icon: 'clients', hint: 'рынок, бытовые услуги' },
  { id: 'fop2', icon: 'clients', hint: 'услуги, торговля' },
  { id: 'fop3', icon: 'clients', hint: 'процент с дохода' },
  { id: 'general', icon: 'book', hint: 'налог на прибыль' },
  { id: 'tov', icon: 'building', hint: 'юридическое лицо' },
];

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
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('ПриватБанк');
  const [keyUntil, setKeyUntil] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<{ client: Client; created: Deadline[] } | null>(null);
  const savedClient = result ? store.saving[result.client.id] === 'saved' : false;
  // Звук «сохранено» — в момент подтверждения сервером, не раньше.
  useEffect(() => { if (savedClient) play('saved'); }, [savedClient]);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    // Незаконченный ввод не теряется: окно открывается там, где остановились. (Переживёт перезагрузку — этап 2, IndexedDB.)
    if (open && (result || !name)) { setStep(1); setName(''); setKind(null); setEmployer(false); setKq(''); setKved(null); setPhone(''); setKeyUntil(null); setTried(false); setResult(null); }
  }

  // Смена шага: новый шаг въезжает справа (24 px) и проявляется — видно направление движения по шагам.
  useEffect(() => {
    if (!stepRef.current || reducedMotion()) return;
    gsap.fromTo(stepRef.current, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, [step]);

  const kveds = KVEDS.filter(([code, title, words]) => !kq || code.startsWith(kq.trim()) || fold(`${title} ${words}`).includes(fold(kq)));
  const err1 = !name.trim() ? 'Напишите ФИО или название' : !kind ? 'Выберите тип' : '';
  const err2 = !kved ? 'Выберите КВЕД — можно искать по словам' : '';

  function next() {
    setTried(true);
    if (step === 1 && err1) { play('attention'); return; }
    if (step === 2 && err2) { play('attention'); return; }
    setTried(false);
    if (step < 3) { setStep(step + 1); return; }
    const k = KVEDS.find(([code]) => code === kved);
    const res = store.addClient({
      name: name.trim(), kind: kind ?? 'fop2', employer, kved: k ? [{ code: k[0], title: k[1] }] : [], phone: phone || '—', bank,
      keyUntil, monthly: charges(kind ?? 'fop2'),
    });
    setResult(res);
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
    <Modal open={open} onClose={() => { if (step === 4 || (!name && !kind)) onClose(); else { toast({ text: 'Введённое не потеряется — нажмите «Добавить клиента», чтобы продолжить', tone: 'info' }); onClose(); } }}
      title={step === 4 ? (savedClient ? 'Клиент добавлен' : 'Добавляю клиента…') : 'Новый клиент'} footer={footer}>
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
              <input id="ac-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Коваленко Марія Іванівна" autoFocus />
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
            <label className="check"><input type="checkbox" checked={employer} onChange={(e) => setEmployer(e.target.checked)} />Есть работники (работодатель)</label>
            {tried && err1 && <p className="field__error" role="alert">{err1}</p>}
          </>
        )}
        {step === 2 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ac-kved">КВЕД</label>
              <div className="combo">
                <span className="combo__icon"><Icon name="search" /></span>
                <input id="ac-kved" className="input input--icon" value={kq} onChange={(e) => setKq(e.target.value)} placeholder="Код или слово: «перукар», «інтернет»" autoFocus />
              </div>
              <ul className="kved-list" role="listbox" aria-label="КВЕД">
                {kveds.map(([code, title]) => (
                  <li key={code} role="option" aria-selected={kved === code}>
                    <button type="button" className="kved-opt" aria-pressed={kved === code} onClick={() => setKved(code)}>
                      <span className="num kved__code">{code}</span><span>{title}</span>{kved === code && <Icon name="check" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {kind && (
              <div className="estimate">
                <p className="field__label">Начисления в месяц ({KIND_LABEL[kind]})</p>
                <dl className="charges charges--sm">
                  {charges(kind).map((m) => (
                    <div key={m.name} className="charges__item"><dt>{m.name}</dt><dd className="charges__sum num">{m.kopecks ? formatMoney(m.kopecks) : 'по доходу'}</dd><dd className="sub">{m.note}</dd></div>
                  ))}
                </dl>
                <p className="sub">Ставки 2026 из справочника. Ставку ЄП по рішенню Миколаївської міськради сервер подставит сам.</p>
              </div>
            )}
            {tried && err2 && <p className="field__error" role="alert">{err2}</p>}
          </>
        )}
        {step === 3 && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="ac-phone">Телефон</label>
              <input id="ac-phone" className="input num" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380 …" autoFocus />
              <p className="field__hint">Можно оставить пустым и добавить потом.</p>
            </div>
            <div className="field">
              <span className="field__label">Банк</span>
              <div className="seg" role="radiogroup" aria-label="Банк">
                {['ПриватБанк', 'Монобанк', 'Ощадбанк', 'другой'].map((b) => (
                  <button key={b} type="button" role="radio" aria-checked={bank === b} className="seg__opt" onClick={() => setBank(b)}>{b}</button>
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
              {result.created.map((d, i) => (
                <li key={d.id} className="created__item" style={{ animationDelay: `${120 * i + 150}ms` }}><Icon name="calendar" size={18} /><span>{d.what}</span><span className="num sub">до {fmtDate(d.due)}</span></li>
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
