# Сущности и связи

## Обзор

Проект использует реляционную модель данных с тремя основными таблицами в SQLite и связями с внешними системами (Marzban, YooKassa, Telegram Bot). Все сущности идентифицируются через строковые или числовые идентификаторы.

## Основные сущности

### User (Пользователь)

**Представление:** Пользователь не хранится как отдельная таблица, а идентифицируется через `userRef` в формате `tg_{tgId}`, где `tgId` — идентификатор пользователя Telegram.

**Бизнес-назначение:** Центральная сущность системы, связывающая заказы, VPN ключи и подписки. Пользователь идентифицируется через Telegram ID для интеграции с Telegram Mini App и ботом.

**Использование:**
- `userRef` используется во всех таблицах для связи с пользователем
- Формат: `tg_{tgId}` (например, `tg_12345678`)
- Извлечение `tgId` из `userRef`: `userRef.replace('tg_', '')`

**Связи:**
- Имеет множество заказов (1:N с Order)
- Имеет множество VPN ключей (1:N с VpnKey, но только один активный)
- Связан с MarzbanUser через `marzban_username` в VpnKey

### Order (Заказ)

**Таблица:** `orders`

**Поля:**
- `order_id` (TEXT, PRIMARY KEY) — UUID заказа
- `user_ref` (TEXT, NOT NULL) — ссылка на пользователя в формате `tg_{tgId}`
- `plan_id` (TEXT, NOT NULL) — идентификатор тарифного плана
- `status` (TEXT, NOT NULL) — статус: `'pending' | 'paid' | 'canceled'`
- `yookassa_payment_id` (TEXT, NULL) — ID платежа в YooKassa
- `amount_value` (TEXT, NULL) — сумма платежа
- `amount_currency` (TEXT, NULL) — валюта платежа
- `key` (TEXT, NULL) — VPN ключ (кэшированный для совместимости)
- `created_at` (TEXT, NOT NULL) — дата создания (ISO строка)
- `updated_at` (TEXT, NOT NULL) — дата обновления (ISO строка)

**Бизнес-назначение:** Представляет заказ пользователя на VPN подписку. Создается при инициации покупки, обновляется при оплате, содержит ссылку на платеж и VPN ключ после активации.

**Жизненный цикл:**
1. Создается со статусом `pending` при запросе на создание заказа
2. Обновляется `yookassa_payment_id` и сумма после создания платежа в YooKassa
3. Обновляется до статуса `paid` и сохраняется VPN ключ после успешной оплаты
4. Может быть отменен (статус `canceled`)

**Связи:**
- Принадлежит пользователю через `user_ref` (N:1 с User)
- Связан с тарифом через `plan_id` (N:1 с Plan)
- Связан с платежом через `yookassa_payment_id` (N:1 с Payment)
- Может содержать VPN ключ в поле `key` (для совместимости, основной ключ в таблице `vpn_keys`)

**Индексы:**
- `idx_orders_status` — для фильтрации по статусу
- `idx_orders_yookassa_payment_id` — для поиска заказа по ID платежа

### Plan (Тарифный план)

**Представление:** Не хранится в БД, определяется в конфигурации `PLAN_PRICES`.

**Идентификаторы:**
- `plan_7` — 7 дней (пробный, 10₽ / 2⭐️)
- `plan_30` — 30 дней (99₽ / 75⭐️)
- `plan_90` — 90 дней (260₽ / 190⭐️)
- `plan_180` — 180 дней (499₽ / 370⭐️)
- `plan_365` — 365 дней (899₽ / 650⭐️)

**Бизнес-назначение:** Определяет тарифные планы VPN подписки с ценами в рублях и Telegram Stars. Используется при создании заказов и расчете стоимости.

**Связи:**
- Связан с заказами через `plan_id` (1:N с Order)

**Использование:**
- Получение цены: `getPlanPrice(planId)` возвращает `{ value, stars, currency }`
- Преобразование в дни: `parseInt(planId.replace('plan_', ''), 10)`
- Преобразование в название: `plan_30` → `"1 месяц"`

### Payment (Платеж)

**Представление:** Не хранится как отдельная таблица, идентифицируется через `yookassa_payment_id` из YooKassa API.

**Бизнес-назначение:** Представляет платеж в системе YooKassa. Создается при создании заказа, обрабатывается через webhook при успешной оплате.

**Связи:**
- Связан с заказом через `yookassa_payment_id` в таблице `orders` (1:1 с Order)
- Имеет множество событий (1:N с PaymentEvent)

