// Предохранитель экрана: одна плохая строка из таблицы не должна гасить весь сайт. Меню и остальные экраны живут,
// на месте упавшего — объяснение и «Обновить». key={экран} снимает ошибку при переходе на другой экран.
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Empty } from '../ui/Empty';

interface Props { children: ReactNode; what?: string }

export class ScreenBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // В консоль — только текст ошибки и место: данных таблицы здесь нет.
    console.error('Экран упал:', error.message, info.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel panel--pad" role="alert">
        <Empty pic="search" title={`Не получилось показать ${this.props.what ?? 'экран'}`}
          action={<button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Обновить</button>}>
          Скорее всего, в таблице строка в непривычном виде (например, пустая дата). Остальные разделы работают — откройте их в меню.
        </Empty>
      </section>
    );
  }
}
