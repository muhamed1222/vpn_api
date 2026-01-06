import { getDatabase } from './db.js';

export interface VpnKeyRow {
  id: number;
  user_ref: string;
  marzban_username: string;
  key: string;
  created_at: string;
  revoked_at: string | null;
  is_active: number;
}

/**
 * Получить текущий активный ключ пользователя
 */
export function getActiveKey(userRef: string): VpnKeyRow | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT * FROM vpn_keys 
    WHERE user_ref = ? AND is_active = 1 AND revoked_at IS NULL
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(userRef) as VpnKeyRow | undefined;
  return row || null;
}

/**
 * Сохранить новый ключ
 */
export function saveKey(params: {
  userRef: string;
  marzbanUsername: string;
  key: string;
}): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Деактивируем старые ключи
  db.prepare(`
    UPDATE vpn_keys 
    SET is_active = 0, revoked_at = ? 
    WHERE user_ref = ? AND is_active = 1
  `).run(now, params.userRef);

  // Вставляем новый
  db.prepare(`
    INSERT INTO vpn_keys (
      user_ref, marzban_username, key, created_at, is_active
    ) VALUES (?, ?, ?, ?, 1)
  `).run(
    params.userRef,
    params.marzbanUsername,
    params.key,
    now
  );
}

/**
 * Отозвать ключ
 */
export function revokeKey(userRef: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE vpn_keys 
    SET is_active = 0, revoked_at = ? 
    WHERE user_ref = ? AND is_active = 1
  `).run(now, userRef);
}