**Использование:**
- Создается через `YooKassaClient.createPayment()`
- ID сохраняется в заказе через `setPaymentId()`
- Поиск заказа по ID платежа: `getOrderByPaymentId(yookassaPaymentId)`

### PaymentEvent (Событие платежа)

**Таблица:** `payment_events`

**Поля:**
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT) — внутренний ID
- `yookassa_event_id` (TEXT, UNIQUE) — уникальный ID события от YooKassa
- `yookassa_payment_id` (TEXT, NOT NULL) — ID платежа
- `event` (TEXT, NOT NULL) — тип события (например, `payment.succeeded`)
- `created_at` (TEXT, NOT NULL) — дата создания (ISO строка)

**Бизнес-назначение:** Записывает события от YooKassa для предотвращения дублей обработки webhook'ов. UNIQUE constraint на `yookassa_event_id` гарантирует идемпотентность.

**Связи:**
- Принадлежит платежу через `yookassa_payment_id` (N:1 с Payment)

**Использование:**
- Проверка обработки события: `hasPaymentEvent({ yookassaEventId, yookassaPaymentId, event })`
- Запись события: `recordPaymentEvent({ yookassaEventId, yookassaPaymentId, event })`
- При дубле (UNIQUE constraint) операция игнорируется

**Индексы:**
- `idx_payment_events_yookassa_payment_id` — для поиска событий по ID платежа

### VpnKey (VPN ключ)

**Таблица:** `vpn_keys`

**Поля:**
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT) — внутренний ID
- `user_ref` (TEXT, NOT NULL) — ссылка на пользователя
- `marzban_username` (TEXT, NOT NULL) — имя пользователя в Marzban
- `key` (TEXT, NOT NULL) — subscription URL (VPN ключ)
- `created_at` (TEXT, NOT NULL) — дата создания (ISO строка)
- `revoked_at` (TEXT, NULL) — дата отзыва (ISO строка, NULL если активен)
- `is_active` (INTEGER, DEFAULT 1) — флаг активности (1 = активен, 0 = неактивен)

**Бизнес-назначение:** Кэш VPN ключей пользователей для быстрого доступа без запросов к Marzban. Хранит историю ключей с поддержкой отзыва и регенерации.

**Жизненный цикл:**
1. Создается при активации пользователя в Marzban или получении ключа
2. При создании нового ключа старые автоматически деактивируются (`is_active = 0`, `revoked_at = now`)
3. При регенерации ключа старый помечается неактивным, создается новый
4. Активный ключ: `is_active = 1 AND revoked_at IS NULL`

**Связи:**
- Принадлежит пользователю через `user_ref` (N:1 с User)
- Связан с MarzbanUser через `marzban_username` (N:1 с MarzbanUser)

**Использование:**
- Получение активного ключа: `getActiveKey(userRef)` — возвращает последний активный ключ
- Сохранение ключа: `saveKey({ userRef, marzbanUsername, key })` — деактивирует старые, создает новый
- Отзыв ключа: `revokeKey(userRef)` — деактивирует все активные ключи пользователя

**Индексы:**
- `idx_vpn_keys_user_ref` — для поиска ключей пользователя
- `idx_vpn_keys_active` — составной индекс для поиска активных ключей

### MarzbanUser (Пользователь Marzban)

**Представление:** Внешняя сущность, получаемая через Marzban API.

**Поля (из Marzban API):**
- `username` (string) — имя пользователя в Marzban
- `status` (string) — статус (`'active' | 'disabled'`)
- `expire` (number | null) — Unix timestamp окончания подписки
- `data_limit` (number | null) — лимит трафика в байтах (0 = безлимит)
- `used_traffic` (number) — использованный трафик в байтах
- `subscription_url` (string) — URL подписки в формате `/sub/...`
- `links` (string[]) — массив subscription links

**Бизнес-назначение:** Представляет пользователя VPN в панели управления Marzban. Используется для активации подписок, получения статуса и регенерации ключей.

**Связи:**
- Связан с VpnKey через `marzban_username` (1:N с VpnKey)
- Связан с User через поиск по `tg_{tgId}` или `{tgId}`

**Использование:**
- Поиск пользователя: `MarzbanClient.getUser('tg_{tgId}')` или `getUser('{tgId}')`
- Создание пользователя: `MarzbanClient.createUser({ username, proxies, inbounds, expire, ... })`
- Обновление пользователя: `MarzbanClient.updateUser(username, userData)`
- Регенерация ключа: `MarzbanClient.request({ method: 'post', url: '/api/user/{username}/reset' })`

