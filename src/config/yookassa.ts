// IP адреса YooKassa для проверки webhook
// Источник: https://yookassa.ru/developers/using-api/webhooks#ip
export const YOOKASSA_WEBHOOK_IPS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

export function isYooKassaIP(ip: string): boolean {
  // Простая проверка для IPv4
  for (const cidr of YOOKASSA_WEBHOOK_IPS) {
    if (cidr.includes('/')) {
      // CIDR проверка (упрощенная)
      const [network, prefix] = cidr.split('/');
      const mask = parseInt(prefix, 10);
      if (mask === 32 && network === ip) {
        return true;
      }
      // Для упрощения, проверяем только точные совпадения сетей
      // В production лучше использовать библиотеку для CIDR
      if (ip.startsWith(network.split('.').slice(0, Math.floor(mask / 8)).join('.'))) {
        return true;
      }
    } else {
      if (cidr === ip) {
        return true;
      }
    }
  }
  return false;
}

