# Сервисы проекта

## Обзор

Проект использует сервисную архитектуру, разделяющую ответственность между бизнес-логикой, интеграциями с внешними API и хранением данных. Все сервисы инициализируются при старте приложения и регистрируются в экземпляре Fastify через декораторы.

## Интеграционные сервисы

### MarzbanService

Высокоуровневый сервис для управления VPN-пользователями через панель Marzban. Инкапсулирует бизнес-логику активации, продления и регенерации ключей с кэшированием в локальной базе данных.

**Инициализация:**
```typescript
new MarzbanService(
  apiUrl: string,          // URL Marzban API
  username: string,        // Имя администратора
  password: string,        // Пароль администратора
  publicUrl?: string,      // Публичный URL для subscription links
  subscriptionPath?: string // Путь к proxy для подписок
)
```

**Методы:**

- **getUserConfig(tgId: number): Promise<string | null>**
  - Получает VPN-ключ пользователя из кэша (БД) или Marzban
  - Гарантирует отсутствие побочных эффектов (только чтение)
  - Входные данные: `tgId` — идентификатор пользователя Telegram
  - Выходные данные: `string | null` — subscription URL или `null`, если пользователь не найден
  - Бизнес-логика: сначала проверяет кэш в таблице `vpn_keys`, если ключа нет — запрашивает у Marzban и сохраняет в кэш

- **activateUser(tgId: number, days: number): Promise<string>**
  - Активирует или создает пользователя в Marzban с указанным сроком действия
  - Входные данные: `tgId` — идентификатор пользователя Telegram, `days` — количество дней подписки
  - Выходные данные: `string` — subscription URL
  - Бизнес-логика: ищет существующего пользователя с префиксом `tg_` или без него, если не найден — создает нового с настройками VLESS_REALITY, если найден — обновляет срок действия (продлевает, если подписка активна, или устанавливает новый срок, если просрочена), форматирует subscription URL и сохраняет в кэш

- **getUserStatus(tgId: number): Promise<MarzbanUser | null>**
  - Получает текущий статус пользователя из Marzban
  - Входные данные: `tgId` — идентификатор пользователя Telegram
  - Выходные данные: `MarzbanUser | null` — объект с данными пользователя или `null`
  - Бизнес-логика: ищет пользователя в Marzban, возвращает полную информацию о подписке (статус, срок действия, использованный трафик, лимиты)

- **renewUser(tgId: number, days: number): Promise<boolean>**
  - Продлевает подписку пользователя на указанное количество дней
  - Входные данные: `tgId` — идентификатор пользователя Telegram, `days` — количество дней для продления
  - Выходные данные: `boolean` — результат операции
  - Бизнес-логика: вызывает `activateUser` для продления подписки

- **regenerateUser(tgId: number): Promise<string | null>**
  - Регенерирует VPN-ключ пользователя (сбрасывает токен в Marzban)
  - Входные данные: `tgId` — идентификатор пользователя Telegram
  - Выходные данные: `string | null` — новый subscription URL или `null`
  - Бизнес-логика: сбрасывает токен пользователя в Marzban через API, получает обновленного пользователя, деактивирует старые ключи в БД и сохраняет новый ключ

**Внутренние методы:**

- **findUser(tgId: number): Promise<MarzbanUser | null>** — ищет пользователя по `tg_{tgId}` или `{tgId}`, возвращает `null` при отсутствии
- **formatSubscriptionUrl(user: MarzbanUser): string** — форматирует subscription URL из данных пользователя, используя `subscription_url` или первый элемент `links`

### MarzbanClient

HTTP-клиент для взаимодействия с Marzban API. Обрабатывает аутентификацию и автоматически обновляет токен при истечении.

**Инициализация:**
```typescript
new MarzbanClient(
  apiUrl: string,    // Базовый URL Marzban API
  username: string,  // Имя администратора
  password: string   // Пароль администратора
)
```

**Методы:**

