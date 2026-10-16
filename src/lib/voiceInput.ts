// Голосовой ввод задачи (бот: голос → задача): распознавание речи в браузере (Web Speech API). Звук не уходит на наш сервер —
// распознаёт сам браузер (Chrome на Android/компьютере; на iPhone Safari — частично). Нет поддержки — кнопки нет.
import { useCallback, useEffect, useRef, useState } from 'react';

interface Rec {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  const w = (typeof window === 'undefined' ? {} : window) as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = (): boolean => ctor() !== null;

/** Слушать одну фразу: текст — в onText по мере распознавания (последний — окончательный). */
export function useVoiceInput(onText: (text: string, final: boolean) => void, lang = 'ru-RU') {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  useEffect(() => { cb.current = onText; }, [onText]);
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = (e) => {
      const list = Array.from(e.results);
      const text = list.map((x) => x[0]?.transcript ?? '').join(' ').trim();
      cb.current(text, list.every((x) => x.isFinal));
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Разрешите микрофон для сайта в браузере' : e.error === 'no-speech' ? 'Не услышал — нажмите и скажите ещё раз' : 'Не получилось распознать — напишите текстом');
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    setError(null);
    setListening(true);
    try { r.start(); } catch { rec.current = null; setListening(false); }
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { listening, error, start, stop };
}
