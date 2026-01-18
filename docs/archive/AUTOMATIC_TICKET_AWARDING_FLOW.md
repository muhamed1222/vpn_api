# Как работает автоматическое начисление билетов

## Общий поток

```
ОПЛАТА ЗАКАЗА
     │
     ▼
Обработка платежа (processPayment / webhook)
     │
     ▼
Активация заказа (activateOrder)
     │
     ├─► Для новых заказов (PAID → COMPLETED)
     │       │
     │       ├─► Активация VPN в Marzban
     │       ├─► Установка статуса COMPLETED
     │       │
     │       ▼
     │   Начисление билетов
     │       ├─► Рефереру (если квалифицирован)
     │       └─► Покупателю (всегда)
     │
     └─► Для уже COMPLETED заказов
             │
             ▼
         Начисление билетов (без активации VPN)
             ├─► Рефереру (если квалифицирован)
             └─► Покупателю (всегда)
```

---

## ПУТЬ 1: Через бота (основной)

### Шаг 1: Обработка платежа

**Функция:** `OrderProcessingService.processPayment()`
**Файл:** `src/services/orderProcessingService.ts`, строка 17

```typescript
processPayment: async (
    orderId: string,
    telegramChargeId: string,
    providerChargeId: string
) => {
    // 1. Получаем заказ
    const order = await DB.getOrder(orderId);
    
    // 2. Проверка статуса
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.COMPLETED) {
        // Если COMPLETED, все равно вызываем activateOrder для проверки билетов
        if (order.status === OrderStatus.COMPLETED) {
            await OrderProcessingService.activateOrder(order); // ✅ ВЫЗОВ
        }
        return;
    }
    
    // 3. Устанавливаем статус PAID
    order.status = OrderStatus.PAID;
    await DB.updateOrder(order);
    
    // 4. Вызываем активацию
    await OrderProcessingService.activateOrder(order); // ✅ ВЫЗОВ
}
```

**Что делает:**
- Проверяет заказ
- Устанавливает статус `PAID`
- Вызывает `activateOrder()` для активации и начисления билетов

---

### Шаг 2: Активация заказа

**Функция:** `OrderProcessingService.activateOrder()`
**Файл:** `src/services/orderProcessingService.ts`, строка 91

#### 2.1. Для уже COMPLETED заказов (строка 108):

```typescript
const isAlreadyCompleted = orderInDb.status === OrderStatus.COMPLETED;
if (isAlreadyCompleted) {
    // Получаем пользователя
    const user = await DB.getUser(order.userId);
    
    // Получаем активный конкурс
    const activeContest = ContestService.getActiveContest();
    
    if (activeContest) {
        // 5a. Начисляем билеты рефереру (если есть)
        if (user && user.referral?.referredBy) {
            const qualification = await ContestService.checkQualification(...);
            if (qualification.qualified) {
                ContestService.awardTickets(...); // ✅ Рефереру
            }
        }
        
        // 5b. Начисляем билет покупателю
        ContestService.awardSelfPurchaseTicket(...); // ✅ Покупателю
    }
    
    return; // Не активируем VPN (уже активирован)
}
```

#### 2.2. Для новых заказов (PAID → COMPLETED) (строка 215):

```typescript
// 1. Активация VPN в Marzban
const marzbanResult = await MarzbanService.renewUser(order.userId, plan.durationDays);

// 2. Установка статуса COMPLETED
order.status = OrderStatus.COMPLETED;
await DB.updateOrder(order);

// 3. Получаем пользователя
const user = await DB.getUser(order.userId);

// 4. Обновление подписки
await DB.updateUserSubscription(order.userId, {
    isActive: true,
    expiresAt: marzbanResult.expiresAt,
    vlessKey: marzbanResult.vlessKey
});

// 5. Начисление билетов конкурса
const activeContest = ContestService.getActiveContest();

if (activeContest) {
    // 5a. Начисляем билеты рефереру (если есть)
    if (user && user.referral?.referredBy) {
        const qualification = await ContestService.checkQualification(...);
        if (qualification.qualified) {
            ContestService.awardTickets(...); // ✅ Рефереру
        }
    }
    
    // 5b. Начисляем билет покупателю
    ContestService.awardSelfPurchaseTicket(...); // ✅ Покупателю
}
```

