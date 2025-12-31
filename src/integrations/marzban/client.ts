// Заглушка для интеграции с Marzban
// TODO: Реализовать реальную интеграцию с Marzban API

export interface CreateKeyParams {
  orderId: string;
  planId: string;
  userRef?: string;
}

export interface CreateKeyResponse {
  key: string;
}

/**
 * Создает VPN ключ через Marzban API
 * Пока возвращает заглушку DUMMY_KEY
 */
export async function createVPNKey(params: CreateKeyParams): Promise<CreateKeyResponse> {
  // TODO: Реализовать реальный вызов Marzban API
  // Пример:
  // const response = await fetch(`${MARZBAN_API_URL}/api/v1/user`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${MARZBAN_TOKEN}` },
  //   body: JSON.stringify({ ... })
  // });
  
  // Пока возвращаем заглушку
  return {
    key: `DUMMY_KEY_${params.orderId}`,
  };
}

