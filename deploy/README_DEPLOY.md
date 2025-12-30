# Инструкция по деплою Outlivion API на VPS

## ⚠️ ЗАПРЕЩЕНО

**НЕ выполняйте следующие команды:**
- ❌ Команды, удаляющие Docker volumes (`docker volume rm`, `docker-compose down -v`)
- ❌ Команды, останавливающие или удаляющие Marzban (`systemctl stop marzban`, `systemctl disable marzban`, `docker stop marzban`, `docker rm marzban`)
- ❌ Команды, изменяющие конфигурацию существующих сервисов (vpn.outlivion.space)
- ❌ Команды с `rm -rf` для системных директорий (`/opt`, `/etc`, `/var`, `/usr`)
- ❌ Команды, изменяющие системные файлы без явного указания в инструкции
- ❌ Команды, затрагивающие другие сервисы на сервере

## Предварительные требования

- Ubuntu/Debian VPS с root доступом
- Node.js 18+ установлен (`node --version`)
- npm установлен
- nginx установлен и запущен
- certbot установлен (для SSL)

## Шаг 1: Создание пользователя и подготовка директории

```bash
# Создаем отдельного пользователя для безопасности (без домашней директории, без shell)
sudo useradd -r -s /bin/false outlivion

# Создаем директорию для приложения
sudo mkdir -p /opt/outlivion-api

# Копируем проект в /opt/outlivion-api
# (выполните на локальной машине или через git clone на сервере)
# Например, через git:
cd /opt
sudo git clone <your-repo-url> outlivion-api
# Или через scp с локальной машины:
# scp -r ./outlivion-api/* root@your-server:/opt/outlivion-api/

# Устанавливаем владельца директории
sudo chown -R outlivion:outlivion /opt/outlivion-api
```

## Шаг 2: Установка зависимостей и сборка

```bash
cd /opt/outlivion-api

# Установка зависимостей
sudo -u outlivion npm ci --production=false

# Сборка TypeScript проекта
sudo -u outlivion npm run build

# Проверяем, что dist/ создан
ls -la dist/
```

## Шаг 3: Настройка переменных окружения

```bash
cd /opt/outlivion-api

# Создаем .env из примера
sudo -u outlivion cp .env.example .env

# Редактируем .env (укажите нужные значения)
sudo nano .env

# Устанавливаем правильные права доступа (только для владельца)
sudo chmod 600 .env
sudo chown outlivion:outlivion .env
```

Пример `.env`:
```env
HOST=127.0.0.1
PORT=3001
ALLOWED_ORIGINS=https://outlivion.space,https://www.outlivion.space
```

**Важно:** 
- Убедитесь, что порт 3001 не занят другими сервисами
- Файл `.env` должен быть доступен только пользователю `outlivion` (chmod 600)

## Шаг 4: Настройка systemd сервиса

```bash
# Копируем systemd unit файл
sudo cp deploy/systemd/outlivion-api.service /etc/systemd/system/

# Перезагружаем systemd для чтения нового сервиса
sudo systemctl daemon-reload

# Включаем автозапуск сервиса
sudo systemctl enable outlivion-api

# Запускаем сервис
sudo systemctl start outlivion-api

# Проверяем статус
sudo systemctl status outlivion-api

# Просмотр логов в реальном времени
sudo journalctl -u outlivion-api -f

# Просмотр последних 50 строк логов
sudo journalctl -u outlivion-api -n 50
```

Если сервис не запускается, проверьте:
- Правильность пути к `node` (`which node`)
- Существование файла `/opt/outlivion-api/dist/server.js`
- Права доступа к файлам
- Содержимое `.env` файла

## Шаг 5: Настройка nginx

**Важно:** Этот конфиг создается как отдельный файл и НЕ затрагивает существующий `vpn.outlivion.space`.

```bash
# Копируем конфигурацию nginx
sudo cp deploy/nginx/api.outlivion.space.conf /etc/nginx/sites-available/

# Создаем символическую ссылку (активируем сайт)
sudo ln -s /etc/nginx/sites-available/api.outlivion.space.conf /etc/nginx/sites-enabled/

# Проверяем конфигурацию nginx на ошибки
sudo nginx -t

# Если проверка прошла успешно, перезагружаем nginx
sudo systemctl reload nginx
```

