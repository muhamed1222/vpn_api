import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrderStore } from '../../store/order-store.js';
import { WebhookEvent } from '../../types/order.js';

const webhookSchema = z.object({
  event: z.string(),
  orderId: z.string().optional(),
});

export async function paymentsRoutes(fastify: FastifyInstance) {
  const orderStore: OrderStore = fastify.orderStore;

  // POST /v1/payments/webhook
  fastify.post<{ Body: WebhookEvent }>(
    '/webhook',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            event: { type: 'string' },
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Валидация через zod
      const validationResult = webhookSchema.safeParse(request.body);
      if (!validationResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const { event, orderId } = validationResult.data;

      // Обрабатываем только событие payment.succeeded
      if (event === 'payment.succeeded' && orderId) {
        const order = await orderStore.findById(orderId);
        if (!order) {
          return reply.status(404).send({
            ok: false,
            error: 'Order not found',
          });
        }

        // Заказ найден - меняем статус на paid и записываем key
        await orderStore.update(orderId, {
          status: 'paid',
          key: 'DUMMY_KEY',
        });
        fastify.log.info(`Order ${orderId} marked as paid`);
      }

      return reply.status(200).send({ ok: true });
    }
  );
}

