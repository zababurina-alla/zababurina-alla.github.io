// Самопроверка визуальных снимков: каждая поломка (VISUAL_BREAK) обязана дать красный прогон. Итог — «поймано N из M».
import { spawnSync } from 'node:child_process';

const CASES = [
  // причина находки владельца 15.10: белый прямоугольник вокруг кнопки Google на тёмной теме
  { name: 'white-login', args: ['-g', 'вход', '--project=dark-1280', '--project=dark-375'] },
  { name: 'shift-8px', args: ['-g', 'сегодня|платежи'] },
  { name: 'button-color', args: ['-g', 'сегодня|платежи'] },
];

let caught = 0;
for (const c of CASES) {
  const r = spawnSync('npx', ['playwright', 'test', '--reporter=line', ...c.args], {
    env: { ...process.env, VISUAL_BREAK: c.name }, encoding: 'utf8', shell: true,
  });
  const red = r.status !== 0;
  if (red) caught++;
  console.log((red ? '  ✔ поймана: ' : '  ✗ НЕ поймана: ') + c.name);
}
console.log(`Самопроверка визуальных снимков: поймано ${caught} из ${CASES.length}`);
process.exit(caught === CASES.length ? 0 : 1);