- **request(config: any): Promise<any>**
  - Универсальный метод для выполнения HTTP-запросов к Marzban API
  - Входные данные: `config` — конфигурация axios-запроса (method, url, data, headers)
  - Выходные данные: ответ от API
  - Бизнес-логика: автоматически выполняет логин при отсутствии токена, добавляет Bearer токен в заголовки, при 401 обновляет токен и повторяет запрос

- **getUser(username: string): Promise<MarzbanUser | null>**
  - Получает данные пользователя по имени
  - Входные данные: `username` — имя пользователя в Marzban
  - Выходные данные: `MarzbanUser | null` — данные пользователя или `null` при 404

- **createUser(userData: any): Promise<MarzbanUser>**
  - Создает нового пользователя в Marzban
  - Входные данные: `userData` — объект с настройками пользователя (username, proxies, inbounds, expire, data_limit, status, note)
  - Выходные данные: `MarzbanUser` — созданный пользователь

- **updateUser(username: string, userData: any): Promise<MarzbanUser>**
  - Обновляет данные пользователя в Marzban
  - Входные данные: `username` — имя пользователя, `userData` — объект с обновляемыми данными
  - Выходные данные: `MarzbanUser` — обновленный пользователь

**Внутренние методы:**

- **login(): Promise<void>** — выполняет аутентификацию и сохраняет access token

### YooKassaClient

HTTP-клиент для взаимодействия с YooKassa API для создания платежей. Поддерживает идемпотентность запросов через ключи.

**Инициализация:**
```typescript
new YooKassaClient({
  shopId: string,        // ID магазина в YooKassa
  secretKey: string,     // Секретный ключ
  baseUrl?: string       // Базовый URL API (по умолчанию https://api.yookassa.ru/v3)
})
```

**Методы:**

- **createPayment(params: YooKassaPaymentParams, idempotenceKey?: string): Promise<YooKassaPaymentResponse>**
  - Создает платеж в YooKassa
  - Входные данные:
    - `params` — параметры платежа (amount, capture, confirmation, description, metadata, receipt)
    - `idempotenceKey` — ключ идемпотентности (опционально, генерируется автоматически)
  - Выходные данные: `YooKassaPaymentResponse` — объект с ID платежа, статусом, URL подтверждения и метаданными
  - Бизнес-логика: создает платеж через YooKassa API с базовой авторизацией, использует Idempotence-Key для предотвращения дублей, устанавливает таймаут 30 секунд, обрабатывает ошибки аутентификации (401) с понятными сообщениями

**Интерфейсы:**

- **YooKassaPaymentParams** — параметры платежа (amount, capture, confirmation, description, metadata, receipt)
- **YooKassaPaymentResponse** — ответ API (id, status, confirmation.confirmation_url, paid, amount, metadata)
- **YooKassaReceipt** — чек для ФНС (customer, items с описанием, количеством, суммой, НДС)

## Сервисы хранения данных

### OrderStore

Интерфейс для работы с хранилищем заказов. Реализует паттерн Repository для абстракции доступа к данным.

**Методы интерфейса:**

- **create(order: Order): Promise<void>** — создает новый заказ
- **findById(orderId: string): Promise<Order | null>** — находит заказ по ID
- **update(orderId: string, updates: Partial<Order>): Promise<boolean>** — обновляет заказ

**Реализации:**

- **SqliteOrderStore** — реализация через SQLite, использует `ordersRepo` для работы с базой данных
- **MemoryOrderStore** — реализация через память (Map), используется для тестирования

**Использование:**

```typescript
// В routes используется через декоратор Fastify
const orderStore = fastify.orderStore;
const order = await orderStore.findById(orderId);
await orderStore.update(orderId, { status: 'paid', key: vpnKey });
```

### Репозитории

Прямой доступ к данным через SQLite, минуя интерфейсы. Используются как в сервисах, так и напрямую в роутах.

**ordersRepo** — репозиторий для работы с заказами:

