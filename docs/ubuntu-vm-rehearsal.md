# Репетиция выпуска в Ubuntu на Mac

Этот стенд проверяет запуск из `main` в отдельной Ubuntu VM с собственными Docker Engine,
PostgreSQL, Directus, API, сайтом и Caddy. Он хранит только синтетические данные.
Порядок настоящего выпуска и отката описан в [deploy-runbook.md](deploy-runbook.md).

## Устройство стенда

- Ubuntu 24.04 LTS ARM64 в Lima через macOS Virtualization Framework.
- VM `club-ubuntu-qa`: 4 CPU, 6 ГБ RAM, виртуальный диск 20 ГБ. Домашняя папка Mac
  не монтируется в VM.
- Клон `main`: `~/club-pravo-hse` внутри VM.
- Рабочий env: `/etc/club/qa-runtime.env`, права `0600`. Секреты генерируются
  отдельно для стенда и не попадают в git.
- Override Compose: `/etc/club/qa-compose.yml`. Сайт слушает только локальный
  порт `8443`, Directus – `8444`, Mailpit – `8125`; порт API не публикуется.
- `APP_ENV=production`, `SEED_DEMO=false`. Mailpit заменяет внешний SMTP;
  ЮKassa, Telegram и push отключены.

На Mac должно быть достаточно свободного места для образа Ubuntu и первой сборки
Docker. Проверяйте `df -h ~` до запуска и во время первой сборки: размер
виртуального диска – ограничение сверху, а фактически занятое место растёт.

## Создание VM

