// Звуки «Бухгалтерии» — свои, синтезированные в браузере (Web Audio API), без файлов: лицензия не нужна, вес — ноль.
// Тихие и короткие; по умолчанию громкость 30 % (бриф, п. 5). Настройка — только удобство одного браузера (localStorage).

export type SoundName = 'saved' | 'closed' | 'attention' | 'incoming';

const KEY_ON = 'sverka.sound.on';
const KEY_VOL = 'sverka.sound.volume';
const DEFAULT_VOLUME = 0.3; // порог наш: «негромко»; проверить на ноутбуке мамы

let ctx: AudioContext | null = null;

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

export const soundSettings = {
  get on(): boolean { return read(KEY_ON, true, (s) => s === '1'); },
  set on(v: boolean) { write(KEY_ON, v ? '1' : '0'); },
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

/** Проиграть звук. Без пользовательского нажатия браузер звук не даст — вызывать из обработчиков нажатий. */
export function play(name: SoundName): void {
  if (!soundSettings.on) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    if (ac.state === 'suspended') void ac.resume();
    const out = ac.createGain();
    out.gain.value = soundSettings.volume * 0.35;
    out.connect(ac.destination);
    const t = ac.currentTime + 0.01;
    switch (name) {
      case 'saved': // две мягкие ноты вверх (ми → ля), 120 мс
        tone(ac, out, 659.25, t, 0.12);
        tone(ac, out, 880, t + 0.07, 0.16, 'sine', 0.8);
        break;
      case 'closed': // мягкий «щелчок-подтверждение»: низкий тон + короткий верхний призвук, 180 мс
        tone(ac, out, 196, t, 0.18, 'triangle', 0.9);
        tone(ac, out, 1318.5, t, 0.05, 'sine', 0.35);
        tone(ac, out, 987.77, t + 0.06, 0.14, 'sine', 0.5);
        break;
      case 'attention': // одна низкая нота с лёгким спадом, без тревоги, 220 мс
        tone(ac, out, 440, t, 0.22, 'sine', 0.8);
        tone(ac, out, 392, t + 0.09, 0.2, 'sine', 0.5);
        break;
      case 'incoming': // едва слышный тик, 40 мс
        tone(ac, out, 1760, t, 0.04, 'sine', 0.25);
        break;
    }
  } catch {
    /* звук — украшение; без него всё работает */
  }
}
