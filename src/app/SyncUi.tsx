// Видимая часть связи с таблицей: полоса «нет связи», окно конфликта версий, уведомления об отказах.
import { useEffect, useRef } from 'react';
import { useStore } from '../data/store';
import { AREA_LABEL, readOnlyAreas, visibleAreas } from '../config';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';

/** Полоса сверху, пока нет связи: сколько записей ждут — и что ничего не потеряется. */
export function OfflineBanner() {
  const { online, pending, loadError } = useStore();
  const waiting = pending.filter((p) => p.state === 'queued' || p.state === 'sending').length;
  // Данные не загрузились — об этом говорит экран «Таблица не отвечает», а «показываю последнее» было бы неправдой.
  if (online || loadError) return null;
  return (
    <div className="offline" role="status">
      <Icon name="offline" />
      <span><strong>Нет связи с таблицей.</strong> {waiting
        ? `Ждут отправки: ${waiting}. Ничего не потеряется — отправлю сам, когда связь вернётся.`
        : 'Показываю последнее, что видела таблица. Новые записи сохраню и отправлю, когда связь вернётся.'}</span>
    </div>
  );
}

/** Отказ сервера — уведомление с «Повторить» (один раз на запись); окончательный отказ — объяснение без повтора. */
export function FailureWatcher() {
  const { pending, retry, notices, dismissNotice } = useStore();
  const toast = useToast();
  const shown = useRef(new Set<string>());
  useEffect(() => {
    for (const n of notices) {
      toast({ key: `notice-${n.id}`, text: n.text, tone: 'error' });
      dismissNotice(n.id);
    }
  }, [notices, dismissNotice, toast]);
  useEffect(() => {
    for (const it of pending) {
      if (it.state !== 'failed' || shown.current.has(it.op.requestId)) continue;
      shown.current.add(it.op.requestId);
      const rid = it.op.requestId;
      toast({ key: `fail-${rid}`, text: `Не сохранилось: ${it.label}. ${it.error ?? ''}`, tone: 'error', action: { label: 'Повторить', run: () => { shown.current.delete(rid); retry(rid); } } });
    }
  }, [pending, retry, toast]);
  return null;
}

/** Запись изменилась в таблице, пока мама её правила: показываем оба значения, ничего не затираем молча. */
export function ConflictDialog() {
  const { conflict, client, resolveConflict } = useStore();
  const c = conflict ? client(conflict.clientId) : undefined;
  return (
    <Modal open={Boolean(conflict)} onClose={() => undefined} title="Запись изменилась в таблице" footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={() => resolveConflict('theirs')}>Взять из таблицы</button>
        <button type="button" className="btn btn--primary btn--grow" onClick={() => resolveConflict('mine')}>Оставить моё</button>
      </>
    }>
      {conflict && (
        <div className="conflict">
          <p>Пока вы правили телефон {c ? <strong>{c.name}</strong> : 'клиента'}, его изменили в таблице.</p>
          <dl className="conflict__grid">
            <div className="conflict__cell"><dt>В таблице сейчас</dt><dd className="num">{conflict.theirs}</dd></div>
            <div className="conflict__cell conflict__cell--mine"><dt>Вы ввели</dt><dd className="num">{conflict.mine}</dd></div>
          </dl>
          <p className="sub">Ваш вариант сохранён и никуда не денется, пока вы не выберете одну из кнопок ниже.</p>
        </div>
      )}
    </Modal>
  );
}

/** Живые данные, но часть разделов пока только для просмотра (сервер включает запись по очереди). */
export function ReadOnlyBanner() {
  const areas = readOnlyAreas();
  if (!areas.length) return null;
  const all = areas.length === visibleAreas().length;
  return (
    <div className="offline offline--info" role="status">
      <Icon name="sheet" />
      <span><strong>{all ? 'Пока только просмотр.' : `Пока только просмотр: ${areas.map((a) => AREA_LABEL[a]).join(', ')}.`}</strong>
        {' '}Это записывайте в таблице — на сайте появится само за полминуты.</span>
    </div>
  );
}

/** Таблица не отдала данные при открытии: честно сказать и дать повторить, а не показывать пустые экраны. */
export function ServerDown({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel panel--pad server-down" role="alert" aria-labelledby="down-title">
      <h1 id="down-title" className="page__title">Таблица сейчас не отвечает сайту</h1>
      <p>{message}</p>
      <p className="sub">Работать можно прямо в таблице или через бота — ничего не потеряется. Сайт подхватит всё, когда связь вернётся.</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}><Icon name="sync" />Повторить</button>
    </section>
  );
}