На Mac установите [Lima](https://lima-vm.io/docs/installation/) и создайте VM:

```bash
brew install lima
limactl start --yes --name=club-ubuntu-qa --vm-type=vz \
  --cpus=4 --memory=6 --disk=20 --mount-none template:ubuntu-24.04
limactl shell club-ubuntu-qa
```

В Ubuntu 24.04 установите системные утилиты для клонирования, проверки HTTPS,
шифрования и резервных копий:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  git curl ca-certificates openssl tar gzip cron rclone
```

Docker Engine, Buildx и Compose plugin установите по
[официальной инструкции Docker](https://docs.docker.com/engine/install/ubuntu/).
Нужен отдельный Docker daemon внутри VM; Docker Desktop на Mac его не заменяет.
Node.js и pnpm на хосте для Compose-деплоя не нужны: проект устанавливает зависимости
по `pnpm-lock.yaml` при сборке Docker-образов. Проверка после установки:

```bash
sudo docker version
sudo docker compose version
sudo docker buildx version
sudo systemctl is-active docker
rclone version
```

Клонируйте исходный репозиторий в VM:

```bash
git clone --depth 1 --branch main \
  https://github.com/Bogolubov-creator/hse-law-alumni-club.git ~/club-pravo-hse
git -C ~/club-pravo-hse rev-parse HEAD
```

## Локальная конфигурация

Создайте `/etc/club/qa-runtime.env` из `.env.example` вне git-каталога с
правами `0600`. Для каждого секрета используйте отдельный результат
`openssl rand -hex 32`. Замените как минимум `POSTGRES_PASSWORD`, `DIRECTUS_KEY`,
`DIRECTUS_SECRET`, `DIRECTUS_SERVICE_TOKEN`, `ADMIN_PASSWORD`, `AUTH_SECRET`,
`ADMIN_AUTH_SECRET`, `CHECKOUT_DB_PASSWORD` и `BACKUP_ENCRYPTION_KEY`.
Демо-пароли из шаблона тоже замените, даже если сиды выключены.

Значения, отличающиеся от обычного production-сервера:

```dotenv
APP_ENV=production
SEED_DEMO=false
ADMIN_EMAIL=qa-admin@example.com
PUBLIC_URL=https://localhost:8443
DIRECTUS_PUBLIC_URL=https://admin.localhost:8444
WEB_DOMAIN=localhost
ADMIN_DOMAIN=admin.localhost
DIRECTUS_CORS_ORIGIN=https://admin.localhost:8444
ACME_EMAIL=qa@example.com
OFFICE_NOTIFY_CHANNEL=email
OFFICE_EMAIL=qa-office@example.com
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM=qa-noreply@example.com
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
TELEGRAM_BOT_TOKEN=
BACKUP_OFFSITE_REMOTE=
```

`CHECKOUT_DATABASE_URL` можно оставить пустым: Compose собирает адрес для
отдельной SQL-роли. Настоящие почтовые, платёжные и Telegram-ключи в VM
не копируйте.

Сохраните следующий override в `/etc/club/qa-compose.yml`:

```yaml
name: club-ubuntu-qa
services:
  directus:
    ports: !override []
  caddy:
    ports: !override
      - '127.0.0.1:8443:443'
      - '127.0.0.1:8444:443'
  mailpit:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - '127.0.0.1:8125:8025'
```

Локальные имена `.localhost` дают Caddy внутренний сертификат. Он проверяется
только с корневым сертификатом этого стенда; в доверенные сертификаты macOS
его добавлять не требуется.

## Первый и повторный деплой

Выполняйте из `~/club-pravo-hse` внутри VM:

```bash
cd ~/club-pravo-hse
sudo docker compose --env-file /etc/club/qa-runtime.env \
  -f docker-compose.yml -f /etc/club/qa-compose.yml config --quiet
sudo docker compose --env-file /etc/club/qa-runtime.env \
  -f docker-compose.yml -f /etc/club/qa-compose.yml up -d mailpit
sudo env ENV_FILE=/etc/club/qa-runtime.env \
  DEPLOY_COMPOSE_OVERRIDE=/etc/club/qa-compose.yml bash scripts/deploy.sh
```

Проверка локального HTTPS без отключения проверки сертификата:

```bash
sudo docker cp club-ubuntu-qa-caddy-1:/data/caddy/pki/authorities/local/root.crt \
  /tmp/club-qa-root.crt
sudo chmod 644 /tmp/club-qa-root.crt
curl --cacert /tmp/club-qa-root.crt https://localhost:8443/api/ready
curl -I --cacert /tmp/club-qa-root.crt https://localhost:8443/
curl -I --resolve admin.localhost:8444:127.0.0.1 \
  --cacert /tmp/club-qa-root.crt https://admin.localhost:8444/server/health
sudo docker ps --format '{{.Names}} {{.Status}}'
```

Для проверки пути с Mac скопируйте **публичный** корневой сертификат из VM:

```bash
limactl copy club-ubuntu-qa:/tmp/club-qa-root.crt /tmp/club-qa-root.crt
curl --cacert /tmp/club-qa-root.crt https://localhost:8443/api/ready
```

Проверяйте регистрацию только с синтетическим адресом `example.com`:
письмо должно появиться в Mailpit на `http://localhost:8125`, аккаунт должен
оставаться `unverified` до подтверждения. Повторная ссылка запрашивается через
`/auth/resend-confirmation`; в течение десяти минут она не создаёт второе письмо.
В отправленной записи `club_mail_outbox` тело письма очищено.
Повторный вызов `scripts/deploy.sh`
должен создать шифрованные копии БД и файлов CMS, восстановить SQL в отдельную
временную БД и снова завершиться с `/ready`.

Перед новой репетицией обновите клон через `git pull --ff-only` и повторите
деплой. Для экономии памяти Mac остановите VM командой
`limactl stop club-ubuntu-qa`; данные и образы сохраняются. Вернуть стенд:
`limactl start club-ubuntu-qa`.

## Граница проверки

VM работает на ARM64, а будущий VPS может быть AMD64. Внутренний сертификат
Caddy не проверяет публичные DNS и ACME. Mailpit не доказывает доставку внешней
почты; в стенде нет реальной оплаты, Telegram, push и offsite-копии. Перед
публичным запуском эти проверки выполняются на целевом сервере по
[основному runbook](deploy-runbook.md).
