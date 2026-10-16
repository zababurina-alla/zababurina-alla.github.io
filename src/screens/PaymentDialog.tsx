// Окно «Записать платёж»: клиент (подсказки), сумма (любой ввод → «1 234,56 ₴»), период, способ, дата.
// Проверка на месте простыми словами. После записи — уведомление с «Отменить» и честный статус в списке.
import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { METHOD_LABEL } from '../data/types';
import type { PayMethod } from '../data/types';
import { useDraft } from '../data/drafts';
import { TODAY, addDays, endOfMonth, fmtDate, parseUserDate } from '../lib/dates';
import { formatMoney, parseMoney, formatPayMoney } from '../lib/money';
import { search } from '../lib/search';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';

const PERIODS = ['Октябрь 2026', 'Сентябрь 2026', 'III квартал 2026'];
// [п. 24] Способы — как в таблице («📱 Монобанк», не «карта»).
const METHODS: PayMethod[] = ['bank', 'cash', 'mono', 'diia'];

function Segmented<T extends string>({ options, value, onChange, label, text = (o) => o }: {
  options: T[]; value: T; onChange: (v: T) => void; label: string; text?: (o: T) => string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} className="seg__opt" onClick={() => onChange(o)}>{text(o)}</button>
      ))}
    </div>
  );
}


