import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ordersRoutes } from './orders.js';
import { paymentsRoutes } from './payments.js';

export async function v1Routes(fastify: FastifyInstance) {
  // Rate limiting для всех роутов v1
  await fastify.register(rateLimit, {
    max: 100, // максимум 100 запросов
    timeWindow: '1 minute', // за 1 минуту
  });

  // Регистрируем роуты для заказов
  await fastify.register(ordersRoutes, { prefix: '/orders' });

  // Регистрируем роуты для платежей
  await fastify.register(paymentsRoutes, { prefix: '/payments' });
}