**Что делает:**
- Активирует VPN (если заказ новый)
- Устанавливает статус `COMPLETED`
- Начисляет билеты через `ContestService`

---

### Шаг 3: Начисление билетов покупателю

**Функция:** `ContestService.awardSelfPurchaseTicket()`
**Файл:** `src/services/contestService.ts`

```typescript
awardSelfPurchaseTicket: (
    contestId: string,
    userId: number,
    orderId: string,
    planId: string,
    orderCreatedAt: number // в миллисекундах
): boolean => {
    // Конвертируем в секунды
    return ContestService.awardSelfTickets(
        contestId, 
        userId, 
        orderId, 
        planId, 
        Math.floor(orderCreatedAt / 1000)
    );
}
```

**Внутренняя функция:** `ContestService.awardSelfTickets()`:

```typescript
awardSelfTickets: (
    contestId: string,
    userId: number,
    orderId: string,
    planId: string,
    orderCreatedAt?: number // в секундах
): boolean => {
    const database = getDb();
    
    // 1. Проверка: билеты уже начислены?
    const existing = database.prepare(`
        SELECT id FROM ticket_ledger 
        WHERE contest_id = ? AND referrer_id = ? AND referred_id = ? 
          AND order_id = ? AND reason = 'SELF_PURCHASE'
    `).get(contestId, userId, userId, orderId);
    
    if (existing) {
        return false; // ✅ Уже начислены (идемпотентность)
    }
    
    // 2. Проверка: активный конкурс
    const contest = ContestService.getActiveContest();
    if (!contest || contest.id !== contestId) {
        return false; // ❌ Конкурс не активен
    }
    
    // 3. Проверка: период конкурса
    if (orderCreatedAt !== undefined) {
        const contestStartsAt = Math.floor(new Date(contest.starts_at).getTime() / 1000);
        const contestEndsAt = Math.floor(new Date(contest.ends_at).getTime() / 1000);
        
        if (orderCreatedAt < contestStartsAt || orderCreatedAt > contestEndsAt) {
            return false; // ❌ Заказ вне периода конкурса
        }
    }
    
    // 4. Определение количества билетов из plan_id
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return false;
    
    if (planId === 'plan_7') {
        return false; // ❌ Пробный тариф не дает билетов
    }
    
    const months = Math.floor(plan.durationDays / 30);
    const tickets = months > 0 ? months : 1; // Минимум 1 билет
    
    // 5. ВСТАВКА В БАЗУ
    const ledgerId = uuidv4();
    const createdAt = new Date().toISOString();
    
    database.prepare(`
        INSERT INTO ticket_ledger (
            id, contest_id, referrer_id, referred_id,
            order_id, delta, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'SELF_PURCHASE', ?)
    `).run(
        ledgerId,      // id
        contestId,     // contest_id
        userId,        // referrer_id (покупатель)
        userId,        // referred_id (покупатель)
        orderId,       // order_id
        tickets,       // delta (1, 3, 6 или 12)
        createdAt      // created_at
    );
    
    console.log(`✅ Awarded ${tickets} tickets to user ${userId} (self-purchase)`);
    return true; // ✅ Билеты начислены
}
```

**Что делает:**
- Проверяет, что билеты еще не начислены
- Проверяет активный конкурс и период
- Определяет количество билетов по `plan_id`
- Вставляет запись в `ticket_ledger` через SQL

---

### Шаг 4: Начисление билетов рефереру

**Функция:** `ContestService.awardTickets()`
**Файл:** `src/services/contestService.ts`

```typescript
awardTickets: async (
    contestId: string,
    referrerId: number,
    referredId: number,
    orderId: string,
    planId: string,
    orderCreatedAt: number
) => {
    // Проверка квалификации (уже выполнена выше)
    // ...
    
    // Определение количества билетов
    const plan = PLANS.find(p => p.id === planId);
    const months = Math.floor(plan.durationDays / 30);
    const tickets = months > 0 ? months : 1;
    
    // ВСТАВКА В БАЗУ
    const ledgerId = uuidv4();
    const createdAt = new Date().toISOString();
    
    database.prepare(`
        INSERT INTO ticket_ledger (
            id, contest_id, referrer_id, referred_id,
            order_id, delta, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'INVITEE_PAYMENT', ?)
    `).run(
        ledgerId,      // id
        contestId,     // contest_id
        referrerId,    // referrer_id (реферер - получает билеты)
        referredId,    // referred_id (покупатель)
        orderId,       // order_id
        tickets,       // delta (1, 3, 6 или 12)
        createdAt      // created_at
    );
    
    console.log(`✅ Awarded ${tickets} tickets to referrer ${referrerId}`);
}
```

