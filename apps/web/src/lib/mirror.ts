/**
 * Статические ответы «API» для публичного зеркала на GitHub Pages.
 * Витрина + демо ЛК + демо админки без бэкенда (сиды и фикстуры).
 */
import {
  ACHIEVEMENTS,
  NEWS_SEED,
  PRODUCTS_SEED,
  PROGRAMS_SEED,
  PODCAST_SUB_PRICE_KOP,
  computeLevel,
  type ProgramSeed,
  type ProductSeed,
  type NewsSeed,
} from "@club/shared";
import { isMirror } from "./public-url.js";

const MIRROR_MUTATION = "На зеркале сохранение отключено – это демо-витрина.";
const MIRROR_ALUMNI_TOKEN = "mirror-alumni";
const MIRROR_ADMIN_TOKEN = "mirror-admin";

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
    source_url: null as string | null,
    dates: p.dates ?? null,
    document: p.document ?? null,
    description: p.description ?? null,
    modules: p.modules ?? null,
    teachers: p.teachers ?? null,
    status: "published",
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
    description: null as string | null,
    images: p.images?.length ? p.images : null,
    status: "published",
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
    status: "published",
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
      text: "На зеркале данные демо: кабинет и админка открыты для просмотра.",
      button: "О клубе",
    },
  },
};

const TIMELINE = [
  { id: "t1", year: "2024", title: "Запуск клуба", text: "Первый набор выпускников и старт кабинета.", metric: "старт", sort: 1, status: "published" },
  { id: "t2", year: "2025", title: "Витрины ДПО и мерча", text: "Скидка выпускника в каталоге и фирменный мерч.", metric: "витрины", sort: 2, status: "published" },
  { id: "t3", year: "2026", title: "События и подкасты", text: "Афиша встреч и подкасты клуба.", metric: "сообщество", sort: 3, status: "published" },
];

const EVENTS = [
  {
    id: "mirror-ev-1",
    title: "Встреча выпусков",
    description: "Нетворкинг и анонсы программ.",
    starts_at: "2026-10-15T16:00:00.000Z",
    location: "Москва, Мясницкая 20",
    cover: null as string | null,
    reg_url: null as string | null,
    format: "offline" as const,
    points: 20,
    status: "published",
    going: 12,
    my_rsvp: true,
    my_attended: false,
    rsvps: [
      { id: "rsvp-1", fio: "Анна Соколова", attended: false },
      { id: "rsvp-2", fio: "Игорь Кондратьев", attended: true },
    ],
  },
  {
    id: "mirror-ev-2",
    title: "Онлайн-разбор практики",
    description: "Открытая встреча с преподавателем ДПО.",
    starts_at: "2026-11-05T15:00:00.000Z",
    location: null as string | null,
    cover: null as string | null,
    reg_url: null as string | null,
    format: "online" as const,
    points: 15,
    status: "published",
    going: 8,
    my_rsvp: false,
    my_attended: false,
    rsvps: [],
  },
];

const PODCASTS = {
  items: [
    {
      id: "mirror-pod-1",
      title: "Пилотный выпуск",
      description: "О клубе и скидке выпускника.",
      cover: null as string | null,
      duration: "12:00",
      is_free: true,
      audio_url: null as string | null,
      video_url: null as string | null,
      sort: 1,
      status: "published",
    },
  ],
  subscribed: true,
  sub_until: "2027-06-01T00:00:00.000Z",
  price: PODCAST_SUB_PRICE_KOP,
};

const EMPTY_CART = { items: [] as unknown[], count: 0, subtotal: 0 };

const DEMO_POINTS = 320;
const DEMO_LEVEL = computeLevel(DEMO_POINTS);

