# Контракт API «Сверки» (сайт ↔ Apps Script «Мамы CRM»)

Версия **v1**, черновик от 14.10.2026. Пишет сессия сайта; реализует команда «Мамы CRM» (координатор — сессия
«Таблица оркестрации»). Сайт уже работает с этим интерфейсом на выдуманном сервере: `src/data/api.ts` (интерфейс),
`src/data/fakeServer.ts` (поведение, которое ждём от сервера), `src/data/outbox.ts` (очередь и повторы на сайте).

**Главное правило (бриф, п. 6):** таблица — единственный источник правды. Каждая запись с сайта проходит **ту же
логику системы**, что правки из бота (автоцикл сроков, пересчёт ЄП, аудит, уведомления), а не прямую правку ячеек.
Ответ на запись приходит **после** записи в таблицу и логики системы и содержит итоговые записи — включая то, что
создал автоцикл.

---

## 1. Что проверено про Apps Script и что из этого следует

Исследование 14.10.2026 по официальной документации Google; ссылки — в разделе 12.

| Факт | Источник | Решение в контракте |
|---|---|---|
| Ответ `ContentService` приходит через редирект на `script.googleusercontent.com`; клиент должен следовать редиректам | guides/content | `fetch` следует сам; отвечать только через `ContentService` (не `HtmlService`) |
| У `TextOutput` нет методов для заголовков и HTTP-статуса | reference/content/text-output | статус всегда 200; ошибка — в теле `{ok:false, error}` |
| В событии `doPost(e)` нет заголовков запроса (есть `postData.contents`) | guides/web | токен — в теле, не в `Authorization` |
| `doOptions` не существует, preflight не обрабатывается (сообщество, не docs) | — | только «простой» запрос: `POST`, `Content-Type: text/plain;charset=utf-8`, без своих заголовков, без `credentials` |
| Доступ к веб-приложению: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` | manifest/web-app-api-executable | сайт без Google-cookie; кто пускается — решает проверка токена внутри (раздел 3) |
| `Session.getActiveUser()` в режиме «от имени владельца» почту не даёт | reference/base/session | личность — только из проверенного ID-токена |
| Квоты: 6 мин на выполнение; **30 одновременных выполнений на пользователя** (владельца); дневного лимита на запросы веб-приложения в таблице квот нет; UrlFetch 20 000/день (gmail.com) | guides/services/quotas | опрос раз в 30 с с одной вкладки ≈ 2 880 запросов/день — укладывается; на сайте повтор с паузой при `BUSY`/`QUOTA` |
| Готового «что изменилось с курсора X» нет; триггеры не срабатывают на правки скриптом/API; onChange не даёт диапазон | guides/triggers, triggers/events | свой журнал изменений `_changelog` и счётчик ревизий (раздел 6) |
| `LockService.getScriptLock()` сериализует выполнения; `waitLock` по таймауту бросает исключение | reference/lock | каждая запись — под блокировкой; таймаут → `BUSY` (повторяемо) |
| `CacheService`: значение ≤ 100 КБ, срок ≤ 6 ч | reference/cache | кэш проверки входа; журнал повторов — в листе (сутки и больше) |
| Проверка ID-токена: подпись, `aud`, `iss`, `exp`; проверить RSA-подпись в Apps Script нечем; `tokeninfo` Google называет отладочным | identity/gsi/web/guides/verify-google-id-token, openid-connect | `tokeninfo` один раз при входе + свой сессионный токен (HMAC) на 12 ч (раздел 3) |

Не подтверждено и нужно замерить на живом деплое (раздел 11): заголовок CORS на финальном ответе после
редиректа, время ответа (холодное/тёплое), лимиты размера тела и ответа, лимиты `tokeninfo`.

## 2. Транспорт и общий формат

**Запрос.** Один адрес — `POST https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`,
`Content-Type: text/plain;charset=utf-8`, тело — JSON-строка:

```json
{
  "v": 1,
  "action": "deadlines.close",
  "session": "<сессионный токен из auth.login>",
  "requestId": "6f1c2a0e-3b7d-4c55-9a12-0d8f4b9e1c77",
  "payload": { "id": "D-0412", "baseVersion": 7 }
}
```

- `v` — версия контракта. Несовместимое изменение → `v: 2` и новый деплой; старый живёт, пока сайт не обновлён.
- `requestId` — UUID v4, создаёт браузер. **Обязателен для всех записей.** Повтор того же `requestId` (из очереди
  после обрыва связи) возвращает **тот же ответ** и не создаёт дубль (раздел 5).
- Таймаут на сайте — 30 с (`AbortController`). Нет ответа → запись остаётся в очереди «ещё не в таблице».

**Ответ** — всегда HTTP 200, JSON:

```json
{ "ok": true, "data": { … }, "cursor": 10482, "serverTime": "2026-10-14T09:12:03+03:00" }
```

```json
{
  "ok": false,
  "error": {
    "code": "PERIOD_OPEN",
    "message": "Период ещё не закончился — закрыть можно с 01.11.2026",
    "detail": "deadline D-0412 periodEnd=2026-11-01 today=2026-10-14",
    "retryable": false,
    "field": null
  },
  "current": null
}
```

- `message` — для мамы: простыми словами, что случилось и что делать. Сайт показывает его как есть.
- `detail` — для Дмитрия: технически, без персональных данных (без паролей, ІПН, телефонов).
- `retryable` — можно ли повторить ту же запись тем же `requestId` позже.
- `cursor` — номер последнего изменения в таблице после выполнения запроса (раздел 6).
- `current` — при `CONFLICT`: текущая запись из таблицы.

**Форматы данных:**

| Что | Формат | Пример |
|---|---|---|
| Деньги | **целое число копеек** (`*Kopecks`) — без дробей и округлений | `172940` = 1 729,40 ₴ |
| Дата | ISO `YYYY-MM-DD` | `2026-10-20` |
| Дата и время | ISO 8601 с поясом Киева | `2026-10-14T09:12:03+03:00` |
| Идентификатор | строка, стабильная для строки таблицы (не номер строки!) | `C-0017`, `D-0412`, `P-2026-0381` |
| Версия записи | целое, растёт на 1 при каждом изменении записи (сайт, бот, ручная правка) | `7` |
| Пустое | `null` (не пустая строка) | `"keyUntil": null` |

Номер строки листа идентификатором быть не может: строки сдвигаются (вставка, сортировка), а запись — нет.
Если в листе нет колонки ID — её добавляет команда «Мамы CRM» (скрытая, см. стиль-таблиц.md п. 7).

## 3. Вход

1. Сайт показывает кнопку «Войти через Google» (Google Identity Services, client ID проекта; в «Authorized
   JavaScript origins» — `https://zaibalistudio.github.io`, путь не указывается).
