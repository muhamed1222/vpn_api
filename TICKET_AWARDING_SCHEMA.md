# Полная схема получения билетов

## Общая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                      ИСТОЧНИКИ ОПЛАТЫ                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Telegram Payments (через бота)                               │
│ 2. YooKassa Webhook → API                                       │
│ 3. CryptoCloud Webhook → Бот                                    │
│ 4. Cryptobot Webhook → Бот                                      │
│ 5. Heleket Webhook → Бот                                        │
│ 6. YooMoney Webhook → Бот                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ОБРАБОТКА ОПЛАТЫ                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## ПУТЬ 1: Обработка через БОТ (основной путь)

### 1.1. Telegram Payments (через бота)

```
Пользователь оплачивает в Telegram
           │
           ▼
bot.action('successful_payment') 
    (src/bot/index.ts)
           │
           ▼
OrderProcessingService.processPayment(orderId, telegramChargeId, providerChargeId)
    (src/services/orderProcessingService.ts, строка 17)
           │
           ├─ Проверка дубликатов
           ├─ Проверка статуса (если COMPLETED → return ❌)
           ├─ Установка статуса PAID
           │
           ▼
OrderProcessingService.activateOrder(order)
    (src/services/orderProcessingService.ts, строка 91)
           │
           ├─ Проверка: заказ существует
           ├─ Проверка: статус PAID или COMPLETED
           │
           ├─ Если COMPLETED (строка 108):
           │   │
           │   ├─ ContestService.getActiveContest()
           │   │
           │   ▼
           │   ContestService.awardSelfPurchaseTicket(...)
           │   (src/services/contestService.ts)
           │       │
           │       ├─ Проверка: билеты не начислены
           │       ├─ Проверка: активный конкурс
           │       ├─ Проверка: период конкурса
           │       ├─ Проверка: plan_id != 'plan_7'
           │       │
           │       ▼
           │       INSERT INTO ticket_ledger (SELF_PURCHASE) ✅
           │
           └─ Если PAID (строка 215):
               │
               ├─ MarzbanService.renewUser() → активация VPN
               ├─ Установка статуса COMPLETED
               │
               ▼
               ContestService.getActiveContest()
                   │
                   ├─ Если есть реферер:
                   │   │
                   │   ├─ ContestService.checkQualification()
                   │   │   ├─ Проверка периода конкурса
                   │   │   ├─ Проверка окна атрибуции
                   │   │   ├─ Проверка квалификации (нет оплат до привязки)
                   │   │
                   │   ▼
                   │   ContestService.awardTickets(...) → начисление рефереру
                   │       │
                   │       ▼
                   │       INSERT INTO ticket_ledger (INVITEE_PAYMENT) ✅
                   │
                   ▼
               ContestService.awardSelfPurchaseTicket(...)
                   │
                   ▼
               INSERT INTO ticket_ledger (SELF_PURCHASE) ✅
```

### 1.2. Webhook от YooKassa → Бот

```
YooKassa Webhook → /webhooks/yukassa
    (src/routes/webhooks.ts)
           │
           ▼
OrderProcessingService.processPayment(orderId, '', payment.id)
    → Дальше как в 1.1
```

### 1.3. Webhook от CryptoCloud → Бот

```
CryptoCloud Webhook → /webhooks/cryptocloud
    (src/routes/webhooks.ts)
           │
           ▼
OrderProcessingService.processPayment(orderId, invoice_id, 'cryptocloud')
    → Дальше как в 1.1
```

### 1.4. Прямой вызов activateOrder() (восстановление заказа)

```
Admin команда /recover_order
    (src/bot/index.ts)
           │
           ▼
OrderProcessingService.activateOrder(order)
    → Дальше как в 1.1 (путь для COMPLETED или PAID)
```

### 1.5. Проверка оплаты через кнопку "Проверить оплату"

```
bot.action('check_order')
    (src/bot/index.ts)
           │
           ▼
OrderProcessingService.activateOrder(order)
    → Дальше как в 1.1
```

---

## ПУТЬ 2: Обработка через API Webhook

```
YooKassa Webhook → POST /v1/payments/webhook
    (src/routes/v1/payments.ts)
           │
           ├─ Проверка IP адреса YooKassa
           ├─ Валидация подписи
           │
           ▼
ordersRepo.getOrder(orderId)
    (проверка заказа в API базе)
           │
           ├─ Если заказ не найден → return ❌
           ├─ Если уже paid + есть key → return ✅
           │
           ▼
marzbanService.activateUser(tgId, days)
    (активация VPN в Marzban)
           │
           ▼
ordersRepo.markPaidWithKey({ orderId, key })
    (сохранение ключа в API базе)
           │
           ▼
awardTicketsForPayment(botDbPath, tgId, orderId, planId, orderCreatedAt)
    (src/storage/contestUtils.ts, строка 121)
           │
           ├─ ATTACH DATABASE bot_db
           ├─ Получение активного конкурса
           ├─ Проверка периода конкурса
           ├─ Поиск реферера
           │   │
           │   ├─ Проверка самореферала
           │   ├─ Проверка окна атрибуции
           │   ├─ Проверка квалификации (нет оплат до привязки)
           │
           ├─ getTicketsFromPlanId(planId)
           │   ├─ plan_30 → 1 билет
           │   ├─ plan_90 → 3 билета
           │   ├─ plan_180 → 6 билетов
           │   ├─ plan_365 → 12 билетов
           │
           ├─ ВСЕГДА: INSERT ticket_ledger (SELF_PURCHASE) ✅
           │
           └─ Если реферер квалифицирован:
               │
               ▼
               INSERT ticket_ledger (INVITEE_PAYMENT) ✅
               UPDATE ref_events (status = 'qualified')
```