const ME = {
  alumni: {
    fio: "Анна Соколова",
    cohort: "2024",
    verification_status: "verified",
    contacts: { phone: "+79001234567", telegram: "@a_sokolova" },
    edu_program: "Юриспруденция",
    edu_level: "бакалавриат",
    interests: ["гражданское право", "арбитраж"],
    avatar: null as string | null,
    referral_code: "ANNA2024",
    referrals_verified: 1,
    referrals_pending: 0,
  },
  level: DEMO_LEVEL,
  achievements: ACHIEVEMENTS.map((a, i) => ({
    key: a.key,
    title: a.title,
    description: a.description,
    earned: i < 3,
    current: i < 3 ? a.rule_json.gte : Math.max(0, a.rule_json.gte - 1),
    target: a.rule_json.gte,
    icon: a.icon,
    kind: a.kind,
    star: !!a.star,
  })),
  activity: [
    { month: "2026-07", points: 80 },
    { month: "2026-08", points: 120 },
    { month: "2026-09", points: 120 },
  ],
};

const LEDGER = [
  { id: "led-1", delta: 100, reason: "program", ref: "legal-english-mastery", comment: "Завершение программы", created_at: "2026-08-12T10:00:00.000Z" },
  { id: "led-2", delta: 60, reason: "event", ref: "mirror-ev-1", comment: "Встреча выпусков", created_at: "2026-07-20T18:00:00.000Z" },
  { id: "led-3", delta: 80, reason: "referral", ref: null, comment: "Приглашённый верифицирован", created_at: "2026-06-01T09:00:00.000Z" },
];

const MY_ORDERS = [
  {
    number: "CL-1001",
    type: "dpo",
    status: "confirmed",
    payment_status: null as string | null,
    fulfillment: "digital",
    subtotal: 4_500_000,
    member_discount: 10,
    total_estimate: 4_050_000,
    created_at: "2026-08-01T12:00:00.000Z",
    items_json: [{ type: "dpo" as const, ref_id: "legal-english-mastery", variant_sku: null, qty: 1, price: 4_500_000, title: "Мастерство юридического английского" }],
  },
  {
    number: "CL-1002",
    type: "merch",
    status: "new",
    payment_status: null as string | null,
    fulfillment: "pickup",
    subtotal: 420_000,
    member_discount: 0,
    total_estimate: 420_000,
    created_at: "2026-09-05T15:30:00.000Z",
    items_json: [{ type: "merch" as const, ref_id: "hoodie-faculty", variant_sku: "hoodie-graphite-M", qty: 1, price: 420_000, title: "Худи с логотипом факультета" }],
  },
];

const CLASSMATES = [
  {
    id: "mate-1",
    fio: "Игорь Кондратьев",
    cohort: "2024",
    edu_program: "Юриспруденция",
    edu_level: "бакалавриат",
    level_title: "Друг клуба",
    interests: ["уголовное право"],
    avatar: null as string | null,
    match: "cohort" as const,
    friend_status: "accepted" as const,
  },
  {
    id: "mate-2",
    fio: "Мария Лебедева",
    cohort: "2024",
    edu_program: "Юриспруденция",
    edu_level: "бакалавриат",
    level_title: "Выпускник",
    interests: ["налоговое право", "МЧП"],
    avatar: null as string | null,
    match: "both" as const,
    friend_status: "incoming" as const,
  },
];

const LK_EVENTS = [
  { kind: "friend_request" as const, from_id: "mate-2", from_fio: "Мария Лебедева", created_at: "2026-09-08T10:00:00.000Z" },
  { kind: "order_status" as const, number: "CL-1002", status: "new", paid: false, created_at: "2026-09-05T15:30:00.000Z" },
];

const ADMIN_ORDERS = MY_ORDERS.map((o, i) => ({
  id: `ord-${i + 1}`,
  number: o.number,
  type: o.type,
  contact_fio: "Анна Соколова",
  contact_phone: "+79001234567",
  contact_email: "alumni@club.example.com",
  fulfillment: o.fulfillment,
  status: o.status,
  payment_status: o.payment_status,
  subtotal: o.subtotal,
  total_estimate: o.total_estimate,
  created_at: o.created_at,
  items_json: o.items_json?.map((x) => ({ title: x.title, qty: x.qty, variant_sku: x.variant_sku })),
  address: null as string | null,
  comment: null as string | null,
}));

