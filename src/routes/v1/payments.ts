import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import axios from 'axios';
import * as ordersRepo from '../../storage/ordersRepo.js';

const yookassaWebhookSchema = z.object({
  type: z.literal('notification'),
  event: z.string(),
  object: z.object({
    id: z.string(),
    status: z.string(),
    paid: z.boolean(),
    metadata: z.object({ orderId: z.string() }).optional(),
  }),
});

export async function paymentsRoutes(fastify: FastifyInstance) {
  const marzbanService = fastify.marzbanService;
  const botToken = fastify.telegramBotToken;

  fastify.post<{ Body: unknown }>(
    '/webhook',
    async (request, reply) => {
      const validationResult = yookassaWebhookSchema.safeParse(request.body);
      if (!validationResult.success) {
        return reply.status(200).send({ ok: true });
      }

      const { event, object } = validationResult.data;
      if (event !== 'payment.succeeded' || object.status !== 'succeeded') {
        return reply.status(200).send({ ok: true });
      }

      const orderId = object.metadata?.orderId;
      if (!orderId) return reply.status(200).send({ ok: true });

      const orderRow = ordersRepo.getOrder(orderId);
      if (!orderRow || orderRow.status === 'paid') {
        return reply.status(200).send({ ok: true });
      }

      const tgIdStr = orderRow.user_ref?.replace('tg_', '');
      const tgId = tgIdStr ? parseInt(tgIdStr, 10) : null;

      if (tgId && !isNaN(tgId)) {
        try {
          const planId = orderRow.plan_id;
          let days = 30;
          if (planId === 'plan_7') days = 7;
          else if (planId === 'plan_30') days = 30;
          else if (planId === 'plan_90') days = 90;
          else if (planId === 'plan_180') days = 180;
          else if (planId === 'plan_365') days = 365;

          // ВЫЗЫВАЕМ НОВУЮ УНИВЕРСАЛЬНУЮ ФУНКЦИЮ
          // Она создаст юзера, если его нет, или продлит существующего
          const vlessKey = await marzbanService.activateUser(tgId, days);

          // Обновляем статус заказа и сохраняем ключ
          ordersRepo.markPaidWithKey({ 
            orderId, 
            key: vlessKey 
          });

          // Отправляем уведомление пользователю
          if (botToken) {
            const expireDate = new Date(Date.now() + (days * 86400 * 1000)).toLocaleDateString('ru-RU');
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: tgId,
              text: `✅ <b>Оплата получена! Ваша подписка активирована.</b>\n\n` +
                    `🟢 Статус: <b>Активна</b>\n` +
                    `🕓 Действует до: <b>${expireDate}</b>\n\n` +
                    `🔗 <b>Ваш ключ:</b>\n<code>${vlessKey}</code>\n\n` +
                    `Используйте кнопки в боте для управления подключением.`,
              parse_mode: 'HTML'
            }).catch(err => {
              fastify.log.error({ err: err.message, tgId }, 'Failed to send TG success message');
            });
          }

          fastify.log.info({ orderId, tgId }, '[Webhook] Successfully activated user and sent notification');

        } catch (e: any) {
          fastify.log.error({ err: e.message, tgId, orderId }, '[Webhook] CRITICAL ACTIVATION ERROR');
          
          // Уведомляем админа о сбое
          if (botToken) {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: 7972426786,
              text: `🚨 <b>ОШИБКА СОЗДАНИЯ КЛЮЧА</b>\nЮзер: ${tgId}\nОшибка: ${e.message}\n\nСрочно проверьте панель Marzban!`
            }).catch(() => {});
          }
        }
      }

      return reply.status(200).send({ ok: true });
    }
  );
}