---

## Детальная схема проверок и начисления

### Проверка 1: Активный конкурс

```sql
SELECT id, starts_at, ends_at, attribution_window_days
FROM bot_db.contests
WHERE is_active = 1
ORDER BY starts_at DESC
LIMIT 1
```

**Если конкурс не найден** → билеты НЕ начисляются ❌

---

### Проверка 2: Период конкурса

```javascript
const orderDate = new Date(orderCreatedAt);
const contestStart = new Date(contest.starts_at);
const contestEnd = new Date(contest.ends_at);

if (orderDate < contestStart || orderDate > contestEnd) {
    return false; // ❌ Заказ вне периода конкурса
}
```

**Если заказ вне периода** → билеты НЕ начисляются ❌

---

### Проверка 3: План подписки

```typescript
// plan_7 (пробный тариф) не дает билетов
if (planId === 'plan_7') {
    return false; // ❌
}

// Количество билетов:
plan_30  → 1 билет
plan_90  → 3 билета
plan_180 → 6 билетов
plan_365 → 12 билетов
```

**Если plan_7** → билеты НЕ начисляются ❌

---

### Проверка 4: Билеты уже начислены (идемпотентность)

```sql
SELECT id FROM ticket_ledger 
WHERE contest_id = ? 
  AND referrer_id = ? 
  AND referred_id = ? 
  AND order_id = ? 
  AND reason = 'SELF_PURCHASE'
```

**Если билеты уже начислены** → повторное начисление не происходит ✅ (идемпотентность)

---

### Начисление билетов (SELF_PURCHASE) - ВСЕГДА

```sql
INSERT INTO ticket_ledger (
    id, contest_id, referrer_id, referred_id, 
    order_id, delta, reason, created_at
) VALUES (
    'ticket_self_...', 
    contest_id, 
    userId,      -- referrer_id
    userId,      -- referred_id
    orderId, 
    ticketsDelta, -- 1, 3, 6 или 12
    'SELF_PURCHASE', 
    NOW()
)
```

✅ **ВСЕГДА выполняется** для покупателя

---

### Проверка 5: Реферер и его квалификация

```sql
-- Поиск реферера
SELECT referrer_id
FROM bot_db.user_referrals
WHERE referred_id = ?
LIMIT 1
```

**Если реферер найден:**
1. ❌ **Самореферал** → билеты рефереру НЕ начисляются
2. ✅ **Окно атрибуции**: `orderDate <= bindingDate + 7 дней`
3. ✅ **Квалификация**: нет оплат до привязки
   ```sql
   SELECT COUNT(*) 
   FROM bot_db.orders
   WHERE user_id = ? 
     AND status IN ('PAID', 'COMPLETED')
     AND created_at < bindingDate
   ```
   **Если COUNT > 0** → реферер НЕ квалифицирован ❌

---

### Начисление билетов (INVITEE_PAYMENT) - для реферера

**Если все проверки пройдены:**

```sql
INSERT INTO ticket_ledger (
    id, contest_id, referrer_id, referred_id, 
    order_id, delta, reason, created_at
) VALUES (
    'ticket_ref_...', 
    contest_id, 
    referrerId,    -- referrer_id
    referredId,    -- referred_id
    orderId, 
    ticketsDelta,  -- то же количество, что и у покупателя
    'INVITEE_PAYMENT', 
    NOW()
)

-- Обновление ref_events
UPDATE ref_events
SET status = 'qualified', qualified_at = NOW()
WHERE contest_id = ? AND referrer_id = ? AND referred_id = ?
```

✅ **Выполняется условно** для реферера

---

## Итоговая таблица: кто получает билеты

| Условие | Покупатель (SELF_PURCHASE) | Реферер (INVITEE_PAYMENT) |
|---------|---------------------------|---------------------------|
| **Базовое условие** | ✅ ВСЕГДА | ⚠️ Если есть реферер |
| Активный конкурс | ✅ Требуется | ✅ Требуется |
| Период конкурса | ✅ Требуется | ✅ Требуется |
| План != plan_7 | ✅ Требуется | ✅ Требуется |
| Окно атрибуции | - | ✅ Требуется (7 дней) |
| Квалификация (нет оплат до привязки) | - | ✅ Требуется |
| Не самореферал | - | ✅ Требуется |

---

## Логика начисления (правила бизнеса)