const MEMBERS = [
  {
    id: "mem-1",
    fio: "Анна Соколова",
    cohort: "2024",
    status: "active",
    verification_status: "verified",
    points_cached: DEMO_POINTS,
    level_cached: DEMO_LEVEL.key,
    personal_discount: 0,
    friends_count: 1,
    podcast_active: true,
    duplicate: false,
    email: "alumni@club.example.com",
    edu_level: "бакалавриат",
    edu_program: "Юриспруденция",
    interests_json: ["гражданское право"],
    contacts_json: { telegram: "@a_sokolova" },
    joined_at: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "mem-2",
    fio: "Игорь Кондратьев",
    cohort: "2024",
    status: "active",
    verification_status: "pending",
    points_cached: 40,
    level_cached: "graduate",
    personal_discount: 0,
    friends_count: 1,
    podcast_active: false,
    duplicate: false,
    email: "igor@club.example.com",
    edu_level: "бакалавриат",
    edu_program: "Юриспруденция",
    interests_json: [],
    contacts_json: {},
    joined_at: "2026-08-20T10:00:00.000Z",
  },
];

function daysSeries(n: number, seed: number): Array<{ day: string; count: number }> {
  const out: Array<{ day: string; count: number }> = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: (seed + i * 3) % 7 });
  }
  return out;
}

function analytics(range: string) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const joins = daysSeries(days, 1);
  const orders = daysSeries(days, 2);
  const pageviews = daysSeries(days, 4);
  return {
    range,
    since: new Date(Date.now() - days * 86400000).toISOString(),
    generated_at: new Date().toISOString(),
    pulse: {
      joins: joins.reduce((s, x) => s + x.count, 0),
      verified_in_range: 4,
      registers: 6,
      orders_created: 9,
      orders_new: 3,
      orders_paid: 2,
      rsvps: 14,
      podcast_plays: 22,
      achievements_granted: 5,
      friendships_new: 3,
      push_subs_new: 1,
      referrals_ledger: 2,
      referrals_alumni: 1,
      login_ok: 40,
      login_fail: 2,
      login_locked: 0,
      support_open: 1,
      support_created: 3,
    },
    snapshot: { alumni_count: 48, alumni_verified: 31, verified_ratio: 65 },
    orders: {
      by_type: [{ key: "dpo", count: 5 }, { key: "merch", count: 4 }],
      by_status: [{ key: "new", count: 3 }, { key: "confirmed", count: 4 }, { key: "done", count: 2 }],
      paid_sum_kop: 1_200_000,
      programs_top: [{ ref_id: PROGRAMS[0]?.id ?? "p", title: PROGRAMS[0]?.title ?? "ДПО", qty: 3, orders: 3 }],
    },
    community: {
      points_by_reason: [{ key: "event", count: 8 }, { key: "program", count: 3 }],
      achievements_top: [{ achievement_id: "a1", key: "first_step", title: "Первый шаг", count: 12 }],
    },
    engagement: {
      events_top: [{ event_id: "mirror-ev-1", title: "Встреча выпусков", rsvps: 12, attended: 7 }],
      podcasts_top: [{ podcast_id: "mirror-pod-1", title: "Пилотный выпуск", plays: 22, listeners: 18 }],
    },
    support: {
      open: 1,
      created_in_range: 3,
      by_status: [{ status: "open", count: 1 }, { status: "answered", count: 2 }],
      by_topic: [{ topic: "account", count: 2 }, { topic: "order", count: 1 }],
    },
    series: { joins_by_day: joins, orders_by_day: orders, pageviews_by_day: pageviews },
    pageviews: {
      hits: pageviews.reduce((s, x) => s + x.count, 0),
      paths_top: [{ path: "/", count: 40 }, { path: "/dpo", count: 22 }, { path: "/lk", count: 15 }],
    },
  };
}

