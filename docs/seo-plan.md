<!-- Подготовлено многоагентным SEO-аудитом (read-only, сверено с кодом). Реализация — волнами, см. раздел 5. -->

## SEO-подготовка сайта клуба

### 1. Резюме и главное решение

**Состояние.** Публичный каркас есть и работает: `sitemap.xml` собирается API и проксируется периметром (`infra/Caddyfile:33-36`, `apps/api/src/routes/content.ts:15-43`), есть `robots.txt` с закрытой приваткой, базовые OG и `<meta description>` в `apps/web/index.html`, `<html lang="ru">`, ЧПУ, per-route `document.title` через `usePageTitle` (`apps/web/src/lib/title.ts`). Проверкой подтверждены и все пробелы: JSON-LD нет нигде (`grep ld+json|schema.org` – 0), `<link rel=canonical>` нет нигде, per-route `<meta description>`/OG не меняется ни на одном маршруте (мутируется только `document.title`), `og:image` относительный, `twitter:card` только `summary`, `Sitemap:` в robots относительный, у `NewsPost.tsx` нет ни `usePageTitle`, ни `SiteShell`.

**Главная развилка – рендеринг для превью-скрейперов.** Это чистый Vite SPA: все маршруты отдают один статический `dist/index.html` (`apps/web/Caddyfile.static:4` – `try_files → /index.html`). Googlebot исполняет JS и увидит клиентски выставленные `title`/`description`/`canonical`/JSON-LD. Но Telegram, VK, WhatsApp, Slack, Twitter, Discord JS **не исполняют** и на любой ссылке видят одинаковую брендовую карточку из `index.html`. Значит per-route OG/JSON-LD для мессенджеров клиентской инъекцией недостижимы физически. Варианты:

- **(а) Build-time prerender** (react-snap / `@prerenderer/vite-react-ssg`) – требует headless Chromium в `apps/web/Dockerfile` (alpine + chromium), переезда `main.tsx` на `hydrateRoot`, покрывает только ~7 статических маршрутов; динамика `/news/:slug`, `/dpo/:slug` протухает до следующего билда.
- **(б) Миграция на Astro/Next SSG/SSR** – полный перепис рабочего SPA (роутер, data-fetch, админка). Нарушает cost~0.
- **(в) Оставить как есть** – каждая расшаренная ссылка = обобщённая карточка.

**Рекомендация под этот масштаб (cost~0): dynamic rendering через уже существующую связку Caddy → API.** В `infra/Caddyfile` добавить matcher по User-Agent скрейперов на публичных путях и проксировать их на `api:3000`; в `apps/api` отдать маленький HTML-шелл, где `<head>` заполняется per-route (`title`/`description`/`og:*`/`twitter`/JSON-LD), а для `/news/:slug` и `/dpo/:slug` данные тянутся живьём из Directus теми же `readItems`, что уже есть в `content.ts`. Плюсы именно для этого стека: **нет headless-браузера, нет правки Dockerfile, нет build-шага, нет протухания динамики**, переиспользуется ровно тот же паттерн, что уже работает для `/sitemap.xml` (`infra/Caddyfile:33-36`). Googlebot при этом продолжает исполнять SPA и получает клиентские меты из п. 3. CSP этому не мешает: `script-src 'self'` не блокирует `<script type="application/ld+json">` – это data-блок, не исполняемый скрипт (`infra/Caddyfile:45`).

Если UA-sniffing нежелателен как первый шаг – запасной минимум: prerender только 7 статических маршрутов, приняв, что превью `/news/:slug` и `/dpo/:slug` останутся брендовыми, а alpine-Dockerfile придётся дополнить chromium.

**Что уже сделано (фундамент, заново не предлагаем):** noindex приватных `/lk`, `/admin`, `/cart` в robots; `<html lang="ru">` и ЧПУ; hreflang/локаль `ru-RU`.

---

### 2. Что уже есть (фундамент)

