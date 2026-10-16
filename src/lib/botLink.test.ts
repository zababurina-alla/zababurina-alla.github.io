import { describe, expect, it } from 'vitest';
import { questionBotLink, questionKey } from './botLink';

// Ключ должен совпасть с ботом (у него — Node crypto). Эталоны посчитаны отдельно: hashlib.sha256(utf-8).hexdigest()[:12].
const REF: [string, string][] = [
  ['kved_typo', 'a659aa3fd6fa'],
  ['Декларацію за III квартал подавали?:Ромашко Олена', '19e0c4083ad2'],
  ['q-1', '8a3e90ba8a51'],
];

describe('ссылка на вопрос в боте', () => {
  it('ключ — 12 hex SHA-256 от id, как у бота; кириллица и двоеточие в id не попадают в ссылку', async () => {
    for (const [id, key] of REF) expect(await questionKey(id)).toBe(key);
    expect(await questionBotLink(REF[1]?.[0] ?? '')).toBe('https://t.me/za_control_bot?start=q_19e0c4083ad2');
  });
});
