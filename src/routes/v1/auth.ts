import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyTelegramInitData } from '../../auth/telegram.js';
import { createToken } from '../../auth/jwt.js';

const telegramAuthSchema = z.object({
  initData: z.string().min(1),
});

export async function authRoutes(fastify: FastifyInstance) {
  const botToken: string = fastify.telegramBotToken;
  const jwtSecret: string = fastify.authJwtSecret;
  const cookieName: string = fastify.authCookieName;
  const cookieDomain: string = fastify.authCookieDomain || '.outlivion.space';

  // POST /v1/auth/telegram
  fastify.post<{ Body: { initData: string } }>(
    '/telegram',
    {
      schema: {
        body: {
          type: 'object',
          required: ['initData'],
          properties: {
            initData: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      fastify.log.info('[auth/telegram] Received auth request');
      
      // Валидация через zod
      const validationResult = telegramAuthSchema.safeParse(request.body);
      if (!validationResult.success) {
        fastify.log.warn({ errors: validationResult.error.errors }, '[auth/telegram] Validation failed');
        return reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const { initData } = validationResult.data;
      fastify.log.debug({ initDataLength: initData.length }, '[auth/telegram] Received initData');

      // Проверяем initData
      const verifyResult = verifyTelegramInitData({
        initData,
        botToken: botToken || 'MISSING_TOKEN',
        maxAgeSeconds: 86400, // 24 часа
      });

      if (!verifyResult.valid || !verifyResult.user) {
        fastify.log.warn(
          { error: verifyResult.error, botTokenExists: !!botToken },
          'Telegram initData verification failed'
        );
        return reply.status(401).send({
          error: 'Unauthorized',
          message: verifyResult.error || 'Invalid initData',
        });
      }

      fastify.log.info({ userId: verifyResult.user.id }, '[auth/telegram] Verification successful');

      const user = verifyResult.user;

      // Создаем JWT токен
      const token = createToken({
        tgId: user.id,
        username: user.username,
        firstName: user.first_name,
        secret: jwtSecret,
        expiresInDays: 7,
      });

      // Устанавливаем cookie
      reply.setCookie(cookieName, token, {
        httpOnly: true,
        secure: true, // Только HTTPS
        sameSite: 'lax',
        path: '/',
        domain: cookieDomain,
        maxAge: 60 * 60 * 24 * 7, // 7 дней в секундах
      });

      // Возвращаем ответ
      return reply.send({
        ok: true,
        user: {
          tgId: user.id,
          username: user.username,
          firstName: user.first_name,
        },
      });
    }
  );
}


