import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { v1Routes } from './v1/index.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Health check (без rate-limit)
  await fastify.register(healthRoutes);

  // API v1 (с rate-limit)
  await fastify.register(v1Routes, { prefix: '/v1' });
}