## Связи между сущностями

### User ↔ Order (1:N)

Один пользователь может иметь множество заказов. Связь через `user_ref` в таблице `orders`.

**Использование:**
- Получение заказов пользователя: `getOrdersByUser(userRef)` — возвращает до 50 последних заказов
- Проверка наличия оплаченных заказов: фильтрация по `status = 'paid'`

### Order ↔ Plan (N:1)

Один заказ связан с одним тарифным планом. Связь через `plan_id` в таблице `orders`.

**Использование:**
- Получение цены тарифа: `getPlanPrice(order.plan_id)`
- Преобразование в дни: `parseInt(order.plan_id.replace('plan_', ''), 10)`

### Order ↔ Payment (N:1)

Один заказ связан с одним платежом. Связь через `yookassa_payment_id` в таблице `orders`.

**Использование:**
- Поиск заказа по ID платежа: `getOrderByPaymentId(yookassaPaymentId)`
- Сохранение ID платежа: `setPaymentId({ orderId, yookassaPaymentId, amountValue, amountCurrency })`

### Payment ↔ PaymentEvent (1:N)

Один платеж может иметь множество событий. Связь через `yookassa_payment_id` в таблице `payment_events`.

**Использование:**
- Проверка обработки события: `hasPaymentEvent({ yookassaPaymentId, event })`
- Запись события: `recordPaymentEvent({ yookassaEventId, yookassaPaymentId, event })`

### User ↔ VpnKey (1:N)

Один пользователь может иметь множество VPN ключей, но только один активный. Связь через `user_ref` в таблице `vpn_keys`.

**Использование:**
- Получение активного ключа: `getActiveKey(userRef)` — возвращает последний активный ключ
- При сохранении нового ключа старые автоматически деактивируются

### VpnKey ↔ MarzbanUser (N:1)

Множество ключей могут быть связаны с одним пользователем Marzban. Связь через `marzban_username` в таблице `vpn_keys`.

**Использование:**
- При создании/обновлении ключа сохраняется `marzban_username` для связи с Marzban
- Поиск пользователя в Marzban: `MarzbanClient.getUser(marzbanUsername)`

### Order ↔ VpnKey (опциональная связь)

Заказ может содержать VPN ключ в поле `key` для совместимости, но основной источник ключей — таблица `vpn_keys`.

**Использование:**
- При активации заказа ключ сохраняется и в заказ (`markPaidWithKey`), и в таблицу `vpn_keys` (`saveKey`)
- Получение последнего ключа из заказов: `getLastKeyForUser(userRef)` — для обратной совместимости

## Внешние связи

### Telegram Bot Database

Для реферальной программы используется внешняя база данных бота через `ATTACH DATABASE`.

**Таблицы бота:**
- `referrals` — реферальные коды пользователей
- `user_referrals` — связи между реферером и рефералами
- `orders` — заказы в боте (для проверки пробного тарифа)

**Связи:**
- User ↔ ReferralStats через `tgId` и запросы к базе бота

**Использование:**
- Получение статистики рефералов: `getReferralStats(tgId, botDbPath)`
- Проверка пробного тарифа: проверка заказов в базе бота через `ATTACH DATABASE`

## Принципы работы со связями

### Каскадные операции

При создании нового VPN ключа автоматически деактивируются старые ключи пользователя:
```typescript
// При saveKey() автоматически выполняется:
UPDATE vpn_keys SET is_active = 0, revoked_at = now WHERE user_ref = ? AND is_active = 1
```

### Идемпотентность

Все критические операции проверяют текущее состояние перед выполнением:
- При обновлении заказа проверяется статус (если уже `paid` с ключом — операция пропускается)
- При записи события платежа UNIQUE constraint предотвращает дубли

### Синхронизация данных

VPN ключи синхронизируются между таблицами:
- При активации заказа ключ сохраняется в `orders.key` и `vpn_keys.key`
- При регенерации ключа обновляется и в заказе, и в таблице ключей

### Поиск по связям

Индексы оптимизируют поиск по связям:
- Поиск заказов пользователя: `idx_orders_status` (фильтрация по статусу)
- Поиск активных ключей: `idx_vpn_keys_active` (составной индекс по `user_ref` и `is_active`)
- Поиск заказа по платежу: `idx_orders_yookassa_payment_id`