| Элемент | Где | Статус |
|---|---|---|
| `sitemap.xml` (статика + новости + программы из БД, кэш 1 ч) | `apps/api/src/routes/content.ts:15-43`, проксируется `infra/Caddyfile:33-36` | Есть, `<loc>` абсолютные через `PUBLIC_URL` |
| `robots.txt`, приватка закрыта (`/lk`, `/admin`, `/cart`, `/api/`) | `apps/web/public/robots.txt` | Есть; директива `Sitemap:` относительная (правим, п.12) |
| Базовые OG + `og:type`, `og:site_name`, `og:locale=ru_RU` | `apps/web/index.html:17-24` | Есть; `og:image` относительный, нет `og:url`/twitter-полей (правим, п.3) |
| `<meta name="description">` глобальный | `apps/web/index.html:7` | Есть, но один на все маршруты (правим, п.4) |
| Per-route `<title>` | `apps/web/src/lib/title.ts`, вызовы в Cart/Events/Merch/Podcasts/News/Dpo/Program | Есть; нет в NewsPost/Home/Join/legal/404 (правим, п.5) |
| `<html lang="ru">`, ЧПУ, `ru_RU` | `apps/web/index.html:2`, роутер | Корректно |
| noindex приватных страниц | `apps/web/public/robots.txt` | Корректно |

---

### 3. План по приоритетам

Ранжирование по (impact ↓, effort ↑).

| # | Область | Что сделать | Impact | Effort | Приоритет | Файл |
|---|---|---|---|---|---|---|
| 1 | Rendering для скрейперов | Dynamic rendering: UA-matcher в Caddy → API-шелл с per-route `<head>` (title/desc/og/JSON-LD), динамику из Directus | high | m | P1 | `infra/Caddyfile:33-51`; `apps/api/src/routes/content.ts:15-43` |
| 2 | JSON-LD Organization + WebSite | Один статический `<script type=ld+json>` в `<head>` – виден всем краулерам, включая non-JS | high | xs | P0 | `apps/web/index.html:24` |
| 3 | OG / Twitter полнота | `og:image` абсолютный (карточка 1200×630), `og:url`, `twitter:title/description/image`, `twitter:card=summary_large_image` | high | xs | P0 | `apps/web/index.html:17-24` |
| 4 | `useHead` – матрица title+description+canonical | Расширить `title.ts`: `document.title`, `<meta description>`, `<link canonical>`; вызвать на всех публичных страницах | high | m | P1 | `apps/web/src/lib/title.ts:6` |
| 5 | NewsPost: title + SiteShell | `usePageTitle(post.title)` + обернуть в `<SiteShell>` (сейчас голый `<main>`, тупик без шапки/футера) | high | s | P1 | `apps/web/src/pages/NewsPost.tsx:1-9` |
| 6 | Course JSON-LD на `/dpo/:slug` | `useJsonLd(Course)` с базовой (не скидочной) ценой, provider=НИУ ВШЭ, availability по enrollment | high | s | P1 | `apps/web/src/pages/Program.tsx:19` |
| 7 | Хук `useJsonLd` | Тонкий хук-зеркало `usePageTitle` для монтирования/снятия `ld+json` по маршруту | medium | xs | P1 | новый `apps/web/src/lib/jsonld.ts` |
| 8 | NewsArticle JSON-LD | `useJsonLd(NewsArticle)` в NewsPost: headline/datePublished/author+publisher=клуб | medium | s | P1 | `apps/web/src/pages/NewsPost.tsx` |
| 9 | Per-route OG/description для Googlebot | В `useHead` апдейтить `og:title/og:description/og:url` клиентски | medium | s | P2 | `apps/web/src/lib/title.ts` |
| 10 | Cache-Control статики | Хешированные ассеты `immutable` год; `/`, `index.html`, `sw.js` – `no-cache` | medium | s | P1 | `apps/web/Caddyfile.static:1` |
| 11 | Code-splitting / lazy admin | `React.lazy` для `/admin`,`/lk`,`/cart` + `manualChunks` vendor; сейчас 514KB/137KB gzip один чанк | medium | m | P1 | `apps/web/src/App.tsx:13`, `vite.config.ts` |
| 12 | robots: абсолютный Sitemap | `Sitemap: https://<ДОМЕН>/sitemap.xml`; проверить `PUBLIC_URL` в prod ≠ `localhost` | low | xs | P2 | `apps/web/public/robots.txt`; `apps/api/src/env.ts:31` |
| 13 | Self-host шрифтов | Сабсет woff2 (кириллица) `@font-face`+`preload`; убрать render-blocking Google Fonts и сторонний домен из CSP | medium | m | P2 | `apps/web/index.html:25-30` |
| 14 | Canonical + query-варианты `/dpo` | Self-canonical на чистый путь без служебных query (`?dir&sort&…`) через `useHead` | medium | m | P1 | `apps/web/src/lib/title.ts` |
| 15 | Диплинк события `/events/:slug` | Маршрут + `GET /events/:slug` + в sitemap (сейчас только модалка) | medium | l | P2 | `apps/web/src/App.tsx`, `content.ts` |
| 16 | soft-404 noindex | На Stub: `usePageTitle("Страница не найдена")` + клиентский `<meta robots noindex>` | medium | s | P2 | `apps/web/src/App.tsx:50` |
| 17 | `alt` контентных обложек | Осмысленный alt на `Podcasts.tsx:161`, `Events.tsx:86,137` | low | xs | P2 | указанные строки |
| 18 | Хлебные крошки | `direction` → ссылка `/dpo?dir=…`; крошка на NewsPost; BreadcrumbList JSON-LD | low | s | P2 | `apps/web/src/pages/Program.tsx:35` |
| 19 | sitemap changefreq/lastmod | `<changefreq>` по секциям, `<lastmod>` программам из `date_updated` | low | s | P3 | `apps/api/src/routes/content.ts:36` |
| 20 | robots meta приватки (defense-in-depth) | На `/lk`,`/admin/*`,`/cart` инжектить `noindex,nofollow` | low | s | P3 | `apps/web/index.html:24` |
| 21 | favicon.ico fallback | Положить `apps/web/public/favicon.ico` | low | xs | P3 | `apps/web/index.html:11` |
| 22 | Мерч: `<img>` вместо CSS-фона + `/merch/:slug` | Миниатюра как `<img alt>`; опц. маршрут детали | low | m | P3 | `apps/web/src/pages/Merch.tsx:40` |
| 23 | Иерархия заголовков | Скрытый `<h2>` для «Ближайшие»; карточки `<div>`→`<h3>` | low | s | P3 | `apps/web/src/pages/Events.tsx:96` |
| 24 | LCP hero (десктоп) | `preload as=image` для `themis.jpeg`; hero не стартовать с `opacity:0` | low | s | P3 | `apps/web/src/pages/Home.tsx:212` |
| 25 | Prerender-потолок (на будущее) | Если понадобятся событийные rich results вне Google или стабильные превью в TG/VK – prerender 7 маршрутов | medium | l | P3 | `apps/web/vite.config.ts` |

