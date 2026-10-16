import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useVoiceInput, voiceSupported } from './voiceInput';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Подставной распознаватель браузера: запоминает себя, чтобы тест «сказал» фразу.
let last: { lang: string; onresult: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; onend: (() => void) | null } | null = null;
class FakeRec {
  lang = ''; interimResults = false; maxAlternatives = 1; continuous = false;
  onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
  start() { last = this; }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
}

describe('голосовой ввод задачи', () => {
  it('нет распознавания в браузере — кнопки нет', () => {
    expect(voiceSupported()).toBe(false);
  });

  it('фраза → текст в строку (промежуточный и окончательный); «микрофон запрещён» — понятная подсказка', async () => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRec;
    expect(voiceSupported()).toBe(true);
    const got: [string, boolean][] = [];
    const box: { v: ReturnType<typeof useVoiceInput> | null } = { v: null };
    function Grab() { const v = useVoiceInput((t, f) => got.push([t, f])); useEffect(() => { box.v = v; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Grab />); });
    await act(async () => { box.v?.start(); });
    expect([box.v?.listening, last?.lang]).toEqual([true, 'ru-RU']);
    const r = (t: string, f: boolean) => Object.assign([{ transcript: t }], { isFinal: f });
    act(() => { last?.onresult?.({ results: [r('позвонить', false)] }); });
    act(() => { last?.onresult?.({ results: [r('позвонить Ромашко завтра', true)] }); });
    expect(got).toEqual([['позвонить', false], ['позвонить Ромашко завтра', true]]);
    act(() => { last?.onerror?.({ error: 'not-allowed' }); last?.onend?.(); });
    expect([box.v?.listening, box.v?.error]).toEqual([false, 'Разрешите микрофон для сайта в браузере']);
    act(() => root.unmount());
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
});
