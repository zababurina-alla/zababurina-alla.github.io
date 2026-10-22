import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, canWrite, hasFeature, isLive, loadRuntimeConfig, pickApiUrl, readOnlyAreas } from './config';

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
    expect(readOnlyAreas()).toEqual(['questions', 'deadlines', 'clients', 'remind', 'consultations']);
  });

  it('writes: [] — только просмотр во всех разделах; нет writes — запись везде', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: [] }));
    expect(readOnlyAreas()).toHaveLength(7);
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

  it('живой config.json после приёмки-3 (16.10): включено только показ — Месяц, Внимание, недели, калькулятор, микрофон; записи нового — нет', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: ['tasks', 'deadlines', 'payments'], features: ['inbox', 'cancelNotify', 'month', 'attention', 'weekLoad', 'epCalc', 'voice'] }));
    const on = ['inbox', 'cancelNotify', 'month', 'attention', 'weekLoad', 'epCalc', 'voice'] as const;
    const off = ['monthWrite', 'archive', 'kvedEdit', 'deadlinesCreate', 'applyTemplate', 'botLink', 'statementPdf', 'sendStatement', 'completeMany', 'updateMany'] as const;
    expect([on.filter((f) => !hasFeature(f)), off.filter((f) => hasFeature(f)), canWrite('clients')]).toEqual([[], [], false]);
  });

  it('живой config.json сегодня (features inbox, cancelNotify): новое без приёмки выключено — калькулятор, недели, микрофон, правка КВЕД, Месяц, Внимание, архив', async () => {
    await loadRuntimeConfig(fetchJson({ apiUrl: 'https://x/exec', writes: ['tasks', 'deadlines', 'payments'], features: ['inbox', 'cancelNotify'] }));
    const off = ['epCalc', 'weekLoad', 'voice', 'kvedEdit', 'month', 'attention', 'archive', 'deadlinesCreate', 'applyTemplate', 'botLink', 'statementPdf', 'sendStatement', 'completeMany', 'updateMany', 'dueSet', 'tasksShowAll', 'paymentsFill', 'incomeEdit'] as const;
    expect(off.filter((f) => hasFeature(f))).toEqual([]);
    expect([hasFeature('inbox'), hasFeature('cancelNotify')]).toEqual([true, true]);
  });

  it('dev:mock (Н-7): адрес учебного сервера главнее config.json с живой таблицей; файлы не читаются, всё включено', async () => {
    const LIVE = 'https://script.google.com/macros/s/LIVE/exec';
    const MOCK = 'http://localhost:5179/mock-api';
    expect(pickApiUrl('mock', LIVE, MOCK)).toBe(MOCK);
    expect(pickApiUrl('mock', '', MOCK)).toBe(MOCK);
    expect(pickApiUrl('production', LIVE, MOCK)).toBe(LIVE);
    expect(pickApiUrl('development', '', MOCK)).toBe(MOCK);
    const f = fetchJson({ apiUrl: LIVE, writes: [] });
    await loadRuntimeConfig(f, 'mock');
    expect(f).not.toHaveBeenCalled();
    expect(apiUrl()).not.toBe(LIVE);
    expect([canWrite('deadlines'), canWrite('remind')]).toEqual([true, true]);
  });

  it('битый файл — остаёмся на выдуманных данных', async () => {
    await loadRuntimeConfig(fetchJson('{ это не json'));
    expect(isLive()).toBe(false);
  });
});
