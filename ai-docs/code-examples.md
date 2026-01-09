# Примеры кода

## Работа с базой данных

### Инициализация базы данных

```typescript
import { initDatabase, getDatabase } from './storage/db.js';

// Инициализация при старте приложения
const db = initDatabase('./data/db.sqlite');

// Получение экземпляра в репозиториях
const db = getDatabase();
```

### Репозиторий - создание записи

```typescript
export function createOrder(params: {
  orderId: string;
  planId: string;
  userRef?: string;
}): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders (order_id, user_ref, plan_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(params.orderId, params.userRef || '', params.planId, now, now);
}
```

### Репозиторий - получение записи

```typescript
export function getOrder(orderId: string): OrderRow | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM orders WHERE order_id = ?')
    .get(orderId) as OrderRow | undefined;
  return row || null;
}
```

### Репозиторий - обновление записи

```typescript
export function markPaidWithKey(params: {
  orderId: string;
  key: string;
}): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Идемпотентная проверка
  const order = getOrder(params.orderId);
  if (order?.status === 'paid' && order.key) {
    return true;
  }

  const result = db.prepare(`
    UPDATE orders SET status = 'paid', key = ?, updated_at = ?
    WHERE order_id = ?
  `).run(params.key, now, params.orderId);
  
  return result.changes > 0;
}
```

## Сервисы

### Сервис с кэшированием

```typescript
async getUserConfig(tgId: number): Promise<string | null> {
  const userRef = `tg_${tgId}`;
  
  // 1. Проверка кэша в БД
  const cachedKey = keysRepo.getActiveKey(userRef);
  if (cachedKey) return cachedKey.key;

  // 2. Запрос к внешнему API
  const user = await this.findUser(tgId);
  if (!user) return null;
  
  const url = this.formatSubscriptionUrl(user);
  
  // 3. Сохранение в кэш
  if (url) {
    keysRepo.saveKey({ userRef, marzbanUsername: user.username, key: url });
  }
  
  return url;
}
```

### Сервис с бизнес-логикой

```typescript
async activateUser(tgId: number, days: number): Promise<string> {
  const expireDate = Math.floor(Date.now() / 1000) + (days * 86400);
  let user = await this.findUser(tgId);
  
  if (!user) {
    // Создание нового пользователя
    user = await this.client.createUser({
      username: `tg_${tgId}`,
      expire: expireDate,
      status: 'active'
    });
  } else {
    // Продление существующего
    user = await this.client.updateUser(user.username, {
      ...user,
      expire: expireDate,
      status: 'active'
    });
  }
  
  const url = this.formatSubscriptionUrl(user);
  keysRepo.saveKey({
    userRef: `tg_${tgId}`,
    marzbanUsername: user.username,
    key: url
  });
  
  return url;
}
```

## HTTP маршруты

### Регистрация маршрутов

```typescript
export async function ordersRoutes(fastify: FastifyInstance) {
  const verifyAuth = createVerifyAuth({
    jwtSecret: fastify.authJwtSecret,
    cookieName: fastify.authCookieName,
    botToken: fastify.telegramBotToken,
  });

  fastify.post('/create', {
    preHandler: verifyAuth,
    schema: { /* Fastify schema */ }
  }, async (request, reply) => {
    // Обработчик
  });
}
```

### Обработчик с валидацией

```typescript
fastify.post<{ Body: CreateOrderRequest }>('/create', {
  preHandler: verifyAuth,
}, async (request, reply) => {
  // Валидация через Zod
  const validationResult = createOrderSchema.safeParse(request.body);
  if (!validationResult.success) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: validationResult.error.errors,
    });
  }

  // Бизнес-логика
  const orderId = uuidv4();
  ordersRepo.createOrder({ orderId, planId: request.body.planId });
  
  return reply.status(201).send({ orderId, status: 'pending' });
});
```

### Обработчик с доступом к сервисам

```typescript
fastify.get('/config', {
  preHandler: verifyAuth
}, async (request, reply) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  
  const config = await fastify.marzbanService.getUserConfig(
    request.user.tgId
  );
  
  if (!config) {
    return reply.status(404).send({ error: 'Not Found' });
  }
  
  return reply.send({ ok: true, config });
});
```

## Аутентификация

### Создание JWT токена

```typescript
export function createToken(params: CreateTokenParams): string {
  const payload: JWTPayload = {
    tgId: params.tgId,
    username: params.username,
    firstName: params.firstName,
  };

  return jwt.sign(payload, params.secret, {
    expiresIn: `${params.expiresInDays || 7}d`,
  });
}
```

### Верификация токена

```typescript
export function verifyToken(params: VerifyTokenParams): JWTPayload | null {
  try {
    const decoded = jwt.verify(params.token, params.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
```

### Middleware аутентификации

