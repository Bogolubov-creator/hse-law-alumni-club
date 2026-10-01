import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [destination, stateDirectory] = process.argv.slice(2);
if (!destination || !stateDirectory) throw new Error('Укажите временный env и каталог состояния теста');
const secret = () => randomBytes(32).toString('hex');
const values = {
  APP_ENV: 'development', SEED_DEMO: 'false', JOBS_ENABLED: 'false', DPO_SYNC_ENABLED: 'false',
  POSTGRES_DB: 'club_ci_live', POSTGRES_USER: 'club', POSTGRES_PASSWORD: secret(),
  CHECKOUT_DB_USER: 'club_api', CHECKOUT_DB_PASSWORD: secret(),
  POINTS_SERVICE_TOKEN: secret(),
  ADMIN_EMAIL: 'admin@live.example.com', ADMIN_PASSWORD: secret(),
  AUTH_SECRET: secret(), ADMIN_AUTH_SECRET: secret(),
  PUBLIC_URL: 'http://127.0.0.1:8180', WEB_DOMAIN: ':80', ADMIN_DOMAIN: ':8081',
  ACME_EMAIL: 'admin@live.example.com',
  SMTP_HOST: 'mailpit', SMTP_PORT: '1025', SMTP_FROM: 'club@live.example.com',
  SMTP_USER: '', SMTP_PASS: '', OFFICE_NOTIFY_CHANNEL: 'email', OFFICE_EMAIL: 'office@live.example.com',
  OFFICE_TG_BOT_TOKEN: '', OFFICE_TG_CHAT_ID: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_POLLING: 'false',
  YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
  SENTRY_DSN: '', NEWS_SYNC_ENABLED: 'false', SUPPORT_ENABLED: 'false',
  TEST_EDITOR_EMAIL: 'editor@live.example.com', TEST_EDITOR_PASSWORD: secret(),
  TEST_ALUMNI_EMAIL: 'unused@live.example.com', TEST_ALUMNI_PASSWORD: secret(),
  E2E_LIVE_PASSWORD: secret(), E2E_LIVE_NEW_PASSWORD: secret(),
  E2E_CUSTOM_EDITOR_PASSWORD: secret(), E2E_CUSTOM_SERVICE_PASSWORD: secret(),
  E2E_LIVE_AUTHORIZED: 'club-ci-live', E2E_BASE_URL: 'http://127.0.0.1:8180',
  E2E_MAIL_URL: 'http://127.0.0.1:8182', E2E_STATE_DIR: resolve(stateDirectory),
};
writeFileSync(destination, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''), { mode: 0o600, flag: 'wx' });
if (process.env.GITHUB_ACTIONS === 'true') {
  for (const [key, value] of Object.entries(values)) {
    if (/PASSWORD|SECRET|TOKEN/.test(key) && value) process.stdout.write(`::add-mask::${value}\n`);
  }
}