**Что делает:**
- Начисляет билеты рефереру
- Вставляет запись в `ticket_ledger` с `reason = 'INVITEE_PAYMENT'`

---

## ПУТЬ 2: Через API webhook

### Шаг 1: Webhook от YooKassa

**Файл:** `src/routes/v1/payments.ts`, строка 158

```typescript
// После успешной оплаты и активации VPN
const ticketsAwarded = await awardTicketsForPayment(
    botDbPath,
    tgId,
    orderId,
    planId,
    orderCreatedAt
);
```

### Шаг 2: Универсальная функция начисления

**Функция:** `awardTicketsForPayment()`
**Файл:** `src/storage/contestUtils.ts`, строка 121

```typescript
export async function awardTicketsForPayment(
  botDbPath: string,
  referredTgId: number,    // Кто купил
  orderId: string,
  planId: string,
  orderCreatedAt: string
): Promise<boolean> {
  const db = getDatabase();
  
  // 1. Прикрепляем базу бота
  db.prepare('ATTACH DATABASE ? AS bot_db').run(botDbPath);
  
  // 2. Получаем активный конкурс
  const contest = db.prepare(`
    SELECT id, starts_at, ends_at, attribution_window_days
    FROM bot_db.contests
    WHERE is_active = 1
    ORDER BY starts_at DESC
    LIMIT 1
  `).get();
  
  if (!contest) {
    return false; // ❌ Нет активного конкурса
  }
  
  // 3. Проверка периода конкурса
  const orderDate = new Date(orderCreatedAt);
  const contestStart = new Date(contest.starts_at);
  const contestEnd = new Date(contest.ends_at);
  
  if (orderDate < contestStart || orderDate > contestEnd) {
    return false; // ❌ Заказ вне периода
  }
  
  // 4. Поиск реферера и проверка квалификации
  const referral = db.prepare(`
    SELECT referrer_id
    FROM bot_db.user_referrals
    WHERE referred_id = ?
  `).get(referredTgId);
  
  let referrerId: number | null = null;
  
  if (referral) {
    referrerId = referral.referrer_id;
    
    // Проверки квалификации:
    // - Не самореферал
    // - Окно атрибуции (7 дней)
    // - Нет оплат до привязки
    // ...
  }
  
  // 5. Определение количества билетов
  const ticketsDelta = getTicketsFromPlanId(planId);
  // plan_30 → 1, plan_90 → 3, plan_180 → 6, plan_365 → 12
  
  // 6. ВСЕГДА: Начисляем билеты покупателю
  db.prepare(`
    INSERT INTO bot_db.ticket_ledger (
      id, contest_id, referrer_id, referred_id, order_id, delta, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'SELF_PURCHASE', ?)
  `).run(
    `ticket_self_${Date.now()}_${Math.random()}`,
    contest.id,
    referredTgId,    // referrer_id = покупатель
    referredTgId,    // referred_id = покупатель
    orderId,
    ticketsDelta,
    new Date().toISOString()
  );
  
  // 7. УСЛОВНО: Начисляем билеты рефереру (если прошел все проверки)
  if (referrerId !== null) {
    db.prepare(`
      INSERT INTO bot_db.ticket_ledger (
        id, contest_id, referrer_id, referred_id, order_id, delta, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'INVITEE_PAYMENT', ?)
    `).run(
      `ticket_ref_${Date.now()}_${Math.random()}`,
      contest.id,
      referrerId,      // referrer_id = реферер
      referredTgId,    // referred_id = покупатель
      orderId,
      ticketsDelta,
      new Date().toISOString()
    );
  }
  
  return true;
}
```

