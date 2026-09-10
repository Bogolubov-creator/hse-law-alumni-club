/**
 * Статические ответы «API» для публичного зеркала на GitHub Pages.
 * Сеть не трогаем: витрина работает без бэкенда (как у ДПО без Node на Pages).
 */
import {
  NEWS_SEED,
  PRODUCTS_SEED,
  PROGRAMS_SEED,
  PODCAST_SUB_PRICE_KOP,
  type ProgramSeed,
  type ProductSeed,
  type NewsSeed,
} from "@club/shared";
import { isMirror } from "./public-url.js";

const MIRROR_UNAVAILABLE = "На публичном зеркале недоступно – это витрина без сервера.";

function programRow(p: ProgramSeed, i: number) {
  return {
    id: `mirror-prog-${i + 1}`,
    slug: p.slug,
    title: p.title,
    direction: p.direction,
    format: p.format,
    duration: p.duration,
    price: p.price,
    enrollment: "actual" as const,
    source_url: null,
    dates: p.dates ?? null,
    document: p.document ?? null,
    description: p.description ?? null,
    modules: p.modules ?? null,
    teachers: p.teachers ?? null,
  };
}

function productRow(p: ProductSeed, i: number) {
  return {
    id: `mirror-prod-${i + 1}`,
    slug: p.slug,
    title: p.title,
    category: p.category,
    price: p.price,
    stock: p.stock,
    variants_json: p.variants_json,
    description: null,
    images: null,
  };
}

function newsRow(n: NewsSeed, i: number) {
  return {
    id: `mirror-news-${i + 1}`,
    slug: n.slug,
    title: n.title,
    excerpt: n.excerpt,
    body: n.body,
    published_at: n.published_at,
  };
}

const PROGRAMS = PROGRAMS_SEED.map(programRow);
const PRODUCTS = PRODUCTS_SEED.map(productRow);
const NEWS = NEWS_SEED.map(newsRow);

const PAGE_HOME = {
  slug: "home",
  title: "Клуб выпускников факультета права Вышки",
  blocks: {
    hero: {
      title_pre: "Клуб выпускников",
      title_accent: "факультета права",
      subtitle: "Личный кабинет со статусом, скидка на программы ДПО, события клуба и однокурсники.",
      cta_primary: "Вступить в клуб",
      history_title: "История клуба",
    },
    cta: {
      title: "Присоединяйтесь",
      text: "На зеркале вход и заявки отключены – это публичная витрина.",
      button: "О клубе",
    },
  },
};

const TIMELINE = [
  { id: "t1", year: "2024", title: "Запуск клуба", text: "Первый набор выпускников и старт кабинета.", metric: "старт", sort: 1 },
  { id: "t2", year: "2025", title: "Витрины ДПО и мерча", text: "Скидка выпускника в каталоге и фирменный мерч.", metric: "витрины", sort: 2 },
  { id: "t3", year: "2026", title: "События и подкасты", text: "Афиша встреч и подкасты клуба.", metric: "сообщество", sort: 3 },
];

const EVENTS = [
  {
    id: "mirror-ev-1",
    title: "Встреча выпусков",
    description: "Нетворкинг и анонсы программ. На зеркале запись недоступна.",
    starts_at: "2026-10-15T16:00:00.000Z",
    location: "Москва, Мясницкая 20",
    cover: null,
    reg_url: null,
    format: "offline" as const,
    points: 20,
    status: "published",
    going: 12,
    my_rsvp: false,
    my_attended: false,
  },
  {
    id: "mirror-ev-2",
    title: "Онлайн-разбор практики",
    description: "Открытая встреча с преподавателем ДПО.",
    starts_at: "2026-11-05T15:00:00.000Z",
    location: null,
    cover: null,
    reg_url: null,
    format: "online" as const,
    points: 15,
    status: "published",
    going: 8,
    my_rsvp: false,
    my_attended: false,
  },
];

const PODCASTS = {
  items: [
    {
      id: "mirror-pod-1",
      title: "Пилотный выпуск",
      description: "О клубе и скидке выпускника. На зеркале без аудиофайла.",
      cover: null,
      duration: "12:00",
      is_free: true,
      audio_url: null,
      video_url: null,
    },
  ],
  subscribed: false,
  sub_until: null,
  price: PODCAST_SUB_PRICE_KOP,
};

