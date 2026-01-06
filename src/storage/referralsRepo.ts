import { getDatabase } from './db.js';

export interface ReferralStats {
  totalCount: number;
  trialCount: number;
  premiumCount: number;
  referralCode: string;
}

export function getReferralStats(tgId: number, botDbPath: string): ReferralStats {
  const db = getDatabase();
  const stats: ReferralStats = {
    totalCount: 0,
    trialCount: 0,
    premiumCount: 0,
    referralCode: `REF${tgId}`,
  };

  try {
    // Прикрепляем базу бота
    db.prepare('ATTACH DATABASE ? AS bot_db').run(botDbPath);

    try {
      // 1. Получаем код реферала и общее количество
      const referralInfo = db.prepare(`
        SELECT referral_code 
        FROM bot_db.referrals 
        WHERE user_id = ?
      `).get(tgId) as { referral_code: string } | undefined;

      if (referralInfo) {
        stats.referralCode = referralInfo.referral_code;
      }

      // 2. Получаем список всех приглашенных
      const referrals = db.prepare(`
        SELECT referred_id 
        FROM bot_db.user_referrals 
        WHERE referrer_id = ?
      `).all(tgId) as { referred_id: number }[];

      stats.totalCount = referrals.length;

      if (referrals.length > 0) {
        const referredIds = referrals.map(r => r.referred_id);
        const placeholders = referredIds.map(() => '?').join(',');

        // 3. Получаем заказы этих рефералов
        const orders = db.prepare(`
          SELECT user_id, plan_id 
          FROM bot_db.orders 
          WHERE user_id IN (${placeholders}) AND status IN ('PAID', 'COMPLETED')
        `).all(...referredIds) as { user_id: number, plan_id: string }[];

        // Группируем заказы по пользователям
        const userStatus = new Map<number, { hasTrial: boolean, hasPremium: boolean }>();
        
        for (const order of orders) {
          const status = userStatus.get(order.user_id) || { hasTrial: false, hasPremium: false };
          
          if (order.plan_id === 'plan_7') {
            status.hasTrial = true;
          } else {
            status.hasPremium = true;
          }
          
          userStatus.set(order.user_id, status);
        }

        // Подсчитываем итоги
        for (const status of userStatus.values()) {
          if (status.hasPremium) {
            stats.premiumCount++;
          } else if (status.hasTrial) {
            stats.trialCount++;
          }
        }
      }
    } finally {
      db.prepare('DETACH DATABASE bot_db').run();
    }
  } catch (error) {
    console.error('Error fetching referral stats from bot database:', error);
  }

  return stats;
}

