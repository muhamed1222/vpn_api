import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as ordersRepo from '../../storage/ordersRepo.js';
import { isYooKassaIP } from '../../config/yookassa.js';
import { createVPNKey } from '../../integrations/marzban/client.js';

const yookassaWebhookSchema = z.object({
  type: z.literal('notification'),
  event: z.string(),
  object: z.object({
    id: z.string(),
    status: z.string(),
    paid: z.boolean(),
    amount: z.object({
      value: z.string(),
      currency: z.string(),
    }).optional(),
    metadata: z.record(z.string()).optional(),
  }),
});

export async function paymentsRoutes(fastify: FastifyInstance) {
  const webhookIPCheck: boolean = fastify.yookassaWebhookIPCheck;

  // POST /v1/payments/webhook
  fastify.post<{ Body: unknown }>(
    '/webhook',
    {
      schema: {
        body: {
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      // Проверка IP (если включена)
      if (webhookIPCheck) {
        // Fastify с trustProxy=true автоматически определяет real IP из X-Forwarded-For
        const clientIP = request.ip || '';
        if (!clientIP || !isYooKassaIP(clientIP)) {
          fastify.log.warn({ ip: clientIP, headers: request.headers }, 'Webhook request from unauthorized IP');
          return reply.status(403).send({ error: 'Forbidden' });
        }
      }

      // Валидация через zod
      const validationResult = yookassaWebhookSchema.safeParse(request.body);
      if (!validationResult.success) {
        fastify.log.warn({ body: request.body, errors: validationResult.error.errors }, 'Invalid webhook payload');
        return reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const { event, object } = validationResult.data;
      const paymentId = object.id;

      // Извлекаем orderId из metadata или ищем по payment_id
      let orderId: string | null = null;
      
      if (object.metadata?.orderId) {
        orderId = object.metadata.orderId;
      } else {
        // Фолбэк: ищем заказ по yookassa_payment_id
        const order = ordersRepo.getOrderByPaymentId(paymentId);
        if (order) {
          orderId = order.order_id;
        }
      }

      if (!orderId) {
        fastify.log.error(
          { paymentId, metadata: object.metadata },
          'Order not found for payment (alert-level)'
        );
        // Возвращаем 200, чтобы YooKassa не ретраила
        return reply.status(200).send({ ok: true });
      }

      // Находим заказ в БД
      const orderRow = ordersRepo.getOrder(orderId);
      if (!orderRow) {
        fastify.log.error(
          { orderId, paymentId },
          'Order not found in database (alert-level)'
        );
        // Возвращаем 200, чтобы YooKassa не ретраила
        return reply.status(200).send({ ok: true });
      }

      // Обработка payment.succeeded
      if (event === 'payment.succeeded' && object.status === 'succeeded' && object.paid === true) {
        // Идемпотентность: если уже paid и key есть, просто возвращаем 200
        if (orderRow.status === 'paid' && orderRow.key) {
          fastify.log.info({ orderId, paymentId }, 'Order already paid, skipping');
          return reply.status(200).send({ ok: true });
        }

        // Создаем VPN key через Marzban
        const keyResult = await createVPNKey({
          orderId,
          planId: orderRow.plan_id,
          userRef: orderRow.user_ref || undefined,
        });

        // Помечаем заказ как paid и сохраняем key (идемпотентная операция)
        ordersRepo.markPaidWithKey({
          orderId,
          key: keyResult.key,
        });

        fastify.log.info({ orderId, paymentId, key: keyResult.key }, 'Order marked as paid with key');
        return reply.status(200).send({ ok: true });
      }

      // Обработка payment.canceled
      if (event === 'payment.canceled') {
        // Помечаем как canceled только если еще не paid (идемпотентная операция)
        ordersRepo.markCanceled(orderId);
        fastify.log.info({ orderId, paymentId }, 'Order marked as canceled');
        return reply.status(200).send({ ok: true });
      }

      // Для других событий просто возвращаем 200
      fastify.log.info({ event, orderId, paymentId }, 'Webhook event processed');
      return reply.status(200).send({ ok: true });
    }
  );
}

