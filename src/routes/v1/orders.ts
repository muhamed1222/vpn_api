import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrderStore } from '../../store/order-store.js';
import { CreateOrderRequest, CreateOrderResponse, GetOrderResponse } from '../../types/order.js';
import { v4 as uuidv4 } from 'uuid';

const createOrderSchema = z.object({
  planId: z.string().min(1),
  userRef: z.string().optional(),
});

export async function ordersRoutes(fastify: FastifyInstance) {
  const orderStore: OrderStore = fastify.orderStore;

  // POST /v1/orders/create
  fastify.post<{ Body: CreateOrderRequest }>(
    '/create',
    {
      schema: {
        body: {
          type: 'object',
          required: ['planId'],
          properties: {
            planId: { type: 'string' },
            userRef: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Валидация через zod
      const validationResult = createOrderSchema.safeParse(request.body);
      if (!validationResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const { planId, userRef } = validationResult.data;
      const orderId = uuidv4();

      await orderStore.create({
        orderId,
        planId,
        userRef,
        status: 'pending',
        createdAt: new Date(),
      });

      const response: CreateOrderResponse = {
        orderId,
        status: 'pending',
        paymentUrl: `https://example.com/pay/${orderId}`,
      };

      return reply.status(201).send(response);
    }
  );

  // GET /v1/orders/:orderId
  fastify.get<{ Params: { orderId: string } }>(
    '/:orderId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { orderId } = request.params;

      const order = await orderStore.findById(orderId);
      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
        });
      }

      const response: GetOrderResponse = {
        orderId: order.orderId,
        status: order.status,
        ...(order.status === 'paid' && order.key ? { key: order.key } : {}),
      };

      return reply.send(response);
    }
  );
}

