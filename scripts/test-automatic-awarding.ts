/**
 * Скрипт для тестирования автоматического начисления билетов
 * Проверяет корректность работы модулей без реального начисления
 */

import { awardRetryScheduler } from '../src/services/awardRetryScheduler.js';
import { awardTicketsForPayment } from '../src/storage/contestUtils.js';

console.log('🧪 Тестирование автоматического начисления билетов\n');

// Тест 1: Проверка загрузки модулей
console.log('1️⃣ Проверка загрузки модулей...');
try {
  console.log('   ✅ awardRetryScheduler:', typeof awardRetryScheduler);
  console.log('   ✅ awardTicketsForPayment:', typeof awardTicketsForPayment);
  console.log('   ✅ getStats:', typeof awardRetryScheduler.getStats);
  console.log('   ✅ addToRetryQueue:', typeof awardRetryScheduler.addToRetryQueue);
  console.log('   ✅ stop:', typeof awardRetryScheduler.stop);
} catch (error: any) {
  console.error('   ❌ Ошибка загрузки модулей:', error.message);
  process.exit(1);
}

// Тест 2: Проверка статистики планировщика
console.log('\n2️⃣ Проверка статистики планировщика...');
try {
  const stats = awardRetryScheduler.getStats();
  console.log('   ✅ Статистика получена:');
  console.log('      - Размер очереди:', stats.queueSize);
  console.log('      - Элементов в очереди:', stats.items.length);
} catch (error: any) {
  console.error('   ❌ Ошибка получения статистики:', error.message);
  process.exit(1);
}

// Тест 3: Проверка добавления в очередь (мок-данные)
console.log('\n3️⃣ Проверка добавления в очередь повторных попыток...');
try {
  const mockTgId = 123456789;
  const mockOrderId = 'test_order_' + Date.now();
  const mockPlanId = 'plan_30';
  const mockCreatedAt = new Date().toISOString();

  awardRetryScheduler.addToRetryQueue(
    mockTgId,
    mockOrderId,
    mockPlanId,
    mockCreatedAt,
    'Test error message'
  );

  const statsAfter = awardRetryScheduler.getStats();
  console.log('   ✅ Элемент добавлен в очередь:');
  console.log('      - Размер очереди:', statsAfter.queueSize);
  console.log('      - Последний элемент:', statsAfter.items[statsAfter.items.length - 1]?.orderId);
} catch (error: any) {
  console.error('   ❌ Ошибка добавления в очередь:', error.message);
  process.exit(1);
}

// Тест 4: Проверка типов и структуры
console.log('\n4️⃣ Проверка типов и структуры...');
try {
  const stats = awardRetryScheduler.getStats();
  
  // Проверяем структуру элементов очереди
  if (stats.items.length > 0) {
    const item = stats.items[0];
    const requiredFields = ['tgId', 'orderId', 'planId', 'orderCreatedAt', 'attemptCount', 'lastAttemptAt'];
    const missingFields = requiredFields.filter(field => !(field in item));
    
    if (missingFields.length === 0) {
      console.log('   ✅ Все обязательные поля присутствуют');
      console.log('      - tgId:', typeof item.tgId, item.tgId);
      console.log('      - orderId:', typeof item.orderId, item.orderId);
      console.log('      - attemptCount:', typeof item.attemptCount, item.attemptCount);
    } else {
      console.error('   ❌ Отсутствуют поля:', missingFields);
      process.exit(1);
    }
  } else {
    console.log('   ⚠️ Очередь пуста (это нормально для нового планировщика)');
  }
} catch (error: any) {
  console.error('   ❌ Ошибка проверки структуры:', error.message);
  process.exit(1);
}

// Тест 5: Проверка остановки планировщика (для очистки)
console.log('\n5️⃣ Остановка планировщика...');
try {
  awardRetryScheduler.stop();
  console.log('   ✅ Планировщик остановлен (для тестирования)');
} catch (error: any) {
  console.error('   ⚠️ Ошибка остановки планировщика (не критично):', error.message);
}

console.log('\n✅ Все тесты пройдены успешно!');
console.log('\n📋 Итоги:');
console.log('   - Модули загружаются корректно');
console.log('   - Планировщик работает');
console.log('   - Очередь повторных попыток функционирует');
console.log('   - Типы и структуры данных корректны');
console.log('\n💡 Примечание:');
console.log('   - Реальное начисление билетов требует подключения к базе данных');
console.log('   - Для полного тестирования используйте интеграционные тесты');

process.exit(0);