const EMPTY_CART = { items: [], count: 0, subtotal: 0 };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, status);
}

/** Разбор pathname → путь API без префикса /api. */
function apiPathFromUrl(raw: string): string | null {
  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    return null;
  }
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || "/";
  }
  if (!pathname.startsWith("/api")) return null;
  const rest = pathname.slice(4) || "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

function mirrorGet(path: string): Response | null {
  const clean = path.split("?")[0] ?? path;
  const q = path.includes("?") ? new URLSearchParams(path.split("?")[1]) : null;

  if (clean === "/programs") return jsonResponse(PROGRAMS);
  {
    const m = /^\/programs\/([^/]+)$/.exec(clean);
    if (m) {
      const row = PROGRAMS.find((p) => p.slug === m[1]);
      return row ? jsonResponse(row) : errorResponse(404, "Не найдено");
    }
  }
  if (clean === "/products") return jsonResponse(PRODUCTS);
  if (clean === "/news") {
    const limit = q?.get("limit");
    const list = limit ? NEWS.slice(0, Number(limit) || NEWS.length) : NEWS;
    return jsonResponse(list);
  }
  {
    const m = /^\/news\/([^/]+)$/.exec(clean);
    if (m) {
      const row = NEWS.find((n) => n.slug === m[1]);
      return row ? jsonResponse(row) : errorResponse(404, "Не найдено");
    }
  }
  if (clean === "/pages/home") return jsonResponse(PAGE_HOME);
  {
    const m = /^\/pages\/([^/]+)$/.exec(clean);
    if (m) return m[1] === "home" ? jsonResponse(PAGE_HOME) : errorResponse(404, "Не найдено");
  }
  if (clean === "/timeline") return jsonResponse(TIMELINE);
  if (clean === "/events") return jsonResponse(EVENTS);
  if (clean === "/podcasts") return jsonResponse(PODCASTS);
  if (clean === "/payments/config") return jsonResponse({ enabled: false });
  if (clean === "/support/config") {
    return jsonResponse({
      enabled: false,
      draft: true,
      consent: "На зеркале обращения не принимаются.",
      version: "mirror",
      retentionDays: 0,
    });
  }
  if (clean === "/cart") return jsonResponse(EMPTY_CART);
  if (clean === "/health" || clean === "/ready") return jsonResponse({ ok: true, mirror: true });

  // Авторизованные и прочие GET на зеркале – пусто/запрет без утечки.
  if (clean === "/me" || clean.startsWith("/me/") || clean.startsWith("/admin")) {
    return errorResponse(401, MIRROR_UNAVAILABLE);
  }

  return errorResponse(404, MIRROR_UNAVAILABLE);
}

/**
 * Перехват fetch(/api/…) в режиме зеркала.
 * Вызывать один раз из main.tsx до рендера приложения.
 */
export function installMirrorFetch(): void {
  if (!isMirror || typeof window === "undefined") return;
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
    const apiPath = apiPathFromUrl(url);

    if (apiPath != null) {
      if (method === "GET" || method === "HEAD") {
        const res = mirrorGet(apiPath);
        if (res) return method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
      }
      // Мутации и аналитика – отказ без сети.
      if (
        apiPath.startsWith("/analytics") ||
        apiPath.startsWith("/support/faq-event") ||
        method !== "GET"
      ) {
        return errorResponse(503, MIRROR_UNAVAILABLE);
      }
      return errorResponse(404, MIRROR_UNAVAILABLE);
    }

    // Статика с ведущим /content|/assets – на project Pages нужна база.
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin === window.location.origin) {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        if (base && (u.pathname.startsWith("/content/") || u.pathname.startsWith("/assets/") || u.pathname.startsWith("/fonts/"))) {
          if (!u.pathname.startsWith(`${base}/`) && u.pathname !== base) {
            u.pathname = `${base}${u.pathname}`;
            return realFetch(u.toString(), init);
          }
        }
      }
    } catch {
      /* fall through */
    }

    return realFetch(input, init);
  };
}
