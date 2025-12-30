import { FastifyInstance } from 'fastify';
import { rootRoutes } from './root.js';
import { healthRoutes } from './health.js';
import { v1Routes } from './v1/index.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Корневой роут (без rate-limit)
  await fastify.register(rootRoutes);

  // Health check (без rate-limit)
  await fastify.register(healthRoutes);

  // API v1 (с rate-limit)
  await fastify.register(v1Routes, { prefix: '/v1' });
}

