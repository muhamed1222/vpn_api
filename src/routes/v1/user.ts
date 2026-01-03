import { FastifyInstance } from 'fastify';
import { createVerifyAuth } from '../../auth/verifyAuth.js';

export async function userRoutes(fastify: FastifyInstance) {
  const jwtSecret: string = fastify.authJwtSecret;
  const cookieName: string = fastify.authCookieName;
  const marzbanService = fastify.marzbanService;

  const verifyAuth = createVerifyAuth({
    jwtSecret,
    cookieName,
  });

  /**
   * GET /v1/user/config
   * Берет "замороженную" ссылку из последнего оплаченного заказа.
   * Это предотвращает прыгание ссылок из-за особенностей Marzban.
   */
  fastify.get('/config', { preHandler: verifyAuth }, async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Unauthorized' });
    
    const { getLastKeyForUser } = await import('../../storage/ordersRepo.js');
    const userRef = `tg_${request.user.tgId}`;
    
    // 1. Сначала пробуем взять из нашей базы (это стабильно)
    let config = getLastKeyForUser(userRef);
    
    // 2. Если в базе нет (например, старый юзер или сбой), тянем из Marzban и сохраняем
    if (!config) {
      config = await marzbanService.getUserConfig(request.user.tgId);
    }
    
    if (!config) {
      return reply.status(404).send({ 
        error: 'Not Found', 
        message: 'У вас еще нет активной подписки.' 
      });
    }
    
    return reply.send({ ok: true, config });
  });

  /**
   * GET /v1/user/status
   */
  fastify.get('/status', { preHandler: verifyAuth }, async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Unauthorized' });
    const status = await marzbanService.getUserStatus(request.user.tgId);
    return reply.send({
      ok: true,
      status: status ? status.status : 'not_found',
      expiresAt: status ? status.expire : null,
      usedTraffic: (status && typeof status.used_traffic === 'number') ? status.used_traffic : 0,
      dataLimit: (status && typeof status.data_limit === 'number') ? status.data_limit : 0,
    });
  });

  /**
   * POST /v1/user/regenerate
   */
  fastify.post('/regenerate', { preHandler: verifyAuth }, async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Unauthorized' });
    
    // 1. Генерируем новый в Marzban
    const config = await marzbanService.regenerateUser(request.user.tgId);
    
    // 2. "Замораживаем" новый ключ в последнем заказе, чтобы он не прыгал
    if (config) {
      const { getOrdersByUser, markPaidWithKey } = await import('../../storage/ordersRepo.js');
      const userRef = `tg_${request.user.tgId}`;
      const orders = getOrdersByUser(userRef);
      const lastPaidOrder = orders.find(o => o.status === 'paid');
      
      if (lastPaidOrder) {
        markPaidWithKey({ orderId: lastPaidOrder.order_id, key: config });
      }
    }
    
    return reply.send({ ok: true, config });
  });

  /**
   * POST /v1/user/renew (Для админки бота и акций)
   */
  fastify.post<{ Body: { tgId: number; days: number } }>('/renew', { preHandler: verifyAuth }, async (request, reply) => {
    // В будущем тут должна быть проверка на права админа
    const { tgId, days } = request.body;
    const success = await marzbanService.renewUser(tgId, days);
    return reply.send({ ok: success });
  });
}