---

### 4. Готовые ассеты

Плейсхолдер `<ДОМЕН>` = прод-хост из `env.PUBLIC_URL` (сейчас default `http://localhost`, `apps/api/src/env.ts:31` – обязательно выставить в prod).

#### 4.1 Матрица title / description по публичным маршрутам

`<title>` показан без хвоста « – Клуб выпускников факультета права Вышки». Динамику брать из реальных полей; description резать до ~155 символов.

| Маршрут | `<title>` | `<meta description>` |
|---|---|---|
| `/` | (base, без хвоста) | Клуб выпускников факультета права Вышки: личный кабинет со статусом, скидка выпускника на ДПО, события, подкасты, мерч и сообщество. |
| `/dpo` | Программы ДПО со скидкой выпускника | Каталог программ дополнительного образования факультета права НИУ ВШЭ. Цена выпускника применяется автоматически после верификации. |
| `/dpo/:slug` | `{program.title}` | `{program.description｜155}` → fallback: «`{title}`: программа ДПО факультета права НИУ ВШЭ. `{direction}`, `{duration}`, `{format}`. Цена выпускника.» |
| `/events` | События и встречи клуба | Афиша клуба выпускников факультета права Вышки: нетворкинги, лекции и встречи выпусков. Запись заранее, за участие баллы клуба. |
| `/news` | Новости клуба | Новости клуба выпускников факультета права Вышки: события, программы, партнёрства и жизнь сообщества. |
| `/news/:slug` | `{post.title}` | `{post.excerpt｜160}` → fallback: «`{title}` – новость клуба выпускников факультета права Вышки.» |
| `/podcasts` | Подкасты клуба | Подкасты клуба выпускников факультета права Вышки: разговоры с выпускниками, преподавателями и практиками права. Пробный выпуск бесплатно. |
| `/merch` | Мерч клуба | Фирменный мерч клуба выпускников факультета права Вышки: одежда и аксессуары с фасеточной Фемидой. Самовывоз в учебном офисе или доставка. |
| `/join` | Вступить в клуб | Подайте заявку в клуб выпускников факультета права Вышки: подтвердите выпуск и получите статус, скидку на ДПО и доступ к сообществу. |

