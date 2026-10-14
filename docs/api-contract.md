# Контракт API «Сверки» (сайт ↔ Apps Script «Мамы CRM»)

Версия **v2** от 14.10.2026 — с правками архитектора «Мамы CRM» (`D:\МАМА ТАБЛИЦА\docs\сайт\api-реализация.md`, раздел 5,
39 правок; номера правок — в скобках «[п. N]»). v1 — черновик того же дня. Пишет сессия сайта; реализует команда «Мамы CRM» (координатор — сессия
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

Дополнительно [п. 1, 2]: id развёртывания в `doPost` не виден — версии изолируются отдельным развёртыванием, API —
одно отдельное развёртывание (17 старых адресов `/exec` остаются заглушками). Квота Properties (50 000/сутки) общая с
ботом; квота триггеров (90 мин/сутки) к `doPost` не относится — замерить.

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
| Идентификатор | строка, стабильная для записи (не номер строки!): `C-<n>`, `D-<n>`, `T-<n>`, `P-<n>`; платежи и задачи, созданные сайтом, — `requestId` (UUID) [п. 4]. **Сайт id не разбирает** | `C-17`, `D-412`, UUID |
| Версия записи | целое, растёт монотонно (номер ревизии последнего изменения), **шаги могут быть больше 1** [п. 3] | `10482` |
| Пустое | `null` (не пустая строка) | `"keyUntil": null` |

Номер строки листа идентификатором быть не может: строки сдвигаются (ночная сортировка, вставка), а запись — нет.
Стабильные id добавляет команда «Мамы CRM» на этапе 0 сервера (у Сроков и Платежей id нет, у Клиентов и Задач
сейчас `ROW()-4`).

**Время ответа [оценка архитектора, не замер]:** p50 1–5 с, p95 до 10–12 с (`clients.create` — до ~6 с). Сайт
показывает «сохраняется…» сразу, после 5 с — «таблица отвечает дольше обычного — запись не потеряется».

## 3. Вход

1. Сайт показывает кнопку «Войти через Google» (Google Identity Services, client ID проекта; в «Authorized
   JavaScript origins» — `https://zaibalistudio.github.io`, путь не указывается).
2. Сайт берёт одноразовый `nonce` (`auth.nonce`, без сеанса) и передаёт его в GIS; браузер получает **ID-токен**
   (JWT, живёт ~1 ч) с этим `nonce` и вызывает `auth.login` [п. 5].
3. Сервер проверяет токен через `https://oauth2.googleapis.com/tokeninfo?id_token=…` (UrlFetchApp) и сам сверяет:
   `aud` = client ID сайта, `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `exp` в будущем,
   `email_verified = true`, `email` — **в списке разрешённых** (Script Properties `ALLOWED_EMAILS`, на сервере;
   в коде сайта списка нет).
4. Сервер выдаёт **сессионный токен**: `base64(email|role|exp)` + `HMAC-SHA256` подпись
   (`Utilities.computeHmacSha256Signature`, секрет — Script Properties `SESSION_SECRET`), срок 12 ч.
   Все остальные запросы — с `session`; `tokeninfo` больше не вызывается. Сайт хранит сеанс **в памяти или
   `sessionStorage`, не в `localStorage`** [п. 6].
5. Истёк сеанс → ошибка `AUTH_EXPIRED` → сайт тихо получает новый ID-токен (`auto_select`) и повторяет
   `auth.login`, затем исходный запрос (тем же `requestId`). Мама видит окно входа, только если тихо не вышло.

Роли: `mama` (всё рабочее), `owner` (то же + `diag.*`). Роль — из Script Properties `ALLOWED_EMAILS`
(`email:role`).

### `auth.nonce`

Без сеанса, без полей. Ответ `data`: `{ "nonce": "…" }` (одноразовый, живёт 5 мин).

### `auth.login`

| Поле | Тип | Обяз. | Что |
|---|---|---|---|
| `idToken` | string | да | ID-токен GIS |
| `nonce` | string | да | из `auth.nonce`; токен с чужим или повторным `nonce` не принимается |

Ответ `data`: `{ "session": "…", "expiresAt": "2026-10-14T21:12:03+03:00", "user": { "email": "…", "name": "Алла", "role": "mama" } }`.
Ошибки: `AUTH_INVALID` (токен не прошёл проверку), `FORBIDDEN` (почта не в списке — «Этот аккаунт не имеет доступа к
кабинету»), `RATE_LIMIT` (исчерпан бюджет проверок входа) [п. 6].

### `auth.me`

Без полей. Ответ — `user` (как выше). Нужен при открытии сайта с сохранённым сеансом.

## 4. Блокировка и порядок записи (сервер)

Каждая запись (`*.create`, `*.update`, `*.close`, …):

1. `LockService.getScriptLock().waitLock(20000)`; не дождались → `BUSY` (`retryable: true`). В 03:00–03:45 (ночное
   обслуживание таблицы) → `MAINTENANCE` (`retryable: true`) [п. 7].
2. Проверить сеанс и `requestId` в журнале повторов (раздел 5) — если есть, вернуть сохранённый ответ.
3. Проверить `baseVersion` (если есть) → иначе `CONFLICT` с `current`.
4. Выполнить **существующую функцию системы** (та же, что зовёт бот), получить итоговые записи.
5. Увеличить версии затронутых записей, записать изменения в `_changelog` (раздел 6), сохранить ответ в журнал повторов.
6. `releaseLock()`, вернуть ответ.

## 5. Повтор без дублей (идемпотентность)

Скрытый лист `_requests`: `requestId | action | status (начато / готово) | ts | responseJson`. Ответ до 45 000 символов
хранится целиком, больше — пересобирается при повторе [п. 9]. Хранить 7 дней. Повтор с тем же `requestId` → тот же
ответ без повторного выполнения; запись в статусе «начато» (обрыв посреди выполнения) не выполняется второй раз.
Новые **платежи и задачи** сайт создаёт с `id` = `requestId`. **Клиенту id выдаёт сервер** (номер в колонке A);
дубль клиента после обрыва отсекает `_requests` [п. 8].

## 6. Изменения «с момента X» (обратная связь из таблицы и бота)

- Журнал строит **сервер, сравнивая хэши записей** (скрытый лист `_index`: id → хэш + версия) при каждом опросе и после
  каждой записи. Причина: бот, автоцикл, ночные задачи, окна меню и помощник пишут кодом и `onEdit` не вызывают —
  журнал «из onEdit» был бы дырявым [п. 10].
- Скрытый лист `_changelog`: `rev | ts | entity | id | op | origin | recordJson`; счётчик ревизий `REV` ведётся в
  самом `_changelog`, не в Script Properties [п. 11].
  - `entity` ∈ `client | deadline | payment | task | question | activity`; `op` ∈ `upsert | delete`.
  - `origin` — `requestId` записи с сайта или `таблица` (всё остальное, **включая бота**: в v1 бот от ручной правки
    не отличить) [п. 10].
  - `ts` — время **обнаружения** изменения (до 30 с позже самой правки) [п. 12].
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
    { "rev": 10481, "entity": "payment", "op": "upsert", "id": "P-381", "origin": "таблица", "record": { … } },
    { "rev": 10482, "entity": "deadline", "op": "upsert", "id": "D-412", "origin": "таблица", "record": { "status": "done", … } }
  ],
  "cursor": 10482,
  "hasMore": false
}
```

`since` старше хранимого журнала (> 30 дней) → `CURSOR_EXPIRED` → сайт берёт `sync.snapshot` заново.

Опрос: при открытии, при возврате во вкладку и раз в **30 с** на видимой вкладке. Ручная правка видна в `sync.changes`
при следующем опросе после её обнаружения (≤ 30 с + время сравнения) [п. 39]. Оценка нагрузки: 2 пользователя ×
~10 ч × 120 запросов/ч ≈ 2 400 запросов/день; дневного лимита на веб-приложение нет, одновременных — 30.

### `sync.snapshot`

Без полей. Ответ `data`: `{ clients[], deadlines[] (открытые + закрытые за 30 дней, в том числе из «🗄 Архив сроков»),
payments[] (за 90 дней), tasks[] (открытые + сделанные за 7 дней), questions[] (открытые), activity[] (50 последних),
serverDate, cursor }` [п. 14]. **Закрытый срок сайт узнаёт по `status: 'done'`, а не по отсутствию**: закрытые через
3 дня уходят в архив, и тогда в журнале приходит `delete`.
Паролей и логинов в снимке **нет**. Ожидаемый размер при 116 клиентах — ~150–250 КБ (замерить).

## 7. Записи (объекты)

```ts
Client   { id, version,
           name,
           kind: 'fop1'|'fop2'|'fop3'|'fopGeneral'|'tov3'|'tovGeneral'|'person'|'nonresident',   // [п. 15]
           marks: ('pensioner'|'employed'|'allUkraine')[],   // только сочетания из 22 значений колонки L:
                                                             // allUkraine — только fop1/fop2; pensioner+employed нельзя [п. 16]
           employer: boolean, kved: {code, title}[],
           phone: string|null, email: string|null,
           keyIssuer: string|null,   // колонка F: банк / АЦСК, где выпущен ключ (одно поле вместо bank + keyIssuer) [п. 17]
           keyFrom: date|null, keyUntil: date|null,   // [п. 18]
           monthly: { name: 'ЄП'|'ЄСВ'|'ВЗ', kopecks: integer|null, note: string }[],
                    // считает сервер (_computeEpForClient); kopecks = null → note — подсказка («введите оборот») [п. 19]
           botConnected: boolean }
Deadline { id, version, clientId,
           what: string,          // текст обязательства + метка периода («ЄСВ за III квартал») [п. 23]
           obligation: string,    // колонка C как есть
           periodicity: 'once'|'month'|'quarter'|'year',   // для подсказки «следующий будет …» [п. 23]
           due: date,
           periodEnd: date|null,  // ПОСЛЕДНИЙ день отчётного периода; закрыть можно с periodEnd + 1 [п. 22]
           status: 'new'|'inProgress'|'waiting'|'postponed'|'done',   // [п. 20]
           closedAt: date|null }  // сумм у сроков в v1 нет (колонки нет с v5.43.9) [п. 21]
Payment  { id, version, clientId, kopecks: integer, period: string,
           method: 'bank'|'cash'|'mono'|'diia'|'transfer'|'other',   // «📱 Монобанк», не «карта» [п. 24]
           date: date, source: 'сайт'|'бот'|'таблица',   // старые платежи — 'таблица' [п. 25]
           status: 'received'|'expected'|'notReceived'|'returned' }
Task     { id, version, clientId|null, text, due: date|null,
           type: 'report'|'taxes'|'salary'|'key'|'diia'|'consult'|'docs'|'call',   // [п. 26]
           priority: 'critical'|'high'|'medium'|'low', done: boolean }
Question { id, version, text, askedAt: datetime, answer: string|null }
Activity { id, when: datetime, source: 'сайт'|'таблица', text, clientId|null }
```

Пароль и логин в `Client` **не передаются никогда** — только `clients.revealPassword`.

## 8. Действия

Ниже: кто может (`mama` — обе роли; `owner` — только Дмитрий), поля `payload`, ответ `data`, ошибки.

### 8.1. Сегодня

`today.summary` **убран** [п. 27]: сводку «Сегодня» сайт считает сам из `sync.snapshot` (просрочено, горит, ключи,
получено за месяц). Суммы «к оплате» нет — у сроков нет колонки суммы.

### 8.2. Клиенты

**`clients.get`** (mama) — `{ id }` → `{ client, deadlines[], payments[], tasks[], history: Activity[] }`.
Ошибки: `NOT_FOUND`.

**`clients.create`** (mama) — `{ client: { name, kind, marks, employer, kved[], phone, email, keyIssuer, keyFrom,
keyUntil } }` → `{ client /* с id от сервера */, createdDeadlines: Deadline[] }` [п. 8]. Сервер создаёт сроки по шаблонам типа
(«📋 Шаблоны сроков») и считает `monthly`. Ошибки: `VALIDATION` (`field`: name / kind / kved — подозрительный код: «проверьте код 47,21» [п. 29] / marks — недопустимое
сочетание [п. 16]), `DUPLICATE`
(такое имя уже есть — `current` = найденный клиент; сайт спросит «это он?»).

**`clients.update`** (mama) — `{ id, baseVersion, patch: { phone?, email?, keyIssuer?, keyFrom?, keyUntil?, kved?, marks?,
kind? } }` → `{ client, createdDeadlines: Deadline[] }` (смена типа или пометок добавляет сроки по шаблону) [п. 28]. Ошибки: `CONFLICT` (`current` — текущая карточка; сайт показывает «было / стало / вы ввели»),
`VALIDATION`, `NOT_FOUND`.

**`clients.revealPassword`** (mama) — `{ id, confirm: true }` → `{ login, password, ttlSeconds: 30 }`.
- Отдельный запрос, только по явному «Показать» с подтверждением.
- Сервер пишет в аудит факт «пароль показан» **без значения**.
- Не кэшировать, не писать в `_requests`, не логировать.
- Не больше 20 раз в час и 100 в сутки на пользователя (`RATE_LIMIT`); владелец получает уведомление о каждом показе [п. 30].

Сайт держит пароль в памяти 30 с и стирает; в IndexedDB и консоль он не попадает.

### 8.3. Сроки

**`deadlines.close`** (mama) — `{ id, baseVersion }` → `{ closed: Deadline /* status 'done', closedAt */, next: Deadline|null,
notifyAt: datetime }`. Статус — «✅ Сдано + 💰 Оплачено», дальше автоцикл системы; `next` — созданный следующий период.
В журнале закрытие — **`upsert` со `status: 'done'`**, не `delete` [п. 20]. Уведомления клиенту и маме
(«Декларацію здано!») уходят в `notifyAt` — через 2 мин, если закрытие не отменили [п. 31]. **Сервер обязан отказать,
если отчётный период не закончился:** `today ≤ periodEnd` → `PERIOD_OPEN` (`message`: «Период ещё не
закончился — закрыть можно с ДД.ММ.ГГГГ»). Сейчас в таблице этой проверки нет (окно предупреждает только при
сроке > 30 дней) — баг с 28 декларациями III кв. в июле. Ошибки: `CONFLICT`, `NOT_FOUND` («этого срока уже нет —
возможно, его закрыли через бота»).

**`deadlines.reopen`** (mama) — `{ id, undoOf /* requestId закрытия */ }` → `{ reopened: Deadline, notified: boolean }`. Отменяет
закрытие: удаляет созданный автоциклом `next` (если по нему ещё ничего не делали) и возвращает срок. «Отменить»
на сайте живёт 10 с, «Вернуть» в «Закрыто сегодня» — до конца дня. Ошибки: `NOT_FOUND`, `UNDO_TOO_LATE`
(по `next` уже были действия или закрытый срок уже в архиве — через 3 дня) [п. 32]. `notified: true` — уведомление
клиенту уже ушло (отменили позже 2 мин); сайт скажет об этом маме.

**`deadlines.update`** (mama) — `{ id, baseVersion, patch: { due?, status? /* без 'done' — закрытие только close */, note? } }`
→ `{ deadline }`. При правке `due` сервер может сам поставить «в работе» (так делает таблица) — сайт берёт статус из
ответа [п. 33]. Ошибки: `CONFLICT`, `VALIDATION`.

### 8.4. Платежи

**`payments.create`** (mama) — `{ payment: { id /* = requestId */, clientId, kopecks, period, method, date } }` →
`{ payment }`; статус всегда «✅ Получено» [п. 34]. Ошибки `VALIDATION`:
- `kopecks` ≤ 0 → «Сумма должна быть больше нуля»;
- клиент не найден → «Выберите клиента»;
- дата в будущем больше чем на 1 день → «Дата оплаты ещё не наступила».

**`payments.cancel`** (mama) — `{ id }` → `{ cancelled: id }`. Только свой платёж (`source: 'сайт'`) и не позже 24 ч,
иначе `VALIDATION` [п. 35]. В таблице строка удаляется, след остаётся в журнале. Ошибки: `NOT_FOUND`.

**`payments.list`** (mama) — `{ month: "2026-09" }` → `{ payments[], totalKopecks }` (для месяцев вне снимка).

### 8.5. Задачи

**`tasks.create`** (mama) — `{ task: { id /* = requestId */, clientId|null, text, due|null, type, priority } }` → `{ task }`.

**`tasks.complete`** (mama) — `{ id, done: boolean }` → `{ task }`.

### 8.6. Справочник

**`reference.rates`** (mama) — `{ year?: 2026 }` →
`{ year, mzpKopecks: 864700, pmKopecks: 332800, esvMonthlyKopecks: 190234, groups: [{ group, limitKopecks, epRule }],
updatedAt }`. Числа — из «⚙️ Справочники», не из кода сайта.

**`reference.kved`** (mama) — `{ q }` → `{ items: [{ code, title, epByGroup: { "2": "20 % МЗП" },
councilDecision: "рішення Миколаївської міськради №…" | null }] }` (до 20 штук; `null`, если номера решения в листе нет [п. 36]).

### 8.7. Вопросы маме

**`questions.answer`** (mama) — `{ id, text }` → `{ question }`. Если вопрос уже отвечен в Telegram — `VALIDATION`,
`current` = вопрос с ответом [п. 37].

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
| `MAINTENANCE` | ночное обслуживание 03:00–03:45 | да, после 03:45 | «Ночное обслуживание таблицы — запись отправлю после 03:45» [п. 38] |
| `QUOTA` | исчерпана квота Apps Script | да, позже | «Таблица перегружена — запись отправлю чуть позже» |
| `CURSOR_EXPIRED` | курсор слишком старый | — | — (сайт перезагрузит снимок) |
| `UNSUPPORTED_VERSION` | `v` не поддерживается | нет | «Обновите страницу» |
| `SERVER` | всё остальное | да, по кнопке «Повторить» | «Таблица не ответила — попробуйте ещё раз» |

Сайт повторяет сам: `BUSY`, `MAINTENANCE`, `QUOTA`, `RATE_LIMIT`, нет связи — с паузой 2 → 4 → 8 → 16 → 30 с
(для `MAINTENANCE` — с 03:46). `AUTH_EXPIRED` — после тихого входа. `SERVER` — по кнопке «Повторить».

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
6. Ручная правка в таблице и правка через бота → видны в `sync.changes` при следующем опросе (≤ 30 с + время
   сравнения хэшей); замерить время сравнения на 116 клиентах и ~150 сроках.
7. Замеры из раздела 8 разбора архитектора (сначала на копии таблицы, потом на живой).

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

## 13. Изменения v2 относительно v1

Все 39 правок архитектора приняты (номера «[п. N]» в тексте). Главное: журнал изменений — сравнением хэшей, не через
`onEdit`; закрытие срока — `upsert` со `status: 'done'`; у сроков нет сумм; `periodEnd` — последний день периода;
`kind` различает `tov3`/`tovGeneral`; `marks` — перечисление; одно поле `keyIssuer`; метод оплаты `mono`; id клиента —
от сервера; `auth.nonce`; код `MAINTENANCE`; `today.summary` убран (сводку считает сайт); уведомления о закрытии —
через 2 мин.

п. 13 (служебная сущность `secret` для аудита): сайту не отдаётся и в контракте сознательно не упоминается — вариант «или не упоминать» из разбора.
