import { Order } from '../types/order.js';

export interface OrderStore {
  create(order: Order): Promise<void>;
  findById(orderId: string): Promise<Order | null>;
  update(orderId: string, updates: Partial<Order>): Promise<boolean>;
}

