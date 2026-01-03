import { MarzbanClient, MarzbanUser } from './client.js';

export class MarzbanService {
  public client: MarzbanClient;

  constructor(apiUrl: string, username: string, password: string) {
    this.client = new MarzbanClient(apiUrl, username, password);
  }

  private async findUser(tgId: number): Promise<MarzbanUser | null> {
    const withPrefix = `tg_${tgId}`;
    const withoutPrefix = tgId.toString();
    try {
      // Прямой запрос данных пользователя (GET)
      let user = await this.client.getUser(withPrefix);
      if (user) return user;
      user = await this.client.getUser(withoutPrefix);
      return user;
    } catch (e) {
      return null;
    }
  }

  /**
   * Возвращает ссылку. 
   * Если в объекте пользователя есть subscription_url, используем его.
   */
  private formatSubscriptionUrl(user: MarzbanUser): string {
    if (user.subscription_url) {
      // Это стабильная ссылка /sub/...
      return `https://vpn.outlivion.space/bot-api${user.subscription_url}`;
    }
    // Если нет, берем первую из списка links
    return user.links?.[0] || '';
  }

  /**
   * ТОЛЬКО ЧТЕНИЕ. Никаких побочных эффектов.
   */
  async getUserConfig(tgId: number): Promise<string | null> {
    const user = await this.findUser(tgId);
    if (!user) return null;
    
    const url = this.formatSubscriptionUrl(user);
    console.log(`[MarzbanService] GET config for ${tgId}: ${url.substring(0, 40)}...`);
    return url;
  }

  async activateUser(tgId: number, days: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    let user = await this.findUser(tgId);
    const expireDate = now + (days * 86400);
    
    if (!user) {
      console.log(`[MarzbanService] Creating user tg_${tgId}`);
      user = await this.client.createUser({
        username: `tg_${tgId}`,
        proxies: { vless: {} },
        inbounds: { vless: ["VLESS_REALITY"] },
        expire: expireDate,
        data_limit: 0,
        status: 'active',
        note: `🇳🇱 Нидерланды [VLESS - tcp]`
      });
    } else {
      // Обновляем ТОЛЬКО если подписка просрочена или нужно реально продлить
      const isExpired = !user.expire || user.expire < now;
      
      if (isExpired || user.status !== 'active') {
        console.log(`[MarzbanService] Renewing user ${user.username}`);
        user = await this.client.updateUser(user.username, {
          ...user,
          expire: expireDate,
          status: 'active'
        });
      } else {
        // Если уже активен — просто продлеваем срок
        console.log(`[MarzbanService] User ${user.username} already active, adding time`);
        const newExpire = (user.expire || now) + (days * 86400);
        user = await this.client.updateUser(user.username, {
          ...user,
          expire: newExpire
        });
      }
    }

    if (!user) throw new Error('Failed to activate user');
    return this.formatSubscriptionUrl(user);
  }

  async getUserStatus(tgId: number): Promise<MarzbanUser | null> {
    return await this.findUser(tgId);
  }

  async renewUser(tgId: number, days: number): Promise<boolean> {
    await this.activateUser(tgId, days);
    return true;
  }

  async regenerateUser(tgId: number): Promise<string | null> {
    const user = await this.findUser(tgId);
    if (!user) return null;
    // Сброс токена (reset) - ЕДИНСТВЕННЫЙ способ поменять ссылку осознанно
    await this.client.request({
      method: 'post',
      url: `/api/user/${user.username}/reset`,
    });
    const updatedUser = await this.findUser(tgId);
    return updatedUser ? this.formatSubscriptionUrl(updatedUser) : null;
  }
}
