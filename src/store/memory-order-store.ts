import { Order } from '../types/order.js';
import { OrderStore } from './order-store.js';

export class MemoryOrderStore implements OrderStore {
  private orders: Map<string, Order> = new Map();

  async create(order: Order): Promise<void> {
    this.orders.set(order.orderId, order);
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  async update(orderId: string, updates: Partial<Order>): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }
    this.orders.set(orderId, { ...order, ...updates });
    return true;
  }
}