### Правило 1: Покупатель ВСЕГДА получает билеты
- Если заказ в периоде конкурса
- Если план != plan_7
- Начисляется: `SELF_PURCHASE` в `ticket_ledger`

### Правило 2: Реферер получает билеты УСЛОВНО
- Если есть активная реферальная связь
- Если заказ в периоде конкурса
- Если заказ в окне атрибуции (7 дней от привязки)
- Если покупатель НЕ делал оплаты до привязки (квалификация)
- Если это НЕ самореферал
- Начисляется: `INVITEE_PAYMENT` в `ticket_ledger`

---

## Функции и их расположение

### В БОТЕ:

1. **OrderProcessingService.processPayment()**
   - Файл: `src/services/orderProcessingService.ts`
   - Строка: 17
   - Назначение: Обработка платежа, установка статуса PAID

2. **OrderProcessingService.activateOrder()**
   - Файл: `src/services/orderProcessingService.ts`
   - Строка: 91
   - Назначение: Активация VPN и начисление билетов

3. **ContestService.awardSelfPurchaseTicket()**
   - Файл: `src/services/contestService.ts`
   - Назначение: Начисление билетов покупателю

4. **ContestService.awardTickets()**
   - Файл: `src/services/contestService.ts`
   - Назначение: Начисление билетов рефереру

5. **ContestService.checkQualification()**
   - Файл: `src/services/contestService.ts`
   - Назначение: Проверка квалификации реферала

### В API:

1. **awardTicketsForPayment()**
   - Файл: `src/storage/contestUtils.ts`
   - Строка: 121
   - Назначение: Универсальная функция начисления билетов (используется в API webhook)

2. **getTicketsFromPlanId()**
   - Файл: `src/storage/contestUtils.ts`
   - Назначение: Конвертация plan_id в количество билетов

---

## Схема базы данных

### Таблица `ticket_ledger`

```sql
CREATE TABLE ticket_ledger (
    id TEXT PRIMARY KEY,
    contest_id TEXT,
    referrer_id INTEGER,      -- Кто получает билет
    referred_id INTEGER,      -- Кто купил (для INVITEE_PAYMENT)
    order_id TEXT,            -- ID заказа
    delta INTEGER,            -- Количество билетов (+1, +3, +6, +12)
    reason TEXT,              -- 'SELF_PURCHASE' или 'INVITEE_PAYMENT'
    created_at TEXT           -- ISO timestamp
)
```

### Пример записи SELF_PURCHASE:
```json
{
  "id": "ticket_self_...",
  "contest_id": "550e8400-e29b-41d4-a716-446655440000",
  "referrer_id": 782245481,    // Покупатель
  "referred_id": 782245481,    // Покупатель
  "order_id": "ord_123...",
  "delta": 1,
  "reason": "SELF_PURCHASE",
  "created_at": "2026-01-18T02:14:01.057Z"
}
```

### Пример записи INVITEE_PAYMENT:
```json
{
  "id": "ticket_ref_...",
  "contest_id": "550e8400-e29b-41d4-a716-446655440000",
  "referrer_id": 123456789,    // Реферер (получает билет)
  "referred_id": 782245481,    // Покупатель
  "order_id": "ord_123...",
  "delta": 1,
  "reason": "INVITEE_PAYMENT",
  "created_at": "2026-01-18T02:14:01.057Z"
}
```

---

## Итоговая схема потока

```
ОПЛАТА
   │
   ├─► Путь 1: БОТ
   │       │
   │       ├─► processPayment() → activateOrder()
   │       │                           │
   │       │                           ├─► Если COMPLETED:
   │       │                           │       └─► awardSelfPurchaseTicket() → SELF_PURCHASE ✅
   │       │                           │
   │       │                           └─► Если PAID → COMPLETED:
   │       │                                       ├─► awardTickets() → INVITEE_PAYMENT ✅ (если реферер)
   │       │                                       └─► awardSelfPurchaseTicket() → SELF_PURCHASE ✅
   │       │
   │       └─► activateOrder() (прямой вызов)
   │               └─► (аналогично выше)
   │
   └─► Путь 2: API
           │
           └─► /v1/payments/webhook
                   │
                   └─► awardTicketsForPayment()
                           │
                           ├─► ВСЕГДА: SELF_PURCHASE ✅
                           └─► УСЛОВНО: INVITEE_PAYMENT ✅ (если реферер квалифицирован)
```

---

## Важные моменты

1. **Двойная защита:** Билеты начисляются как в боте, так и в API (если webhook приходит в API)

2. **Идемпотентность:** Если билеты уже начислены, повторное начисление не происходит

3. **ВСЕГДА начисляется:** Покупатель получает билеты за свою покупку (если выполнены базовые условия)

4. **УСЛОВНО начисляется:** Реферер получает билеты только если прошел все проверки квалификации

5. **Проблема в processPayment():** Если заказ уже COMPLETED, `processPayment()` не вызывает `activateOrder()`, но эта проблема не проявляется, так как заказы обрабатываются напрямую через `activateOrder()`
