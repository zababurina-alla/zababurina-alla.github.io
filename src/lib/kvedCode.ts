// Код КВЕД, как его вводит мама, → вид класса КВЕД-2010 «NN.NN» (так его ждёт clients.update и лист «📑 КВЕДы»).
// Это читалка: корпус «ввод → код или отказ», «верно N из M» — в kvedCode.test.ts.

/** «47.21», «47,21», «4721», « 47 . 21 », «КВЕД 47.21» → «47.21»; «47.2» → «47.20» (таблица хранит 47.20 как 47.2 —
 *  законный код, «Сервер API» 16.10); раздел «47», буквы, «47..21» — null. */
export function parseKvedCode(raw: string): string | null {
  const t = raw.trim().replace(/^(квед|kved)\s*[:№]?\s*/i, '');
  const short = /^(\d{2})\s*[.,]\s*(\d)$/.exec(t);
  const m = short ? null : /^(\d{2})\s*[.,\s]?\s*(\d{2})$/.exec(t);
  const a = short?.[1] ?? m?.[1];
  const b = short ? `${short[2]}0` : m?.[2];
  if (!a || !b) return null;
  if (a === '00') return null; // раздела 00 в КВЕД-2010 нет
  return `${a}.${b}`;
}