**Хук `useHead` (замена `usePageTitle`, `apps/web/src/lib/title.ts`):**

```ts
import { useEffect } from "react";
const BASE = "Клуб выпускников факультета права Вышки";

export function useHead(o: { title?: string | null; description?: string | null; canonical?: string | null }): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = o.title ? `${o.title} — ${BASE}` : BASE; // хвост в UI можно оставить длинным тире

    const setMeta = (sel: string, attr: string, val?: string | null) => {
      if (!val) return () => {};
      let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(sel);
      const created = !el;
      if (!el) { el = document.createElement(sel.startsWith("link") ? "link" : "meta"); document.head.appendChild(el); }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, val);
      return () => { if (created) el!.remove(); else if (prev != null) el!.setAttribute(attr, prev); };
    };
    const d = setMeta('meta[name="description"]', "content", o.description);
    const c = setMeta('link[rel="canonical"]', "href", o.canonical);
    return () => { document.title = prevTitle; d(); c(); };
  }, [o.title, o.description, o.canonical]);
}
```

Вызовы (пример для витрины с фильтрами – канон на чистый путь):

```ts
useHead({ title: "Программы ДПО со скидкой выпускника", description: "…",
          canonical: `${import.meta.env.VITE_PUBLIC_URL}/dpo` });
// детальные: canonical: `${BASE_URL}/news/${slug}` | `${BASE_URL}/dpo/${slug}`
```

#### 4.2 JSON-LD шаблоны

