// Звуки «Бухгалтерии» — свои, синтезированные в браузере (Web Audio API), без файлов: лицензия не нужна, вес — ноль.
// Тихие и короткие; по умолчанию громкость 30 % (бриф, п. 5). Настройка — только удобство одного браузера (localStorage).
//
// Правила (как модуль Snd в «Сверке рейсов»):
// 1) Звук — только в ответ на действие человека: нажатие или клавиша не дальше 5 с назад. Пришло из таблицы или от бота
//    само по себе, без действия мамы, — тишина (подсветка строки говорит сама).
// 2) Режимы: «вкл» / «ночью тихо» (22:00–7:00 молчит) / «выкл». По умолчанию — «ночью тихо».

export type SoundName = 'saved' | 'closed' | 'attention' | 'incoming' | 'tick';
export type SoundMode = 'on' | 'night' | 'off';

const KEY_MODE = 'sverka.sound.mode';
const KEY_ON = 'sverka.sound.on'; // прежняя настройка «вкл/выкл» — читаем, чтобы выключенный звук не включился сам
const KEY_VOL = 'sverka.sound.volume';
const DEFAULT_VOLUME = 0.3; // порог наш: «негромко»; проверить на ноутбуке мамы
const GESTURE_MS = 5000; // порог из «Сверки рейсов»: действие не дальше 5 с
const NIGHT_FROM = 22; // 22:00–7:00 — «ночью тихо»
const NIGHT_TO = 7;

let ctx: AudioContext | null = null;
let lastGesture = 0;

if (typeof window !== 'undefined') {
  const mark = () => { lastGesture = performance.now(); };
  window.addEventListener('pointerdown', mark, { capture: true, passive: true });
  window.addEventListener('keydown', mark, { capture: true, passive: true });
}

function read<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* частный режим — настройка просто не запомнится */
  }
}

const isMode = (s: string): s is SoundMode => s === 'on' || s === 'night' || s === 'off';

export const soundSettings = {
  get mode(): SoundMode {
    const legacyOff = read(KEY_ON, true, (s) => s === '1') === false;
    return read<SoundMode>(KEY_MODE, legacyOff ? 'off' : 'night', (s) => (isMode(s) ? s : 'night'));
  },
  set mode(m: SoundMode) { write(KEY_MODE, m); },
  /** Звук сейчас слышен: режим «вкл» или «ночью тихо» днём. */
  get on(): boolean {
    const m = soundSettings.mode;
    if (m === 'off') return false;
    if (m === 'on') return true;
    const h = new Date().getHours();
    return h >= NIGHT_TO && h < NIGHT_FROM;
  },
  get volume(): number { return read(KEY_VOL, DEFAULT_VOLUME, Number); },
  set volume(v: number) { write(KEY_VOL, String(Math.min(1, Math.max(0, v)))); },
};

function tone(ac: AudioContext, out: GainNode, freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 1) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/**
 * Проиграть звук. Молчит, если звук выключен, сейчас ночь в режиме «ночью тихо» или человек ничего не делал 5 с.
 * force — для кнопки «Проверить звук» (играет и ночью: человек сам попросил).
 */
export function play(name: SoundName, force = false): void {
  if (!force && (!soundSettings.on || performance.now() - lastGesture > GESTURE_MS)) return;
  if (force && soundSettings.mode === 'off') return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    if (ac.state === 'suspended') void ac.resume();
    const out = ac.createGain();
    out.gain.value = soundSettings.volume * 0.35;
    out.connect(ac.destination);
    const t = ac.currentTime + 0.01;
    switch (name) {
      case 'saved': // две мягкие ноты вверх (ми → ля), 160 мс — «записано»
        tone(ac, out, 659.25, t, 0.12);
        tone(ac, out, 880, t + 0.07, 0.16, 'sine', 0.8);
        break;
      case 'closed': // «закрыто»: мягкий низ + две светлые ноты вверх (соль → си → ми), 260 мс — как поставить галочку
        tone(ac, out, 196, t, 0.18, 'triangle', 0.7);
        tone(ac, out, 987.77, t + 0.03, 0.14, 'sine', 0.45);
        tone(ac, out, 1318.5, t + 0.1, 0.2, 'sine', 0.35);
        break;
      case 'attention': // одна низкая нота с лёгким спадом, без тревоги, 220 мс
        tone(ac, out, 440, t, 0.22, 'sine', 0.8);
        tone(ac, out, 392, t + 0.09, 0.2, 'sine', 0.5);
        break;
      case 'incoming': // едва слышный тик, 40 мс
        tone(ac, out, 1760, t, 0.04, 'sine', 0.25);
        break;
      case 'tick': // щелчок выбора, 30 мс
        tone(ac, out, 2093, t, 0.03, 'sine', 0.18);
        break;
    }
  } catch {
    /* звук — украшение; без него всё работает */
  }
}