```typescript
export function createVerifyAuth(options: VerifyAuthOptions) {
  return async function verifyAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // 1. Admin API Key
    const apiKey = request.headers['x-admin-api-key'];
    if (options.adminApiKey && apiKey === options.adminApiKey) {
      request.user = { isAdmin: true, tgId: 0 };
      return;
    }

    // 2. JWT в cookie
    const token = request.cookies[options.cookieName];
    if (token) {
      const payload = verifyToken({ token, secret: options.jwtSecret });
      if (payload) {
        request.user = { tgId: payload.tgId, ...payload };
        return;
      }
    }

    // 3. Telegram initData
    const initData = request.headers.authorization;
    if (initData && options.botToken) {
      const result = verifyTelegramInitData({ initData, botToken: options.botToken });
      if (result.valid && result.user) {
        request.user = { tgId: result.user.id, ...result.user };
        return;
      }
    }

    return reply.status(401).send({ error: 'Unauthorized' });
  };
}
```

## Клиенты для внешних API

### HTTP клиент с аутентификацией

```typescript
export class MarzbanClient {
  private token: string | null = null;

  private async login() {
    const response = await this.axiosInstance.post('/api/admin/token', {
      username: this.username,
      password: this.password,
    });
    this.token = response.data.access_token;
  }

  async getUser(username: string): Promise<MarzbanUser | null> {
    try {
      const response = await this.request({
        method: 'get',
        url: `/api/user/${username}`,
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  public async request(config: any): Promise<any> {
    if (!this.token) await this.login();
    
    try {
      return await this.axiosInstance({
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${this.token}`,
        },
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.token = null;
        return await this.request(config); // Retry
      }
      throw error;
    }
  }
}
```

### Клиент с таймаутом

```typescript
async createPayment(params: YooKassaPaymentParams): Promise<YooKassaPaymentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': uuidv4(),
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}
```

## Валидация

### Схема валидации с Zod

```typescript
import { z } from 'zod';

const createOrderSchema = z.object({
  planId: z.string().min(1),
  tgId: z.number().optional(),
});

// В обработчике
const validationResult = createOrderSchema.safeParse(request.body);
if (!validationResult.success) {
  return reply.status(400).send({
    error: 'Validation failed',
    details: validationResult.error.errors,
  });
}
```

### Валидация webhook

```typescript
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

const validationResult = yookassaWebhookSchema.safeParse(request.body);
if (!validationResult.success) {
  return reply.status(200).send({ ok: true });
}
```

## Хранилища (Strategy Pattern)

### Интерфейс хранилища

```typescript
export interface OrderStore {
  create(order: Order): Promise<void>;
  findById(orderId: string): Promise<Order | null>;
  update(orderId: string, updates: Partial<Order>): Promise<boolean>;
}
```

### Реализация для SQLite

```typescript
export class SqliteOrderStore implements OrderStore {
  async create(order: Order): Promise<void> {
    ordersRepo.createOrder({
      orderId: order.orderId,
      planId: order.planId,
      userRef: order.userRef,
    });
  }

  async findById(orderId: string): Promise<Order | null> {
    const row = ordersRepo.getOrder(orderId);
    if (!row) return null;

    return {
      orderId: row.order_id,
      planId: row.plan_id,
      status: row.status === 'paid' ? 'paid' : 'pending',
      key: row.key || undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
```

### Реализация для памяти (тестирование)

```typescript
export class MemoryOrderStore implements OrderStore {
  private orders: Map<string, Order> = new Map();

  async create(order: Order): Promise<void> {
    this.orders.set(order.orderId, order);
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }
}
```

## Dependency Injection

### Регистрация сервисов в Fastify

```typescript
// В server.ts
const orderStore = new SqliteOrderStore();
fastify.decorate('orderStore', orderStore);

const marzbanService = new MarzbanService(/* ... */);
fastify.decorate('marzbanService', marzbanService);

// Типизация
declare module 'fastify' {
  interface FastifyInstance {
    orderStore: OrderStore;
    marzbanService: MarzbanService;
  }
}

// Использование в маршрутах
const orderStore = fastify.orderStore;
const marzbanService = fastify.marzbanService;
```

## Обработка ошибок

### Идемпотентная операция

```typescript
export function recordPaymentEvent(params: {
  yookassaEventId?: string;
  yookassaPaymentId: string;
  event: string;
}): boolean {
  try {
    db.prepare(`
      INSERT INTO payment_events (yookassa_event_id, yookassa_payment_id, event, created_at)
      VALUES (?, ?, ?, ?)
    `).run(/* ... */);
    return true;
  } catch (error: unknown) {
    // Игнорируем дубликаты
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return false;
    }
    throw error;
  }
}
```

### Глобальный обработчик ошибок

```typescript
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500,
  });
});
```