const OVERVIEW = {
  new_orders: 3,
  orders_count: ADMIN_ORDERS.length,
  orders_paid: 1,
  pending_verifications: 1,
  alumni_count: MEMBERS.length,
  alumni_verified: 1,
  points_total: DEMO_POINTS + 40,
  programs_actual: PROGRAMS.length,
  programs_total: PROGRAMS.length,
  products_count: PRODUCTS.length,
  news_count: NEWS.length,
  friendships: 1,
  friend_requests: 1,
  podcasts_count: 1,
  podcast_subscribers: 1,
  push_subs_count: 2,
  next_event: { id: "mirror-ev-1", title: "Встреча выпусков", starts_at: EVENTS[0]!.starts_at, rsvps: 12 },
};

const AUDIT = [
  { id: "aud-1", event: "login.ok", actor: "admin:mirror", subject: null, detail: { mirror: true }, ip: null, created_at: new Date().toISOString() },
  { id: "aud-2", event: "order.create", actor: "alumni:mem-1", subject: "order:CL-1002", detail: {}, ip: null, created_at: "2026-09-05T15:30:00.000Z" },
];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, status);
}

function textResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType, "cache-control": "no-store" } });
}

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
  const [pathOnly, qs] = path.split("?");
  const clean = pathOnly ?? path;
  const q = qs ? new URLSearchParams(qs) : null;

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
  if (clean === "/pages/home" || clean === "/admin/pages/home") return jsonResponse(PAGE_HOME);
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
      enabled: true,
      draft: true,
      consent: "На зеркале обращения не сохраняются – только просмотр UI.",
      version: "mirror",
      retentionDays: 30,
    });
  }
  if (clean === "/cart") return jsonResponse(EMPTY_CART);
  if (clean === "/health" || clean === "/ready") return jsonResponse({ ok: true, mirror: true });

  // ── ЛК ──
  if (clean === "/me") return jsonResponse(ME);
  if (clean === "/me/ledger") return jsonResponse(LEDGER);
  if (clean === "/me/orders") return jsonResponse(MY_ORDERS);
  if (clean === "/me/classmates") return jsonResponse(CLASSMATES);
  if (clean === "/me/events") return jsonResponse(LK_EVENTS);
  if (clean === "/me/level") return jsonResponse(DEMO_LEVEL);

  // ── Админка ──
  if (clean === "/admin/overview") return jsonResponse(OVERVIEW);
  if (clean === "/admin/analytics") return jsonResponse(analytics(q?.get("range") || "30d"));
  if (clean === "/admin/analytics/export.csv") {
    return textResponse("metric,value\njoins,12\norders,9\n", "text/csv; charset=utf-8");
  }
  if (clean === "/admin/orders") {
    const page = Number(q?.get("page") || 1);
    const limit = Number(q?.get("limit") || 50);
    return jsonResponse({ items: ADMIN_ORDERS, total: ADMIN_ORDERS.length, page, limit });
  }
  if (clean === "/admin/orders/export.csv") {
    return textResponse("number,status,fio\nCL-1001,confirmed,Анна Соколова\n", "text/csv; charset=utf-8");
  }
  if (clean === "/admin/members") {
    const page = Number(q?.get("page") || 1);
    const page_size = Number(q?.get("limit") || 50);
    return jsonResponse({ items: MEMBERS, total: MEMBERS.length, page, page_size });
  }
  if (clean === "/admin/programs") return jsonResponse(PROGRAMS);
  if (clean === "/admin/products") return jsonResponse(PRODUCTS);
  if (clean === "/admin/news") return jsonResponse(NEWS);
  if (clean === "/admin/timeline") return jsonResponse(TIMELINE);
  if (clean === "/admin/events") return jsonResponse(EVENTS);
  if (clean === "/admin/podcasts") return jsonResponse(PODCASTS.items);
  if (clean === "/admin/podcast-subs") {
    return jsonResponse({ items: [{ alumni_id: "mem-1", fio: "Анна Соколова", until: "2027-06-01T00:00:00.000Z" }], total: 1 });
  }
  if (clean === "/admin/audit") return jsonResponse(AUDIT);
  if (clean === "/admin/support") {
    return jsonResponse([
      {
        id: "sup-1",
        topic: "account",
        status: "open",
        expires_at: "2026-10-01T00:00:00.000Z",
        messages: [{ author: "visitor", text: "Не могу войти в кабинет (демо).", at: "2026-09-09T12:00:00.000Z" }],
      },
    ]);
  }
  if (clean === "/admin/bot-status") {
    return jsonResponse({
      telegram: {
        username: "pravohse_alumni_bot",
        tokenConfigured: false,
        polling: false,
        link: "https://t.me/pravohse_alumni_bot",
      },
      siteFaq: {
        answers: 12,
        gaps: 3,
        note: "На зеркале FAQ локальный; Telegram-токен не подключён.",
        hits: { gap_hits: 2, none_hits: 1, by_gap: [{ gap_id: "membership", count: 2 }], by_channel: [{ channel: "site", count: 3 }] },
      },
      tickets: { enabled: true, draft: true, openApprox: 1 },
    });
  }

  return errorResponse(404, "На зеркале нет этого эндпоинта");
}

