// «Что у меня сегодня» (#/today-voice): итог дня крупным текстом и «Прочитать вслух» (Web Speech, голос ru-RU).
// Читать без нажатия браузеры (особенно iPhone) не дают — поэтому кнопка. Ярлык на экране: долгое нажатие на иконку
// приложения (Android) → «Что сегодня».
import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { daySummary } from '../lib/daySummary';
import { TODAY } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { shortName } from '../ui/names';

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

function ruVoice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ru'));
}

export function TodayVoice() {
  const store = useStore();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (canSpeak) speechSynthesis.cancel(); }, []);

  const lines = daySummary({
    today: TODAY,
    deadlines: store.deadlines,
    name: (id) => { const c = store.client(id); return c ? shortName(c.name) : undefined; },
    keys: store.clients.map((c) => ({ name: shortName(c.name), keyUntil: c.keyUntil })),
    tasks: store.tasks,
    questions: store.questions.length,
  });

  const speak = () => {
    if (!canSpeak) return;
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(lines.join(' '));
    u.lang = 'ru-RU';
    const v = ruVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(u);
  };

  return (
    <div className="page voice">
      <header className="page__head"><div><h1 className="page__title">Что у меня сегодня</h1></div></header>
      <section className="panel panel--pad voice__text" aria-live="polite">
        {lines.map((l) => <p key={l}>{l}</p>)}
      </section>
      {canSpeak
        ? <button type="button" className="btn btn--primary voice__btn" onClick={speak} aria-pressed={speaking}>
            <Icon name={speaking ? 'soundOff' : 'sound'} />{speaking ? 'Остановить' : 'Прочитать вслух'}</button>
        : <p className="sub">Этот браузер не умеет читать вслух — текст выше.</p>}
      <p className="sub"><a className="link" href="#/today">Открыть «Сегодня»</a></p>
    </div>
  );
}
