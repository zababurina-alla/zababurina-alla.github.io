// Видимая часть связи с таблицей: полоса «нет связи», окно конфликта версий, уведомления об отказах.
import { useEffect, useRef } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/toast';

/** Полоса сверху, пока нет связи: сколько записей ждут — и что ничего не потеряется. */
export function OfflineBanner() {
  const { online, pending } = useStore();
  const waiting = pending.filter((p) => p.state === 'queued' || p.state === 'sending').length;
  if (online) return null;
  return (
    <div className="offline" role="status">
      <Icon name="offline" />
      <span><strong>Нет связи с таблицей.</strong> {waiting
        ? `Ждут отправки: ${waiting}. Ничего не потеряется — отправлю сам, когда связь вернётся.`
        : 'Показываю последнее, что видела таблица. Новые записи сохраню и отправлю, когда связь вернётся.'}</span>
    </div>
  );
}

/** Отказ сервера — уведомление с «Повторить» (один раз на запись). */
export function FailureWatcher() {
  const { pending, retry } = useStore();
  const toast = useToast();
  const shown = useRef(new Set<string>());
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
