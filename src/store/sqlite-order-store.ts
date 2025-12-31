import { Order } from '../types/order.js';
import { OrderStore } from './order-store.js';
import * as ordersRepo from '../storage/ordersRepo.js';

export class SqliteOrderStore implements OrderStore {
  async create(order: Order): Promise<void> {
    ordersRepo.createOrder({
      orderId: order.orderId,
      planId: order.planId,
      userRef: order.userRef,
    });
  }

  async findById(orderId: string): Promise<Order | null> {
    const row = ordersRepo.getOrder(orderId);
    if (!row) {
      return null;
    }

    return {
      orderId: row.order_id,
      planId: row.plan_id,
      userRef: row.user_ref || undefined,
      status: row.status === 'paid' ? 'paid' : 'pending',
      key: row.key || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  async update(orderId: string, updates: Partial<Order>): Promise<boolean> {
    if (updates.status === 'paid' && updates.key) {
      return ordersRepo.markPaidWithKey({
        orderId,
        key: updates.key,
      });
    }

    // Для других обновлений можно добавить дополнительные методы
    // Пока возвращаем false для неизвестных обновлений
    return false;
  }
}