2. Браузер получает **ID-токен** (JWT, живёт ~1 ч) и вызывает `auth.login`.
3. Сервер проверяет токен через `https://oauth2.googleapis.com/tokeninfo?id_token=…` (UrlFetchApp) и сам сверяет:
   `aud` = client ID сайта, `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `exp` в будущем,
   `email_verified = true`, `email` — **в списке разрешённых** (Script Properties `ALLOWED_EMAILS`, на сервере;
   в коде сайта списка нет).
4. Сервер выдаёт **сессионный токен**: `base64(email|role|exp)` + `HMAC-SHA256` подпись
   (`Utilities.computeHmacSha256Signature`, секрет — Script Properties `SESSION_SECRET`), срок 12 ч.
   Все остальные запросы — с `session`; `tokeninfo` больше не вызывается.
5. Истёк сеанс → ошибка `AUTH_EXPIRED` → сайт тихо получает новый ID-токен (`auto_select`) и повторяет
   `auth.login`, затем исходный запрос (тем же `requestId`). Мама видит окно входа, только если тихо не вышло.

Роли: `mama` (всё рабочее), `owner` (то же + `diag.*`). Роль — из Script Properties `ALLOWED_EMAILS`
(`email:role`).

### `auth.login`

| Поле | Тип | Обяз. | Что |
|---|---|---|---|
| `idToken` | string | да | ID-токен GIS |

Ответ `data`: `{ "session": "…", "expiresAt": "2026-10-14T21:12:03+03:00", "user": { "email": "…", "name": "Алла", "role": "mama" } }`.
Ошибки: `AUTH_INVALID` (токен не прошёл проверку), `FORBIDDEN` (почта не в списке — «Этот аккаунт не имеет доступа к кабинету»).

### `auth.me`

Без полей. Ответ — `user` (как выше). Нужен при открытии сайта с сохранённым сеансом.

## 4. Блокировка и порядок записи (сервер)

Каждая запись (`*.create`, `*.update`, `*.close`, …):

1. `LockService.getScriptLock().waitLock(20000)`; не дождались → `BUSY` (`retryable: true`).
2. Проверить сеанс и `requestId` в журнале повторов (раздел 5) — если есть, вернуть сохранённый ответ.
3. Проверить `baseVersion` (если есть) → иначе `CONFLICT` с `current`.
4. Выполнить **существующую функцию системы** (та же, что зовёт бот), получить итоговые записи.
5. Увеличить версии затронутых записей, записать изменения в `_changelog` (раздел 6), сохранить ответ в журнал повторов.
6. `releaseLock()`, вернуть ответ.

## 5. Повтор без дублей (идемпотентность)

Скрытый лист `_requests`: `requestId | action | ts | responseJson` (ответ до ~50 КБ). Хранить 7 дней (чистка ночным
триггером). Повтор с тем же `requestId` → тот же ответ без повторного выполнения. Для новых записей (платёж, клиент)
сайт передаёт `id` = `requestId` — так даже частично выполненная запись не задвоится.

## 6. Изменения «с момента X» (обратная связь из таблицы и бота)

- Скрытый лист `_changelog`: `rev | ts | entity | id | op | origin | recordJson`.
  - `rev` — целое, растёт на 1 при каждом изменении (счётчик `REV` в Script Properties, меняется под блокировкой).
  - `entity` ∈ `client | deadline | payment | task | question | activity`; `op` ∈ `upsert | delete`.
  - `origin` — `requestId` записи с сайта, или `бот`, или `таблица` (ручная правка).
- Запись с сайта и из бота пишет в `_changelog` в той же функции, что меняет данные.
- Ручная правка в таблице: **устанавливаемый `onEdit`** пишет строку `_changelog` (`origin: таблица`) и
  увеличивает `version` записи. (Простой `onEdit` не годится: ему недоступны все сервисы; правки скриптом
  триггер не вызывают — их пишет сам скрипт.)
- `cursor` в каждом ответе — текущий `rev`. Курсор выдаёт сервер, сайт не опирается на свои часы.

### `sync.changes`

| Поле | Тип | Обяз. | Что |
|---|---|---|---|
| `since` | integer | да | последний известный сайту `cursor` |
| `limit` | integer | нет | до 500, по умолчанию 200 |

Ответ `data`:

```json
{
  "changes": [
    { "rev": 10481, "entity": "payment", "op": "upsert", "id": "P-2026-0381", "origin": "бот", "record": { … } },
    { "rev": 10482, "entity": "deadline", "op": "delete", "id": "D-0412", "origin": "таблица" }
  ],
  "cursor": 10482,
  "hasMore": false
}
```

`since` старше хранимого журнала (> 30 дней) → `CURSOR_EXPIRED` → сайт берёт `sync.snapshot` заново.

Опрос: при открытии, при возврате во вкладку и раз в **30 с** на видимой вкладке. Оценка нагрузки: 2 пользователя ×
~10 ч × 120 запросов/ч ≈ 2 400 запросов/день; дневного лимита на веб-приложение нет, одновременных — 30.

### `sync.snapshot`

Без полей. Ответ `data`: `{ clients[], deadlines[] (открытые + закрытые за 30 дней), payments[] (за 90 дней), tasks[]
(открытые + сделанные за 7 дней), questions[] (открытые), activity[] (50 последних), serverDate, cursor }`.
Паролей и логинов в снимке **нет**. Ожидаемый размер при 116 клиентах — ~150–250 КБ (замерить).

## 7. Записи (объекты)

```ts
Client   { id, version, name, kind: 'fop1'|'fop2'|'fop3'|'general'|'tov'|'person'|'nonresident',
           marks: string[] /* пенсионер, наёмный, … */, employer: boolean, kved: {code, title}[],
           phone: string|null, email: string|null, bank: string|null, keyUntil: date|null, keyIssuer: string|null,
           monthly: { name: 'ЄП'|'ЄСВ'|'ВЗ', kopecks: integer|null /* null = «по доходу» */, note: string }[],
           botConnected: boolean }
