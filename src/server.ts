import Fastify from 'fastify';
import dotenv from 'dotenv';
import cors from '@fastify/cors';
import { registerRoutes } from './routes/index.js';
import { MemoryOrderStore } from './store/memory-order-store.js';
import { OrderStore } from './store/order-store.js';

// Загружаем переменные окружения
dotenv.config();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [];

const fastify = Fastify({
  logger: true,
});

// Расширяем типы Fastify для orderStore
declare module 'fastify' {
  interface FastifyInstance {
    orderStore: OrderStore;
  }
}

// Инициализируем хранилище заказов
const orderStore = new MemoryOrderStore();
fastify.decorate('orderStore', orderStore);


// Обработка ошибок
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500,
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, closing server...`);
  
  try {
    await fastify.close();
    fastify.log.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    fastify.log.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
};

// Обработка сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Запуск сервера
const start = async () => {
  try {
    // Настройка CORS
    if (ALLOWED_ORIGINS.length > 0) {
      await fastify.register(cors, {
        origin: (origin, callback) => {
          if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'), false);
          }
        },
      });
    }

    // Регистрируем роуты (rate-limit настроен внутри v1Routes)
    await registerRoutes(fastify);

    // Выводим список зарегистрированных маршрутов для отладки
    console.log('Registered routes:');
    console.log(fastify.printRoutes());

    await fastify.listen({ host: HOST, port: PORT });
    fastify.log.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

start();