**Organization + WebSite (статично в `<head>` `index.html` – виден всем, включая Telegram/VK).** Реквизиты подтверждены в `legal.tsx`, Telegram в `SiteShell.tsx`. `SearchAction` не добавлять – серверного `/search` нет, поиск на `/dpo` клиентский.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": "https://<ДОМЕН>/#club",
      "name": "Клуб выпускников факультета права Вышки",
      "url": "https://<ДОМЕН>/",
      "logo": "https://<ДОМЕН>/icon-512.png",
      "sameAs": ["https://t.me/pravohse"],
      "email": "pravo@hse.ru",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "ул. Мясницкая, д. 20",
        "addressLocality": "Москва",
        "postalCode": "101000",
        "addressCountry": "RU"
      },
      "parentOrganization": {
        "@type": "CollegeOrUniversity",
        "name": "НИУ «Высшая школа экономики»",
        "url": "https://pravo.hse.ru"
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://<ДОМЕН>/#website",
      "url": "https://<ДОМЕН>/",
      "name": "Клуб выпускников факультета права Вышки",
      "inLanguage": "ru-RU",
      "publisher": { "@id": "https://<ДОМЕН>/#club" }
    }
  ]
}
</script>
```

**Хук `useJsonLd` (`apps/web/src/lib/jsonld.ts`) – зеркало `usePageTitle`:**

```ts
import { useEffect } from "react";
export function useJsonLd(data: object | null | undefined) {
  const json = data ? JSON.stringify(data) : "";
  useEffect(() => {
    if (!json) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = json;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [json]);
}
```

**Course на `/dpo/:slug` (`Program.tsx`).** Цена в копейках (`lib/api.ts` – `rub=kop/100`); брать базовую, без скидки выпускника. `dates.start`/`duration` – свободный текст, в `startDate`/`timeRequired` не класть.

```ts
useJsonLd(p && {
  "@context": "https://schema.org",
  "@type": "Course",
  "name": p.title,
  "description": p.description ?? undefined,
  "url": `https://<ДОМЕН>/dpo/${p.slug}`,
  "inLanguage": "ru-RU",
  "provider": { "@type": "EducationalOrganization", "name": "НИУ «Высшая школа экономики»", "url": "https://pravo.hse.ru" },
  "offers": {
    "@type": "Offer", "category": "Paid",
    "price": p.price / 100, "priceCurrency": "RUB",
    "url": p.source_url ?? `https://<ДОМЕН>/dpo/${p.slug}`,
    "availability": p.enrollment === "nonactual" ? "https://schema.org/SoldOut" : "https://schema.org/InStock"
  },
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": p.format === "online" ? "Online" : p.format === "blended" ? "Blended" : "Onsite",
    "courseWorkload": totalHours > 0 ? `PT${totalHours}H` : undefined  // сумма modules[].hours
  }
});
```

**NewsArticle на `/news/:slug` (`NewsPost.tsx`).** В модели `news` нет `author` и `image` (`content.ts:7`) – завязываем на Organization, image не выдумываем.

```ts
useJsonLd(post.data && {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": post.data.title,
  "description": post.data.excerpt ?? undefined,
  "articleBody": post.data.body ?? undefined,
  "datePublished": post.data.published_at,
  "dateModified": post.data.published_at,
  "inLanguage": "ru-RU",
  "mainEntityOfPage": `https://<ДОМЕН>/news/${post.data.slug}`,
  "author":    { "@type": "Organization", "name": "Клуб выпускников факультета права Вышки" },
  "publisher": { "@type": "Organization", "name": "Клуб выпускников факультета права Вышки",
                 "logo": { "@type": "ImageObject", "url": "https://<ДОМЕН>/icon-512.png" } }
});
// если в коллекцию news добавите поле cover — прокинуть в "image": [абсолютный URL]
```

**BreadcrumbList (на детальных, вместе с Course/NewsArticle):**

```ts
{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Витрина ДПО", "item": "https://<ДОМЕН>/dpo" },
  { "@type": "ListItem", "position": 2, "name": p.title, "item": `https://<ДОМЕН>/dpo/${p.slug}` }
]}
```

**Event на `/events` (в Caddy→API-шелле, где есть данные Directus):** `@type: Event`, `startDate` (ISO), `location`, `organizer`=клуб. Требует slug-поля и by-slug API (п.15).

#### 4.3 Правки OG / robots / canonical / hreflang

**`index.html` OG/Twitter (`:17-24`):**

```html
<meta property="og:url" content="https://<ДОМЕН>/" />
<meta property="og:image" content="https://<ДОМЕН>/og-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Клуб выпускников факультета права Вышки" />
<meta name="twitter:description" content="Программы ДПО со скидкой выпускника, мерч, подкасты и сообщество." />
<meta name="twitter:image" content="https://<ДОМЕН>/og-card.png" />
```

Подготовить ассет `og-card.png` 1200×630 (не квадратную PWA-иконку). До его появления допустимо указать `icon-512.png` абсолютным URL.

**`robots.txt` (последняя строка):**

```
Sitemap: https://<ДОМЕН>/sitemap.xml
```

Приватку (`/lk`, `/admin`, `/cart`, `/api/`) не трогать. Отдельно проверить, что `PUBLIC_URL` в prod-env периметра = `https://<ДОМЕН>`, иначе sitemap отдаёт `http://localhost/...`.

**Canonical:** только per-route через `useHead` (см. 4.1). Статический canonical в `index.html` не ставить – он указал бы все маршруты на один URL. Trailing-slash дубли (`/dpo` и `/dpo/`, `Caddyfile.static:4`) закрываются этим же self-canonical.

**hreflang:** сайт моноязычный (`ru-RU`), отдельные `<link hreflang>` не нужны; локаль уже задана `<html lang="ru">` и `og:locale=ru_RU`.

**Cache-Control (`apps/web/Caddyfile.static`):**