Deadline { id, version, clientId, what: string, obligation: string /* из справочника обязательств */,
           due: date, periodEnd: date|null /* последний день отчётного периода */, kopecks: integer|null,
           status: 'new'|'inProgress'|'waiting'|'postponed' /* словарь значков v1 */ }
Payment  { id, version, clientId, kopecks: integer, period: string, method: 'bank'|'cash'|'card'|'diia'|'transfer'|'other',
           date: date, source: 'сайт'|'бот'|'таблица', status: 'received'|'expected'|'notReceived'|'returned' }
Task     { id, version, clientId|null, text, due: date|null, type, priority: 'critical'|'high'|'medium'|'low', done: boolean }
Question { id, version, text, askedAt: datetime, answer: string|null }
Activity { id, when: datetime, source: 'сайт'|'бот'|'таблица', text, clientId|null }
```

Пароль и логин в `Client` **не передаются никогда** — только `clients.revealPassword`.

## 8. Действия

Ниже: кто может (`mama` — обе роли; `owner` — только Дмитрий), поля `payload`, ответ `data`, ошибки.

### 8.1. Сегодня

**`today.summary`** (mama) — `{}` →
`{ date, dueWeekKopecks, overdueCount, burningCount /* 0–3 дн. */, keysExpiringCount /* ≤ 14 дн. */,
receivedMonthKopecks, receivedPrevMonthKopecks, receivedByDay: integer[] /* копейки по дням месяца */ }`.
Счёт — по шкале словаря значков: 🔴 < 0, 🟠 0–7, 🟡 8–30. Списки для экрана сайт берёт из `sync.snapshot`.

### 8.2. Клиенты

**`clients.get`** (mama) — `{ id }` → `{ client, deadlines[], payments[], tasks[], history: Activity[] }`.
Ошибки: `NOT_FOUND`.

**`clients.create`** (mama) — `{ client: { id /* = requestId */, name, kind, marks, employer, kved[], phone, email,
bank, keyUntil } }` → `{ client, createdDeadlines: Deadline[] }`. Сервер создаёт сроки по шаблонам типа
(«📋 Шаблоны сроков») и считает `monthly`. Ошибки: `VALIDATION` (`field`: name/kind/kved), `DUPLICATE`
(такое имя уже есть — `current` = найденный клиент; сайт спросит «это он?»).

**`clients.update`** (mama) — `{ id, baseVersion, patch: { phone?, email?, bank?, keyUntil?, kved?, marks? } }` →
`{ client }`. Ошибки: `CONFLICT` (`current` — текущая карточка; сайт показывает «было / стало / вы ввели»),
`VALIDATION`, `NOT_FOUND`.

**`clients.revealPassword`** (mama) — `{ id, confirm: true }` → `{ login, password, ttlSeconds: 30 }`.
- Отдельный запрос, только по явному «Показать» с подтверждением.
- Сервер пишет в аудит факт «пароль показан» **без значения**.
- Не кэшировать, не писать в `_requests`, не логировать.
- Не больше 20 раз в час на пользователя (`RATE_LIMIT`).

Сайт держит пароль в памяти 30 с и стирает; в IndexedDB и консоль он не попадает.

### 8.3. Сроки

**`deadlines.close`** (mama) — `{ id, baseVersion }` → `{ closed: Deadline, next: Deadline|null }`. Статус —
«✅ Сдано + 💰 Оплачено», дальше автоцикл системы; `next` — созданный следующий период. **Сервер обязан отказать,
если отчётный период не закончился:** `today < periodEnd + 1` → `PERIOD_OPEN` (`message`: «Период ещё не
закончился — закрыть можно с ДД.ММ.ГГГГ»). Сейчас в таблице этой проверки нет (окно предупреждает только при
сроке > 30 дней) — баг с 28 декларациями III кв. в июле. Ошибки: `CONFLICT`, `NOT_FOUND` («этого срока уже нет —
возможно, его закрыли через бота»).

**`deadlines.reopen`** (mama) — `{ id, undoOf /* requestId закрытия */ }` → `{ reopened: Deadline }`. Отменяет
закрытие: удаляет созданный автоциклом `next` (если по нему ещё ничего не делали) и возвращает срок. «Отменить»
на сайте живёт 10 с, «Вернуть» в «Закрыто сегодня» — до конца дня. Ошибки: `NOT_FOUND`, `UNDO_TOO_LATE`
(по `next` уже были действия).

**`deadlines.update`** (mama) — `{ id, baseVersion, patch: { due?, status?, note? } }` → `{ deadline }`. Ошибки: `CONFLICT`, `VALIDATION`.

### 8.4. Платежи

**`payments.create`** (mama) — `{ payment: { id /* = requestId */, clientId, kopecks, period, method, date } }` →
`{ payment }`. Ошибки `VALIDATION`:
- `kopecks` ≤ 0 → «Сумма должна быть больше нуля»;
- клиент не найден → «Выберите клиента»;
- дата в будущем больше чем на 1 день → «Дата оплаты ещё не наступила».

**`payments.cancel`** (mama) — `{ id }` → `{ cancelled: id }`. Отмена — тоже запись (в аудит). Ошибки: `NOT_FOUND`.

**`payments.list`** (mama) — `{ month: "2026-09" }` → `{ payments[], totalKopecks }` (для месяцев вне снимка).

### 8.5. Задачи

**`tasks.create`** (mama) — `{ task: { id, clientId|null, text, due|null, type, priority } }` → `{ task }`.

**`tasks.complete`** (mama) — `{ id, done: boolean }` → `{ task }`.

### 8.6. Справочник

**`reference.rates`** (mama) — `{ year?: 2026 }` →
`{ year, mzpKopecks: 864700, pmKopecks: 332800, esvMonthlyKopecks: 190234, groups: [{ group, limitKopecks, epRule }],
updatedAt }`. Числа — из «⚙️ Справочники», не из кода сайта.

**`reference.kved`** (mama) — `{ q }` → `{ items: [{ code, title, epByGroup: { "2": "20 % МЗП" },
councilDecision: "рішення Миколаївської міськради №…" }] }` (до 20 штук).

### 8.7. Вопросы маме

**`questions.answer`** (mama) — `{ id, text }` → `{ question }`.

### 8.8. Диагностика (только owner)

**`diag.counters`** — `{ date?: "2026-10-14" }` →
`{ received, applied, rejectedByCode: {CODE: n}, repeats, lockWaitsMs: {p50, p95}, durationMs: {p50, p95},
changelogRev, requestsStored }`. Сайт показывает их рядом со своими ступенями: введено → в очереди → отправлено →
принято → применено → видно в таблице (правило владельца, п. 2.8).

## 9. Коды ошибок

| Код | Когда | Повторять тем же requestId? | Текст для мамы (пример) |
|---|---|---|---|
| `AUTH_REQUIRED` | нет сеанса | после входа | «Войдите, чтобы продолжить» |
| `AUTH_EXPIRED` | сеанс истёк | да, после тихого входа | — (сайт входит сам) |
| `AUTH_INVALID` | ID-токен не прошёл проверку | нет | «Не получилось войти — попробуйте ещё раз» |
| `FORBIDDEN` | почта не в списке / роль не та | нет | «У этого аккаунта нет доступа к кабинету» |
| `VALIDATION` | поле неверно (`field`) | нет | по полю, простыми словами |
| `NOT_FOUND` | записи нет | нет | «Этой записи уже нет в таблице» |
| `CONFLICT` | `baseVersion` устарела (`current`) | нет — сайт спросит маму | «Запись изменилась в таблице» |
| `PERIOD_OPEN` | период не закончился | нет | «Период ещё не закончился — закрыть можно с …» |
| `DUPLICATE` | такой клиент уже есть (`current`) | нет | «Похоже, такой клиент уже есть» |
| `UNDO_TOO_LATE` | отменять поздно | нет | «Отменить уже нельзя — по следующему периоду есть действия» |
| `RATE_LIMIT` | слишком часто | да, позже | «Слишком часто — подождите минуту» |
| `BUSY` | не дождались блокировки | да, через 2–30 с | — (сайт повторит сам) |
| `QUOTA` | исчерпана квота Apps Script | да, позже | «Таблица перегружена — запись отправлю чуть позже» |
| `CURSOR_EXPIRED` | курсор слишком старый | — | — (сайт перезагрузит снимок) |
| `UNSUPPORTED_VERSION` | `v` не поддерживается | нет | «Обновите страницу» |
| `SERVER` | всё остальное | да, по кнопке «Повторить» | «Таблица не ответила — попробуйте ещё раз» |

Сайт повторяет сам: `BUSY`, `QUOTA`, `RATE_LIMIT`, нет связи — с паузой 2 → 4 → 8 → 16 → 30 с. `SERVER` — по кнопке.

## 10. Счётчики и журнал

- Сайт: введено → в очереди → отправлено → принято → отказ → применено → видно в таблице (`src/data/outbox.ts`,
  панель отладки `Ctrl+Shift+D`).
- Сервер: `diag.counters` (8.8). Расхождение «принято сервером» ≠ «видно в таблице» — сигнал разбираться.
- Персональные данные (пароли, ІПН, телефоны, почта) в `detail`, в журналах и в `_requests` **не пишутся**.

## 11. Что проверить на первом деплое (до подключения сайта)

1. `curl -i -L -X POST -H "Content-Type: text/plain" -d '{"v":1,"action":"auth.me"}' <exec>` — есть ли
   `Access-Control-Allow-Origin: *` на финальном ответе; то же из браузера с `https://zaibalistudio.github.io`.