function mirrorMutation(path: string, method: string): Response {
  const clean = (path.split("?")[0] ?? path);

  if (clean === "/auth/login" || clean === "/auth/register") {
    return jsonResponse({ token: MIRROR_ALUMNI_TOKEN, alumni: ME.alumni });
  }
  if (clean === "/auth/admin-login") {
    return jsonResponse({ token: MIRROR_ADMIN_TOKEN, role: "admin" });
  }
  if (clean === "/auth/logout" || clean === "/auth/admin-logout") {
    return jsonResponse({ ok: true });
  }
  if (clean === "/cart" || clean.startsWith("/cart")) {
    return jsonResponse(EMPTY_CART);
  }
  if (clean === "/orders") {
    return jsonResponse({
      number: "CL-DEMO",
      status: "new",
      member_discount: 10,
      subtotal: 0,
      total_estimate: 0,
      notified: { channel: "mirror", ok: false, blocked: true },
    });
  }
  if (clean.startsWith("/admin/") || clean.startsWith("/me/") || clean.startsWith("/events/")) {
    // UI ждёт 200 на PATCH/POST – возвращаем мягкий ok, без реальной записи.
    return jsonResponse({ ok: true, mirror: true, message: MIRROR_MUTATION });
  }
  if (clean.startsWith("/analytics") || clean.startsWith("/support")) {
    return jsonResponse({ ok: true, mirror: true });
  }
  if (method === "DELETE") return jsonResponse({ ok: true, mirror: true });
  return errorResponse(503, MIRROR_MUTATION);
}

/** Демо-токены, чтобы /lk и /admin открывались сразу. */
export function seedMirrorSession(): void {
  if (!isMirror || typeof window === "undefined") return;
  try {
    if (!localStorage.getItem("club_token")) localStorage.setItem("club_token", MIRROR_ALUMNI_TOKEN);
    if (!localStorage.getItem("club_admin_token")) localStorage.setItem("club_admin_token", MIRROR_ADMIN_TOKEN);
  } catch {
    /* private mode */
  }
}

/**
 * Перехват fetch(/api/…) в режиме зеркала.
 * Вызывать один раз из main.tsx до рендера приложения.
 */
export function installMirrorFetch(): void {
  if (!isMirror || typeof window === "undefined") return;
  seedMirrorSession();
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
      } else {
        return mirrorMutation(apiPath, method);
      }
    }

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
