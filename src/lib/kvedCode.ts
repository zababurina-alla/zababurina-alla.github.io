// Код КВЕД, как его вводит мама, → вид класса КВЕД-2010 «NN.NN» (так его ждёт clients.update и лист «📑 КВЕДы»).
// Это читалка: корпус «ввод → код или отказ», «верно N из M» — в kvedCode.test.ts.

/** «47.21», «47,21», «4721», « 47 . 21 », «КВЕД 47.21» → «47.21»; группа «47.2», раздел «47», буквы — null. */
export function parseKvedCode(raw: string): string | null {
  const t = raw.trim().replace(/^(квед|kved)\s*[:№]?\s*/i, '');
  const m = /^(\d{2})\s*[.,\s]?\s*(\d{2})$/.exec(t);
  if (!m) return null;
  const [, a, b] = m;
  if (a === '00') return null; // раздела 00 в КВЕД-2010 нет
  return `${a}.${b}`;
}
