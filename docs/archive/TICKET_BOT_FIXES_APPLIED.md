# Примененные исправления для начисления билетов в боте

## Исправление #1: processPayment() теперь вызывает activateOrder() для COMPLETED заказов

### Файл: `src/services/orderProcessingService.ts`
### Строки: 61-67

**Было:**
```typescript
// 2. Идемпотентность: Проверка статуса
if (order.status === OrderStatus.PAID || order.status === OrderStatus.COMPLETED) {
    console.log(`ℹ️ Order ${order.id} already processed (Status: ${order.status}). Skipping.`);
    return;
}
```

**Стало:**
```typescript
// 2. Идемпотентность: Проверка статуса
if (order.status === OrderStatus.PAID || order.status === OrderStatus.COMPLETED) {
    console.log(`ℹ️ Order ${order.id} already processed (Status: ${order.status}). Skipping.`);
    // Если COMPLETED, все равно вызываем activateOrder для проверки и начисления билетов
    if (order.status === OrderStatus.COMPLETED) {
        await OrderProcessingService.activateOrder(order);
    }
    return;
}
```

**Результат:** Теперь если `processPayment()` вызывается для COMPLETED заказа, он все равно вызовет `activateOrder()`, который проверит и начислит билеты.

---

## Исправление #2: Добавлено начисление билетов рефереру для COMPLETED заказов

### Файл: `src/services/orderProcessingService.ts`
### Строки: ~125-165 (в блоке isAlreadyCompleted)

**Было:**
```typescript
if (activeContest) {
    // Только начисление покупателю
    ContestService.awardSelfPurchaseTicket(...);
}
```

**Стало:**
```typescript
if (activeContest) {
    // 5a. Начисляем билеты рефереру (если есть реферер)
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

**Результат:** Теперь для COMPLETED заказов билеты начисляются и покупателю, и рефереру (если он квалифицирован), так же как и для новых заказов.

---

## Итоги

✅ **Проблема #1 исправлена:** `processPayment()` теперь вызывает `activateOrder()` для COMPLETED заказов

✅ **Проблема #2 исправлена:** Добавлено начисление билетов рефереру для COMPLETED заказов

**Статус:** Обе проблемы исправлены, код готов к тестированию и деплою