2. Время ответа: 20 запросов подряд и 5 после 30 мин простоя (`time_total`); записать p50/p95 в этот файл.
3. Размер `sync.snapshot` на живых данных (КБ) и время его сборки.
4. `tokeninfo`: время ответа; что при ошибке.
5. Две записи одновременно с двух вкладок — обе применились по очереди (`waitLock`), без потерь.
6. Ручная правка в таблице → строка в `_changelog` с `origin: таблица` за ≤ 1 с; на сайте видна за ≤ 30 с.

## 12. Источники

- Веб-приложения: https://developers.google.com/apps-script/guides/web
- Манифест веб-приложения: https://developers.google.com/apps-script/manifest/web-app-api-executable
- ContentService и редирект: https://developers.google.com/apps-script/guides/content
- TextOutput: https://developers.google.com/apps-script/reference/content/text-output
- Квоты: https://developers.google.com/apps-script/guides/services/quotas
- Триггеры: https://developers.google.com/apps-script/guides/triggers и …/triggers/events
- LockService: https://developers.google.com/apps-script/reference/lock/lock-service
- CacheService: https://developers.google.com/apps-script/reference/cache/cache
- Session: https://developers.google.com/apps-script/reference/base/session
- Utilities (HMAC): https://developers.google.com/apps-script/reference/utilities/utilities
- Проверка ID-токена: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- OpenID Connect (tokeninfo): https://developers.google.com/identity/openid-connect/openid-connect
- Client ID и origins: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- GIS JS (auto_select): https://developers.google.com/identity/gsi/web/reference/js-reference
- Не docs (сообщество, проверить): поведение CORS после редиректа и preflight —
  https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script