- **createOrder(params: { orderId, planId, userRef? }): void** — создает заказ со статусом `pending`
- **getOrder(orderId: string): OrderRow | null** — получает заказ по ID
- **getOrderByPaymentId(yookassaPaymentId: string): OrderRow | null** — получает заказ по ID платежа YooKassa
- **setPaymentId(params: { orderId, yookassaPaymentId, amountValue?, amountCurrency? }): boolean** — сохраняет ID платежа и сумму в заказ
- **markPaidWithKey(params: { orderId, key }): boolean** — помечает заказ как оплаченный и сохраняет VPN-ключ (идемпотентная операция)
- **markCanceled(orderId: string): boolean** — помечает заказ как отмененный (идемпотентная операция)
- **recordPaymentEvent(params: { yookassaEventId?, yookassaPaymentId, event }): boolean** — записывает событие платежа для предотвращения дублей (идемпотентная операция)
- **hasPaymentEvent(params): boolean** — проверяет, было ли уже обработано событие платежа
- **getOrdersByUser(userRef: string): OrderRow[]** — получает все заказы пользователя (до 50, отсортированы по дате создания)
- **getLastKeyForUser(userRef: string): string | null** — получает последний активный ключ пользователя из оплаченных заказов

**keysRepo** — репозиторий для работы с VPN-ключами:

- **getActiveKey(userRef: string): VpnKeyRow | null** — получает активный ключ пользователя (не отозванный, `is_active = 1`)
- **saveKey(params: { userRef, marzbanUsername, key }): void** — сохраняет новый ключ, деактивируя старые (помечает `is_active = 0`, устанавливает `revoked_at`)
- **revokeKey(userRef: string): void** — отзывает все активные ключи пользователя

**referralsRepo** — репозиторий для работы с реферальной программой:

- **getReferralStats(tgId: number, botDbPath: string): ReferralStats** — получает статистику рефералов из базы бота (требует подключения к внешней БД)

## Использование сервисов

### Инициализация

Все сервисы инициализируются в `server.ts` при запуске приложения и регистрируются в Fastify через декораторы:

```typescript
const orderStore = new SqliteOrderStore();
fastify.decorate('orderStore', orderStore);

const yookassaClient = new YooKassaClient({
  shopId: YOOKASSA_SHOP_ID,
  secretKey: YOOKASSA_SECRET_KEY
});
fastify.decorate('yookassaClient', yookassaClient);

const marzbanService = new MarzbanService(
  MARZBAN_API_URL,
  MARZBAN_ADMIN_USERNAME,
  MARZBAN_ADMIN_PASSWORD,
  MARZBAN_PUBLIC_URL,
  SUBSCRIPTION_PROXY_PATH
);
fastify.decorate('marzbanService', marzbanService);
```

### Доступ в роутах

Сервисы доступны через декораторы Fastify:

```typescript
export async function userRoutes(fastify: FastifyInstance) {
  const marzbanService = fastify.marzbanService;
  const config = await marzbanService.getUserConfig(request.user.tgId);
}
```

### Идемпотентность

Критические операции (активация, платежи, сохранение ключей) реализованы как идемпотентные:
- Проверка состояния перед выполнением операции
- Повторные вызовы с теми же параметрами не изменяют результат
- Предотвращение дублей через проверку статусов и событий

### Обработка ошибок

Сервисы пробрасывают ошибки наверх для обработки в роутах:
- MarzbanClient обрабатывает 401 (обновление токена) и 404 (пользователь не найден)
- YooKassaClient обрабатывает таймауты и ошибки аутентификации с понятными сообщениями
- Роуты логируют ошибки и возвращают соответствующие HTTP-статусы

### Кэширование

MarzbanService использует локальную базу данных как кэш для VPN-ключей:
- `getUserConfig` сначала проверяет кэш, затем запрашивает Marzban
- При активации и регенерации ключи автоматически сохраняются в кэш
- Старые ключи деактивируются при сохранении новых