```caddyfile
:80 {
  root * /srv
  encode gzip
  @assets path /assets/* *.js *.css *.png *.jpg *.jpeg *.webp *.woff2 *.svg
  header @assets Cache-Control "public, max-age=31536000, immutable"
  @html path / /index.html /sw.js
  header @html Cache-Control "no-cache"
  try_files {path} /index.html
  file_server
}
```

**Dynamic-rendering matcher (`infra/Caddyfile`, внутри `{$WEB_DOMAIN}` перед финальным `handle{reverse_proxy web:80}`):**

```caddyfile
@og_scrapers {
  header_regexp User-Agent (?i)(Telegram|vkShare|facebookexternalhit|WhatsApp|Twitterbot|Slackbot|Discordbot|LinkedInBot|Pinterest|redditbot|Skype)
  path / /dpo /dpo/* /events /news /news/* /podcasts /merch /join
}
handle @og_scrapers { reverse_proxy api:3000 }
```

#### 4.4 noindex-стратегия приватных страниц

- **Основной барьер** уже стоит: `robots.txt` Disallow на `/lk`, `/admin`, `/cart`, `/api/`.
- **Defense-in-depth (P3):** `index.html` статически отдаёт `<meta name="robots" content="index, follow">` на все маршруты, включая приватные. В `useHead`/head-менеджере для `/lk`, `/lk/profile`, `/admin/*`, `/cart` инжектить `<meta name="robots" content="noindex, nofollow">` (Googlebot исполняет JS и снимет индексирование, если приватный путь просочится по внешней ссылке).
- **soft-404 (P2):** catch-all `Stub` (`App.tsx:50`) и SPA-fallback отдают HTTP 200. Настоящий 404-статус в чистом SPA недостижим; минимум – на `Stub` выставить `noindex` и осмысленный title.

---

### 5. Порядок внедрения

**Волна A – без решений владельца, чистый выигрыш, минимум усилий (P0/P1, effort xs–s):**
1. OG/Twitter в `index.html` – абсолютный `og:image`, `og:url`, twitter-теги, `summary_large_image` (п.3).
2. Статический Organization + WebSite JSON-LD в `index.html` (п.2) – единственный блок, видимый non-JS скрейперам без prerender.
3. `robots.txt` – абсолютный `Sitemap:` + проверка `PUBLIC_URL` в prod (п.12).
4. NewsPost – `usePageTitle` + оборачивание в `SiteShell` (п.5).
5. `alt` на обложках подкастов/событий (п.17).
6. `Cache-Control` в `Caddyfile.static` (п.10).

**Волна B – механизмы head/JSON-LD (P1, effort s–m):**
7. `useHead` + матрица title/description/canonical по всем публичным маршрутам (п.4, 14).
8. `useJsonLd` + Course на `/dpo/:slug` и NewsArticle на `/news/:slug` (п.6, 7, 8).
9. Per-route OG/description клиентски для Googlebot (п.9).
10. `React.lazy` для admin/lk/cart + `manualChunks` (п.11).

**Волна C – требует решения владельца / больше усилий:**
11. **Развилка рендеринга (главное решение).** Согласовать dynamic rendering через Caddy → API (рекомендуемый путь, cost~0) против prerender 7 маршрутов (нужен chromium в Dockerfile). Только это даёт per-route превью в Telegram/VK/WhatsApp и надёжный event/course rich results вне Google. До решения волны A и B уже полностью закрывают Googlebot.
12. Self-host шрифтов (п.13), диплинк `/events/:slug` (п.15), хлебные крошки + BreadcrumbList (п.18).

**Волна D – мелочи (P3):** sitemap changefreq/lastmod, favicon.ico, noindex-meta приватки, иерархия заголовков, LCP-preload hero, детальные страницы мерча.

**Ключевые файлы:** `apps/web/index.html`; `apps/web/src/lib/title.ts`; новый `apps/web/src/lib/jsonld.ts`; `apps/web/src/pages/NewsPost.tsx`, `Program.tsx`, `Events.tsx`, `Podcasts.tsx`, `App.tsx`; `apps/web/Caddyfile.static`; `apps/web/public/robots.txt`; `apps/api/src/routes/content.ts`, `apps/api/src/env.ts`; `infra/Caddyfile`.
