import { afterEach, describe, expect, it, vi } from 'vitest';
import { canWrite, hasFeature, isLive, loadRuntimeConfig, readOnlyAreas } from './config';

const fetchJson = (body: unknown, ok = true) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: ok ? 200 : 404 })) as unknown as typeof fetch;

describe('config.json', () => {
  afterEach(async () => { await loadRuntimeConfig(fetchJson({ apiUrl: '' })); });

  it('нет файла — выдуманные данные, писать можно везде', async () => {
    await loadRuntimeConfig(fetchJson('', false));
    expect(isLive()).toBe(false);
    expect(canWrite('payments')).toBe(true);
    expect(readOnlyAreas()).toEqual([]);
  });

  it('адрес задан, writes — только платежи и задачи: остальное только просмотр', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://script.google.com/macros/s/X/exec', writes: ['payments', 'tasks', 'лишнее'] }));
    expect(isLive()).toBe(true);
    expect([canWrite('payments'), canWrite('tasks'), canWrite('deadlines'), canWrite('questions'), canWrite('clients')]).toEqual([true, true, false, false, false]);
    // remind — свой раздел: включённые сроки его не включают (координатор 15.10)
    expect(readOnlyAreas()).toEqual(['questions', 'deadlines', 'clients', 'remind']);
  });

  it('writes: [] — только просмотр во всех разделах; нет writes — запись везде', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: [] }));
    expect(readOnlyAreas()).toHaveLength(6);
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec' }));
    expect(readOnlyAreas()).toEqual([]);
  });

  it('«Входящие» за флагом: на живых — только с features: ["inbox"], на выдуманных — всегда', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: [] }));
    expect(hasFeature('inbox')).toBe(false);
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', features: ['inbox', 'лишнее'] }));
    expect(hasFeature('inbox')).toBe(true);
    await loadRuntimeConfig(fetchJson({ apiUrl: '' }));
    expect(hasFeature('inbox')).toBe(true);
  });

  it('напоминания: deadlines включены — remind нет; пробный запуск только с features: ["remindPreview"]', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: ['deadlines'] }));
    expect([canWrite('deadlines'), canWrite('remind')]).toEqual([true, false]);
    expect(hasFeature('remindPreview')).toBe(false); // старый сервер preview не знает и отправил бы сообщение
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: ['deadlines', 'remind'], features: ['remindPreview'] }));
    expect([canWrite('remind'), hasFeature('remindPreview')]).toEqual([true, true]);
  });

  it('битый файл — остаёмся на выдуманных данных', async () => {
    await loadRuntimeConfig(fetchJson('{ это не json'));
    expect(isLive()).toBe(false);
  });
});
