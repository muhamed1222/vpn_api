# Соглашения по именованию

## Файлы и директории

### Файлы исходного кода
Используется **kebab-case** (строчные буквы, слова разделены дефисом).

**Примеры:**
- `verify-auth.ts`
- `sqlite-order-store.ts`
- `orders-repo.ts`
- `yookassa-client.ts`

### Директории
Используется **kebab-case** для директорий.

**Примеры:**
- `src/routes/v1/`
- `src/integrations/marzban/`
- `deploy/systemd/`

## Классы

Используется **PascalCase** (первая буква каждого слова заглавная).

**Примеры:**
- `YooKassaClient`
- `MarzbanService`
- `SqliteOrderStore`
- `MarzbanClient`

## Интерфейсы и типы

### Интерфейсы
Используется **PascalCase**. Для интерфейсов, описывающих параметры функций, используется суффикс `Params`, `Options` или `Config`. Для результатов функций - суффикс `Result` или `Response`.

**Примеры:**
- `Order`
- `AuthenticationResult`
- `CreateOrderRequest`
- `CreateOrderResponse`
- `VerifyAuthOptions`
- `YooKassaClientConfig`
- `VerifyTelegramInitDataParams`
- `VerifyTelegramInitDataResult`

### Типы для строк базы данных
Используется **PascalCase** с суффиксом `Row` для типов, представляющих строки из базы данных.

**Примеры:**
- `OrderRow`
- `PaymentEventRow`
- `VpnKeyRow`

## Функции

Используется **camelCase** (первая буква первого слова строчная, остальных - заглавная).

**Примеры:**
- `createToken()`
- `verifyToken()`
- `getUserConfig()`
- `createOrder()`
- `markPaidWithKey()`

### Функции регистрации маршрутов
Используется **camelCase** с суффиксом `Routes`.

**Примеры:**
- `ordersRoutes()`
- `authRoutes()`
- `v1Routes()`
- `registerRoutes()`

## Переменные

Используется **camelCase**.

**Примеры:**
- `orderStore`
- `yookassaClient`
- `marzbanService`
- `userRef`
- `botToken`
- `jwtSecret`
- `cookieName`

## Константы

Используется **UPPER_SNAKE_CASE** (все буквы заглавные, слова разделены подчеркиванием).

**Примеры:**
- `HOST`
- `PORT`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `ALLOWED_ORIGINS`
- `MARZBAN_API_URL`
- `AUTH_JWT_SECRET`

## Методы классов

### Публичные методы
Используется **camelCase**.

**Примеры:**
- `getUserConfig()`
- `activateUser()`
- `createPayment()`
- `findById()`

### Приватные методы
Используется **camelCase** с модификатором `private`.

**Примеры:**
- `private findUser()`
- `private formatSubscriptionUrl()`
- `private login()`

## Поля классов

### Публичные поля
Используется **camelCase**.

**Примеры:**
- `public client: MarzbanClient`

### Приватные поля
Используется **camelCase** с модификатором `private`.

**Примеры:**
- `private shopId: string`
- `private secretKey: string`
- `private publicUrl: string`

## База данных

### Имена таблиц
Используется **snake_case** (строчные буквы, слова разделены подчеркиванием).

**Примеры:**
- `orders`
- `payment_events`
- `vpn_keys`

### Поля таблиц
Используется **snake_case**.

**Примеры:**
- `order_id`
- `user_ref`
- `plan_id`
- `created_at`
- `updated_at`
- `yookassa_payment_id`
- `marzban_username`

### Функции репозиториев
Используется **camelCase** для функций, работающих с базой данных.

**Примеры:**
- `createOrder()`
- `getOrder()`
- `getOrderByPaymentId()`
- `markPaidWithKey()`
- `recordPaymentEvent()`
- `getActiveKey()`
- `saveKey()`

## Переменные окружения

Используется **UPPER_SNAKE_CASE**.

**Примеры:**
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `MARZBAN_API_URL`
- `AUTH_JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `DATABASE_PATH`

## Именование параметров функций

Параметры функций используют **camelCase**. Для объектов параметров предпочтительно использовать деструктуризацию с именованными параметрами.

**Примеры:**
```typescript
function createOrder(params: {
  orderId: string;
  planId: string;
  userRef?: string;
}): void

function markPaidWithKey(params: {
  orderId: string;
  key: string;
}): boolean
```

## Именование результатов функций

Результаты функций, возвращающие объекты, используют интерфейсы с суффиксом `Result` или `Response`.

**Примеры:**
- `VerifyTelegramInitDataResult`
- `CreateOrderResponse`
- `GetOrderResponse`

## Специальные случаи

### Идентификаторы пользователей
Для идентификаторов пользователей Telegram используется префикс `tg_` перед числовым ID.

**Примеры:**
- `tg_12345678`
- `userRef = 'tg_' + tgId`

### Идентификаторы заказов
Используются UUID в формате строки.

**Примеры:**
- `orderId = uuidv4()`

### Именование модулей при импорте
При импорте модулей используется относительный путь с расширением `.js` (даже для TypeScript файлов).

**Примеры:**
- `import { Order } from '../types/order.js'`
- `import * as ordersRepo from '../storage/ordersRepo.js'`