**Что делает:**
- Прикрепляет базу бота к API базе
- Проверяет активный конкурс и период
- Проверяет квалификацию реферера
- Вставляет 1-2 записи в `ticket_ledger` (покупателю всегда, рефереру условно)

---

## Сравнение: Ручной vs Автоматический способ

| Аспект | Ручной (SQL) | Автоматический (Код) |
|--------|--------------|---------------------|
| **Где выполняется** | Прямо в базе данных | В коде бота/API |
| **Проверки** | Только дубликаты | Все проверки (конкурс, период, квалификация) |
| **Когда вызывается** | Вручную через SQL | Автоматически при обработке заказа |
| **Реферер** | Только покупатель | И покупатель, и реферер (если квалифицирован) |
| **SQL запрос** | Прямой INSERT | Через функции TypeScript → SQL |
| **Логирование** | Нет | Да (console.log) |
| **Обработка ошибок** | Нет | Да (try-catch) |

---

## Детальная схема автоматического начисления

### Для покупателя (SELF_PURCHASE):

```
1. processPayment() / webhook
   │
   ▼
2. activateOrder()
   │
   ▼
3. ContestService.awardSelfPurchaseTicket()
   │
   ├─► Проверка: билеты не начислены
   ├─► Проверка: активный конкурс
   ├─► Проверка: период конкурса
   ├─► Проверка: plan_id != 'plan_7'
   │
   ▼
4. SQL INSERT в ticket_ledger
   │
   ├─► id: 'ticket_self_...'
   ├─► contest_id: ID активного конкурса
   ├─► referrer_id: userId (покупатель)
   ├─► referred_id: userId (покупатель)
   ├─► order_id: ID заказа
   ├─► delta: 1/3/6/12 (зависит от plan_id)
   ├─► reason: 'SELF_PURCHASE'
   └─► created_at: текущее время
```

### Для реферера (INVITEE_PAYMENT):

```
1. activateOrder() / awardTicketsForPayment()
   │
   ▼
2. Проверка: есть ли реферер?
   │
   ├─► Нет → пропускаем
   └─► Да → продолжаем
       │
       ▼
3. ContestService.checkQualification()
   │
   ├─► Проверка: не самореферал
   ├─► Проверка: окно атрибуции (7 дней)
   ├─► Проверка: нет оплат до привязки
   │
   ├─► Не квалифицирован → пропускаем
   └─► Квалифицирован → продолжаем
       │
       ▼
4. ContestService.awardTickets()
   │
   ▼
5. SQL INSERT в ticket_ledger
   │
   ├─► id: 'ticket_ref_...'
   ├─► contest_id: ID активного конкурса
   ├─► referrer_id: referrerId (реферер - получает билеты)
   ├─► referred_id: userId (покупатель)
   ├─► order_id: ID заказа
   ├─► delta: 1/3/6/12 (то же, что у покупателя)
   ├─► reason: 'INVITEE_PAYMENT'
   └─► created_at: текущее время
```

---

## Итоговая таблица: кто вызывает что

| Сценарий | Функция | Начисляет |
|----------|---------|-----------|
| **Новый заказ через бота** | `processPayment()` → `activateOrder()` → `awardSelfPurchaseTicket()` + `awardTickets()` | Покупателю + Рефереру |
| **COMPLETED заказ через бота** | `processPayment()` → `activateOrder()` → `awardSelfPurchaseTicket()` + `awardTickets()` | Покупателю + Рефереру |
| **Webhook от YooKassa** | `awardTicketsForPayment()` | Покупателю + Рефереру |
| **Прямой вызов activateOrder()** | `activateOrder()` → `awardSelfPurchaseTicket()` + `awardTickets()` | Покупателю + Рефереру |

---

## Ключевые функции

1. **`processPayment()`** - Обрабатывает платеж, вызывает `activateOrder()`
2. **`activateOrder()`** - Активирует VPN и начисляет билеты
3. **`awardSelfPurchaseTicket()`** - Начисляет билеты покупателю
4. **`awardTickets()`** - Начисляет билеты рефереру
5. **`awardTicketsForPayment()`** - Универсальная функция (используется в API)
6. **`checkQualification()`** - Проверяет квалификацию реферала

**Все они в итоге выполняют SQL INSERT в таблицу `ticket_ledger`!**
