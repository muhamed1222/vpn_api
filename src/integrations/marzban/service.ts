import { MarzbanClient, MarzbanUser } from './client.js';

export class MarzbanService {
  public client: MarzbanClient;

  constructor(apiUrl: string, username: string, password: string) {
    this.client = new MarzbanClient(apiUrl, username, password);
  }

  private async findUser(tgId: number): Promise<MarzbanUser | null> {
    const withPrefix = `tg_${tgId}`;
    const withoutPrefix = tgId.toString();
    let user = await this.client.getUser(withPrefix);
    if (user) return user;
    user = await this.client.getUser(withoutPrefix);
    return user;
  }

  /**
   * Универсальная функция активации/продления
   */
  async activateUser(tgId: number, days: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    let user = await this.findUser(tgId);
    
    if (!user) {
      console.log(`[MarzbanService] Creating new user for tg_${tgId}`);
      const expireDate = now + (days * 86400);
      
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
      console.log(`[MarzbanService] Renewing existing user ${user.username}`);
      const currentExpire = (user.expire && user.expire > now) ? user.expire : now;
      const newExpire = currentExpire + (days * 86400);

      user = await this.client.updateUser(user.username, {
        ...user,
        expire: newExpire,
        status: 'active'
      });
    }

    if (!user) throw new Error('Failed to create or update user in Marzban');

    // Формируем ссылку на подписку
    const subUrl = user.subscription_url 
      ? `https://vpn.outlivion.space/bot-api${user.subscription_url}`
      : (user.links?.[0] || '');
      
    if (!subUrl) throw new Error('Marzban returned user without any links or sub_url');
    
    return subUrl;
  }

  async getUserConfig(tgId: number): Promise<string | null> {
    const user = await this.findUser(tgId);
    if (!user) return null;
    return user.subscription_url 
      ? `https://vpn.outlivion.space/bot-api${user.subscription_url}`
      : (user.links?.[0] || null);
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
    await this.client.request({
      method: 'post',
      url: `/api/user/${user.username}/reset`,
    });
    return await this.getUserConfig(tgId);
  }
}