**Перед выполнением:**
- Убедитесь, что домен `api.outlivion.space` указывает на IP вашего VPS (A-запись в DNS)
- Проверьте, что существующий конфиг `vpn.outlivion.space` не будет затронут

## Шаг 6: Настройка SSL (HTTPS) через certbot

```bash
# Устанавливаем SSL сертификат для api.outlivion.space
sudo certbot --nginx -d api.outlivion.space

# Certbot автоматически обновит конфигурацию nginx
# Проверяем, что все работает
sudo nginx -t
sudo systemctl reload nginx
```

После установки SSL certbot автоматически:
- Обновит конфигурацию nginx для использования HTTPS
- Настроит автоматическое перенаправление с HTTP на HTTPS
- Настроит автообновление сертификата

## Шаг 7: Проверка работы

### Проверка systemd сервиса:
```bash
# Статус
sudo systemctl status outlivion-api

# Логи
sudo journalctl -u outlivion-api -n 50
```

### Проверка API:
```bash
# Health check
curl https://api.outlivion.space/health

# Создание заказа
curl -X POST https://api.outlivion.space/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{"planId": "test-plan"}'
```

## Обновление приложения

При обновлении кода:

```bash
cd /opt/outlivion-api

# Обновляем код (через git или scp)
# git pull origin main
# или
# scp -r ./outlivion-api/* root@your-server:/opt/outlivion-api/

# Устанавливаем зависимости (если изменились)
sudo npm ci --production=false

# Пересобираем
sudo npm run build

# Перезапускаем сервис
sudo systemctl restart outlivion-api

# Проверяем логи
sudo journalctl -u outlivion-api -f
```

## Полезные команды

```bash
# Остановка сервиса
sudo systemctl stop outlivion-api

# Запуск сервиса
sudo systemctl start outlivion-api

# Перезапуск сервиса
sudo systemctl restart outlivion-api

# Просмотр логов в реальном времени
sudo journalctl -u outlivion-api -f

# Просмотр последних 100 строк логов
sudo journalctl -u outlivion-api -n 100

# Проверка, слушает ли приложение порт 3001
sudo netstat -tlnp | grep 3001
# или
sudo ss -tlnp | grep 3001
```

## Устранение неполадок

### Сервис не запускается
1. Проверьте логи: `sudo journalctl -u outlivion-api -n 50`
2. Убедитесь, что порт 3001 свободен: `sudo ss -tlnp | grep 3001`
3. Проверьте права доступа к файлам: `ls -la /opt/outlivion-api/`
4. Проверьте путь к node: `which node` (должен быть `/usr/bin/node`)

### nginx возвращает 502 Bad Gateway
1. Проверьте, что сервис запущен: `sudo systemctl status outlivion-api`
2. Проверьте, что приложение слушает порт 3001: `sudo ss -tlnp | grep 3001`
3. Проверьте логи nginx: `sudo tail -f /var/log/nginx/error.log`

### SSL не работает
1. Проверьте DNS: `dig api.outlivion.space`
2. Убедитесь, что порт 80 и 443 открыты в firewall
3. Проверьте конфигурацию nginx: `sudo nginx -t`

## Безопасность

- ✅ Используйте HTTPS (SSL сертификат)
- ✅ Настройте `ALLOWED_ORIGINS` в `.env` для CORS
- ✅ Регулярно обновляйте зависимости: `npm audit` и `npm update`
- ✅ Ограничьте доступ к `.env` файлу: `chmod 600 /opt/outlivion-api/.env`
- ✅ Настройте firewall (ufw) для ограничения доступа к портам

## Структура файлов на сервере

```
/opt/outlivion-api/
├── dist/                    # Скомпилированные файлы
├── src/                     # Исходный код
├── node_modules/            # Зависимости
├── .env                     # Переменные окружения (chmod 600)
├── package.json
└── deploy/                  # Файлы для деплоя

/etc/systemd/system/
└── outlivion-api.service    # Systemd unit файл

/etc/nginx/sites-available/
└── api.outlivion.space.conf # Конфигурация nginx
```

