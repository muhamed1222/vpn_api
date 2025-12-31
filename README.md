# Outlivion API

API сервер на Node.js + TypeScript с использованием Fastify.

## Установка

```bash
npm install
```

## Конфигурация

Сервер читает настройки из переменных окружения. Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

**На VPS:** Создайте директорию для базы данных перед запуском:

```bash
sudo mkdir -p /opt/outlivion-api/data
sudo chown outlivion:outlivion /opt/outlivion-api/data
```

Переменные окружения:
- `HOST=127.0.0.1` - адрес, на котором сервер будет слушать (по умолчанию `127.0.0.1`)
- `PORT=3001` - порт сервера (по умолчанию `3001`)
- `DATABASE_PATH=/opt/outlivion-api/data/db.sqlite` - путь к файлу SQLite базы данных
- `YOOKASSA_SHOP_ID` - ID магазина YooKassa (обязательно)
- `YOOKASSA_SECRET_KEY` - секретный ключ YooKassa (обязательно)
- `YOOKASSA_RETURN_URL=https://my.outlivion.space/pay/return` - URL для возврата пользователя после оплаты
- `YOOKASSA_WEBHOOK_IP_CHECK=false` - включить проверку IP для webhook (по умолчанию `false`)
- `PUBLIC_BASE_URL=https://api.outlivion.space` - публичный URL API (для генерации webhook URL и ссылок)
- `ALLOWED_ORIGINS=https://outlivion.space,https://www.outlivion.space,https://my.outlivion.space` - разрешенные источники для CORS (через запятую, опционально)

**Важно:** Сервер слушает именно указанный `HOST`, а не `0.0.0.0`. По умолчанию это `127.0.0.1` (только localhost).

## Запуск

### Разработка (с hot-reload)

```bash
npm run dev
```

Сервер запустится на `http://127.0.0.1:3001` (или на значениях из `.env`, если файл создан).

### Сборка

```bash
npm run build
```

Скомпилированные файлы будут в папке `dist/`.

### Запуск production версии

```bash
npm start
```

Сервер запустится из скомпилированных файлов в `dist/`.

## API Endpoints

### Health Check

#### GET /health

Проверка работоспособности сервера.

```bash
curl http://127.0.0.1:3001/health
```

Ответ:
```json
{
  "ok": true,
  "ts": "2024-01-01T12:00:00.000Z"
}
```

### API v1

Все эндпоинты v1 защищены rate limiting (100 запросов в минуту).

#### POST /v1/orders/create

Создание нового заказа.

```bash
curl -X POST http://127.0.0.1:3001/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "plan-123",
    "userRef": "user-456"
  }'
```

Ответ:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "paymentUrl": "https://example.com/pay/550e8400-e29b-41d4-a716-446655440000"
}
```

#### GET /v1/orders/:orderId

Получение информации о заказе.

```bash
curl http://127.0.0.1:3001/v1/orders/550e8400-e29b-41d4-a716-446655440000
```

Ответ (если заказ не оплачен):
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

Ответ (если заказ оплачен):
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "paid",
  "key": "DUMMY_KEY"
}
```

#### POST /v1/payments/webhook

Webhook для обработки уведомлений YooKassa.

**Формат уведомления YooKassa:**
```json
{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "2c5e8b3a-000f-5000-8000-1a2b3c4d5e6f",
    "status": "succeeded",
    "paid": true,
    "amount": {
      "value": "299.00",
      "currency": "RUB"
    },
    "metadata": {
      "orderId": "550e8400-e29b-41d4-a716-446655440000",
      "planId": "plan-basic",
      "userRef": "user-123"
    }
  }
}
```

**Тестовый пример (мок уведомления):**
```bash
ORDER_ID="550e8400-e29b-41d4-a716-446655440000"
PAYMENT_ID="2c5e8b3a-000f-5000-8000-1a2b3c4d5e6f"

curl -X POST http://127.0.0.1:3001/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"notification\",
    \"event\": \"payment.succeeded\",
    \"object\": {
      \"id\": \"$PAYMENT_ID\",
      \"status\": \"succeeded\",
      \"paid\": true,
      \"amount\": {
        \"value\": \"299.00\",
        \"currency\": \"RUB\"
      },
      \"metadata\": {
        \"orderId\": \"$ORDER_ID\",
        \"planId\": \"plan-basic\"
      }
    }
  }"
```

**Ответ:**
```json
{
  "ok": true
}
```

**Обрабатываемые события:**
- `payment.succeeded` — заказ помечается как оплачен, создается VPN ключ
- `payment.canceled` — заказ помечается как отменен (если еще не оплачен)

## Примеры использования

### Полный цикл: создание заказа → оплата → получение ключа

1. Создать заказ:
```bash
ORDER_ID=$(curl -s -X POST http://127.0.0.1:3001/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{"planId": "plan-123"}' | jq -r '.orderId')

echo "Order ID: $ORDER_ID"
```

2. Проверить статус заказа:
```bash
curl http://127.0.0.1:3001/v1/orders/$ORDER_ID
```

3. Симулировать успешный платеж через webhook:
```bash
curl -X POST http://127.0.0.1:3001/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -d "{\"event\": \"payment.succeeded\", \"orderId\": \"$ORDER_ID\"}"
```

4. Получить ключ:
```bash
curl http://127.0.0.1:3001/v1/orders/$ORDER_ID
```

## Структура проекта

```
outlivion-api/
├── src/
│   ├── server.ts              # Точка входа сервера
│   ├── types/
│   │   └── order.ts           # Типы для заказов
│   ├── store/
│   │   ├── order-store.ts     # Интерфейс хранилища заказов
│   │   └── memory-order-store.ts  # Реализация в памяти
│   └── routes/
│       ├── index.ts           # Регистрация всех роутов
│       ├── health.ts          # Health check endpoint
│       └── v1/
│           ├── index.ts       # Регистрация v1 роутов
│           ├── orders.ts      # Роуты для заказов
│           └── payments.ts     # Роуты для платежей
├── dist/                      # Скомпилированные файлы (после build)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Особенности

- ✅ Валидация запросов через Zod
- ✅ CORS с allowlist (настраивается через `ALLOWED_ORIGINS`)
- ✅ Rate limiting для всех эндпоинтов `/v1/*` (100 запросов/минуту)
- ✅ Хранилище заказов в памяти (через интерфейс `OrderStore`)
- ✅ Graceful shutdown
- ✅ Обработка ошибок