export function PaymentDialog({ open, clientId, onClose }: { open: boolean; clientId: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const ids = useId();
  const [who, setWho] = useState<string | null>(clientId);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(PERIODS[0] ?? '');
  const [method, setMethod] = useState<PayMethod>('bank');
  const [date, setDate] = useState(fmtDate(TODAY));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const amountRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLButtonElement>(null);

  // Открыли окно — свежая форма; клиент подставлен, если окно открыто из карточки.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setWho(clientId); setQ(''); setAmount(''); setPeriod(PERIODS[0] ?? ''); setMethod('bank');
      setDate(fmtDate(TODAY)); setTouched({}); setActive(0);
    }
  }
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => (clientId ? amountRef : clientRef).current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, clientId]);

  // Черновик: всё введённое переживает закрытие окна, обрыв связи и перезагрузку.
  const draft = useDraft('payment', open, { who, amount, period, method, date },
    (v) => { setWho(v.who); setAmount(v.amount); setPeriod(v.period); setMethod(v.method); setDate(v.date); },
    (v) => !v.amount && (!v.who || v.who === clientId));

  const picked = who ? store.client(who) : undefined;
  // Фокус в сумму — сразу, в том же нажатии: иначе первая набранная цифра теряется («4200» → «200»).
  function pick(id: string) {
    amountRef.current?.focus();
    setWho(id);
  }
  // Недавних — трое: на ноутбуке 1280×800 период и способ оплаты видны без прокрутки окна (приёмка 16.10, С-4)
  const recent = [...new Set(store.payments.map((p) => p.clientId))].slice(0, 3).map((id) => store.client(id)).filter(Boolean);
  const suggestions = (q ? search(store.clients.map((c) => ({ ...c, extra: [c.phone] })), q) : recent).slice(0, 5);
  // Набрали фамилию, нашёлся ровно один клиент — он и выбран, даже если по строке не щёлкнули (находка «Пользователя» № 5).
  const only = !picked && q.trim() && suggestions.length === 1 ? suggestions[0] : undefined;
  const client = picked ?? only;
  const money = parseMoney(amount);
  const dateIso = parseUserDate(date);
  const errors = {
    client: client ? '' : 'Выберите клиента',
    amount: money.ok ? '' : money.error,
    date: dateIso ? '' : 'Не понял дату — напишите, например, 14.10.2026 или «14 октября»',
  };
  const lastPay = client ? store.payments.find((p) => p.clientId === client.id) : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ client: true, amount: true, date: true });
    if (errors.client || errors.amount || errors.date || !client || !money.ok || !dateIso) {
      play('attention');
      // Фокус — к первому полю с ошибкой: на телефоне оно может быть за краем шторки.
      if (errors.client) (clientRef.current ?? otherRef.current)?.focus();
      else if (errors.amount) amountRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }
    const short = client.name.split(' ').slice(0, 2).join(' ');
    const sum = formatMoney(money.kopecks);
    // Пока сервер не подтвердил — в списке платежей «сохраняется…», в меню «Сохраняется в таблицу: 1».
    // Находка № 6: без тишины 2–3 с — сразу «Записываю…», ответ таблицы заменяет его на месте на «Записано · Отменить».
    const key = `pay-${Date.now()}`;
    const id = store.addPayment({ clientId: client.id, kopecks: money.kopecks, period, method, date: dateIso }, () => {
      play('saved');
      toast({ key, replace: true, text: `Платёж ${sum} записан в таблицу — ${short}`, action: { label: 'Отменить', run: () => store.removePayment(id) } });
    });
    toast({ key, text: `Записываю ${sum} — ${short}…`, tone: 'info', timeout: 20_000 });
    void draft.clear();
    onClose();
  }

  const quick: [string, string][] = [
    ['сегодня', TODAY], ['завтра', addDays(TODAY, 1)], ['конец месяца', endOfMonth(TODAY)], ['20 число', '2026-10-20'],
  ];

  return (
    <Modal open={open} onClose={onClose} title="Записать платёж" footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Закрыть</button>
        <button type="submit" form={`${ids}-form`} className="btn btn--primary btn--grow">Записать платёж</button>
      </>
    }>
      <form id={`${ids}-form`} className="form" onSubmit={submit} noValidate>
        {draft.restoredAt && (
          <p className="draft-note" role="status">
            <Icon name="edited" size={16} />Восстановлен черновик от {new Date(draft.restoredAt).toTimeString().slice(0, 5)}
            <button type="button" className="link" onClick={() => { void draft.clear(); setWho(clientId); setAmount(''); setDate(fmtDate(TODAY)); }}>Очистить</button>
          </p>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-client`}>Клиент</label>
          {picked ? (
            <div className="picked">
              <Avatar name={picked.name} size="sm" />
              <span className="picked__name">{picked.name}</span>
              <button ref={otherRef} type="button" className="link" onClick={() => { setWho(null); setTimeout(() => clientRef.current?.focus(), 0); }}>Другой</button>
            </div>
          ) : (
            <div className="combo">
              <span className="combo__icon"><Icon name="search" /></span>
              <input id={`${ids}-client`} ref={clientRef} className="input input--icon" value={q} autoComplete="off"
                role="combobox" aria-expanded="true" aria-controls={`${ids}-list`} aria-activedescendant={`${ids}-opt-${active}`}
                placeholder="Начните фамилию — в любом падеже…"
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onBlur={() => { setTouched((t) => ({ ...t, client: true })); if (only) setWho(only.id); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === 'Enter') { e.preventDefault(); const s = suggestions[active]; if (s) pick(s.id); }
                }} />
              <ul id={`${ids}-list`} className="combo__list" role="listbox" aria-label={q ? 'Найденные клиенты' : 'Недавние клиенты'}>
                {!q && <li className="combo__hint sub" role="presentation">Недавние</li>}
                {suggestions.map((s, i) => s && (
                  <li key={s.id} id={`${ids}-opt-${i}`} role="option" aria-selected={i === active}
                    className="combo__opt" onMouseDown={(e) => { e.preventDefault(); pick(s.id); }}>
                    <Avatar name={s.name} size="sm" />{s.name}
                  </li>
                ))}
                {q && suggestions.length === 0 && <li className="combo__hint sub" role="presentation">Никого не нашли</li>}
              </ul>
            </div>
          )}
          {touched.client && errors.client && <p className="field__error" role="alert">{errors.client}</p>}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${ids}-amount`}>Сумма</label>
          <div className="money">
            <input id={`${ids}-amount`} ref={amountRef} className="input input--money num" inputMode="decimal" value={amount}
              placeholder="0,00" autoComplete="off" aria-invalid={Boolean(touched.amount && errors.amount)} aria-describedby={`${ids}-amount-msg`}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => { setTouched((t) => ({ ...t, amount: true })); if (money.ok) setAmount(formatMoney(money.kopecks, false)); }} />
            <span className="money__sign" aria-hidden="true">₴</span>
          </div>
          {touched.amount && errors.amount
            ? <p id={`${ids}-amount-msg`} className="field__error" role="alert">{errors.amount}</p>
            : <p id={`${ids}-amount-msg`} className="field__hint">{money.ok ? <>Будет записано: <strong className="num">{formatMoney(money.kopecks)}</strong></> : 'Можно писать 1234.5 или 1 234,50 — покажем одинаково'}</p>}
          {lastPay && <p className="field__hint">Прошлый платёж: {formatPayMoney(lastPay.kopecks)} за {lastPay.period.toLowerCase()}</p>}
        </div>

        <div className="field">
          <span className="field__label" id={`${ids}-period`}>За какой период</span>
          <Segmented label="За какой период" options={PERIODS} value={period} onChange={setPeriod} />
        </div>

        <div className="field">
          <span className="field__label">Способ</span>
          <Segmented label="Способ оплаты" options={METHODS} value={method} onChange={setMethod} text={(m) => METHOD_LABEL[m]} />
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${ids}-date`}>Дата оплаты</label>
          <div className="date-row">
            <input id={`${ids}-date`} ref={dateRef} className="input input--date num" value={date} autoComplete="off"
              aria-invalid={Boolean(touched.date && errors.date)} aria-describedby={`${ids}-date-msg`}
              onChange={(e) => setDate(e.target.value)}
              onBlur={() => { setTouched((t) => ({ ...t, date: true })); if (dateIso) setDate(fmtDate(dateIso)); }} />
            <div className="chips">
              {quick.map(([label, iso]) => (
                <button key={label} type="button" className="chip" aria-pressed={dateIso === iso} onClick={() => setDate(fmtDate(iso))}>{label}</button>
              ))}
            </div>
          </div>
          {touched.date && errors.date && <p id={`${ids}-date-msg`} className="field__error" role="alert">{errors.date}</p>}
        </div>
      </form>
    </Modal>
  );
}
