import { useMemo, useState, type CSSProperties } from "react";

/**
 * Админка клуба выпускников — порт дизайна «Админка.dc.html» (Claude Design) в React.
 * Поведение и стиль 1:1 с исходником: разделы, таблицы, модалка заявки, редактор блоков.
 * Данные — мок (как в дизайне). Подключение к Directus/apps/api — Фаза 4.
 */

type ReqStatus = "Новая" | "В работе" | "Подтверждена" | "Отклонена";
type Request = {
  type: "ДПО" | "Одежда" | "Верификация";
  client: string;
  item: string;
  phone: string;
  email: string;
  date: string;
  status: ReqStatus;
};
type Row = { name: string; meta: string; status: "Опубликовано" | "Черновик" };
type Block = { name: string; type: string; visible: boolean };
type TableKey = "news" | "programs" | "products";
type Section = "overview" | "requests" | TableKey | "pages";

const mono: CSSProperties = { fontFamily: "'Martian Mono', monospace" };
const card: CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, padding: 22 };

function stStyle(s: string): { bg: string; color: string } {
  const map: Record<string, [string, string]> = {
    Новая: ["rgba(236,90,19,.14)", "#C9450E"],
    "В работе": ["rgba(46,111,174,.14)", "#2E6FAE"],
    Подтверждена: ["rgba(31,138,91,.14)", "#1F8A5B"],
    Отклонена: ["rgba(181,51,27,.12)", "#B5331B"],
    Опубликовано: ["rgba(31,138,91,.14)", "#1F8A5B"],
    Черновик: ["rgba(107,114,128,.14)", "#6B7280"],
  };
  const c = map[s] ?? map["Черновик"]!;
  return { bg: c[0], color: c[1] };
}
function typeStyle(t: string): { bg: string; color: string } {
  if (t === "ДПО") return { bg: "rgba(17,41,107,.1)", color: "#11296B" };
  if (t === "Одежда") return { bg: "rgba(236,90,19,.14)", color: "#C9450E" };
  return { bg: "rgba(196,154,69,.18)", color: "#a07d2e" };
}

const pill = (bg: string, color: string): CSSProperties => ({
  ...mono,
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 999,
  background: bg,
  color,
});

const INITIAL_REQUESTS: Request[] = [
  { type: "ДПО", client: "Анна Соколова", item: "Юрист в сфере договорного права", phone: "+7 905 123-45-67", email: "a.sokolova@mail.ru", date: "24 июн", status: "Новая" },
  { type: "Одежда", client: "Иван Петров", item: "Худи (M, графит) ×1", phone: "+7 916 800-11-22", email: "i.petrov@mail.ru", date: "24 июн", status: "Новая" },
  { type: "Верификация", client: "Мария Климова", item: "Подтверждение выпуска 2025", phone: "+7 903 444-55-66", email: "m.klimova@mail.ru", date: "23 июн", status: "Новая" },
  { type: "ДПО", client: "Сергей Лосев", item: "Медиация и конфликтология", phone: "+7 921 777-88-99", email: "s.losev@mail.ru", date: "22 июн", status: "В работе" },
  { type: "Одежда", client: "Ольга Власова", item: "Шоппер ×2", phone: "+7 909 222-33-44", email: "o.vlasova@mail.ru", date: "21 июн", status: "Подтверждена" },
  { type: "Верификация", client: "Дмитрий Орлов", item: "Подтверждение выпуска 2024", phone: "+7 985 111-00-99", email: "d.orlov@mail.ru", date: "20 июн", status: "Подтверждена" },
];
const INITIAL_NEWS: Row[] = [
  { name: "Новый набор ДПО осенью", meta: "24 июн", status: "Опубликовано" },
  { name: "Встреча выпусков ’24 и ’25", meta: "18 июн", status: "Опубликовано" },
  { name: "Новые бейджи в кабинете", meta: "05 июн", status: "Черновик" },
];
const INITIAL_PROGRAMS: Row[] = [
  { name: "Юрист в сфере договорного права", meta: "30 000 ₽", status: "Опубликовано" },
  { name: "Медиация и конфликтология", meta: "30 000 ₽", status: "Опубликовано" },
  { name: "Практика применения ИИ в юриспруденции", meta: "35 000 ₽", status: "Черновик" },
];
const INITIAL_PRODUCTS: Row[] = [
  { name: "Худи с логотипом факультета", meta: "4 200 ₽ · 18 шт.", status: "Опубликовано" },
  { name: "Шоппер с Фемидой", meta: "1 200 ₽ · 30 шт.", status: "Опубликовано" },
  { name: "Мантия выпускника", meta: "6 900 ₽ · 6 шт.", status: "Черновик" },
];
const INITIAL_BLOCKS: Block[] = [
  { name: "Hero — сборка Фемиды", type: "hero", visible: true },
  { name: "Маркиза выпусков", type: "marquee", visible: true },
  { name: "История клуба", type: "timeline", visible: true },
  { name: "Витрины (ДПО / Одежда)", type: "showcase", visible: true },
  { name: "Зачем вступать", type: "features", visible: false },
  { name: "Новости", type: "news", visible: true },
];

const TITLES: Record<Section, string> = {
  overview: "Обзор", requests: "Заявки и заказы", news: "Новости",
  programs: "Программы ДПО", products: "Товары", pages: "Редактор страниц",
};
const CREATE_LABELS: Partial<Record<Section, string>> = { news: "Новость", programs: "Программу", products: "Товар" };
const COL_HEAD: Record<TableKey, [string, string]> = {
  news: ["Заголовок", "Дата"], programs: ["Программа", "Цена"], products: ["Товар", "Цена · остаток"],
};

// Компактный фасеточный знак Фемиды для шапки сайдбара.
function Mark() {
  return (
    <svg width={38} height={38} viewBox="0 0 40 40" style={{ borderRadius: 9, flex: "none" }} aria-label="Логотип">
      <rect width="40" height="40" rx="9" fill="#11296B" />
      <polygon points="20,5 27,12 20,19 13,12" fill="#EC5A13" />
      <polygon points="20,19 27,12 31,27 20,35" fill="#2E6FAE" />
      <polygon points="20,19 13,12 9,27 20,35" fill="#C9450E" />
      <rect x="12" y="16.5" width="16" height="3" rx="1.5" fill="#C49A45" />
    </svg>
  );
}

export default function AdminApp() {
  const [section, setSection] = useState<Section>("overview");
  const [sel, setSel] = useState<number | null>(null);
  const [requests, setRequests] = useState<Request[]>(INITIAL_REQUESTS);
  const [tables, setTables] = useState<Record<TableKey, Row[]>>({
    news: INITIAL_NEWS, programs: INITIAL_PROGRAMS, products: INITIAL_PRODUCTS,
  });
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);

  const setStatus = (idx: number, status: ReqStatus) =>
    setRequests((rs) => rs.map((r, i) => (i === idx ? { ...r, status } : r)));
  const delRow = (key: TableKey, i: number) =>
    setTables((t) => ({ ...t, [key]: t[key].filter((_, k) => k !== i) }));
  const togglePub = (key: TableKey, i: number) =>
    setTables((t) => ({
      ...t,
      [key]: t[key].map((r, k) =>
        k === i ? { ...r, status: r.status === "Опубликовано" ? "Черновик" : "Опубликовано" } : r,
      ),
    }));
  const moveBlock = (i: number, d: number) =>
    setBlocks((b) => {
      const j = i + d;
      if (j < 0 || j >= b.length) return b;
      const next = b.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const toggleBlock = (i: number) =>
    setBlocks((b) => b.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));
  const create = (key: TableKey) =>
    setTables((t) => ({ ...t, [key]: [{ name: "Новая запись (черновик)", meta: "—", status: "Черновик" }, ...t[key]] }));

  const newCount = useMemo(() => requests.filter((r) => r.status === "Новая").length, [requests]);
  const verifNew = requests.filter((r) => r.type === "Верификация" && r.status === "Новая").length;
  const tableKey: TableKey | null =
    section === "news" || section === "programs" || section === "products" ? section : null;

  const navDef: { key: Section; label: string; badge?: number }[] = [
    { key: "overview", label: "Обзор" },
    { key: "requests", label: "Заявки и заказы", badge: newCount },
    { key: "news", label: "Новости" },
    { key: "programs", label: "Программы ДПО" },
    { key: "products", label: "Товары" },
    { key: "pages", label: "Страницы" },
  ];

  const stats = [
    { label: "Новые заявки", value: newCount, color: "#EC5A13", note: "требуют ответа" },
    { label: "Заказы сегодня", value: requests.filter((r) => r.date === "24 июн" && r.type !== "Верификация").length, color: "#11296B", note: "ДПО и одежда" },
    { label: "На верификацию", value: verifNew, color: "#a07d2e", note: "подтвердить выпуск" },
    { label: "Активность", value: "+18%", color: "#1F8A5B", note: "к прошлой неделе" },
  ];

  const verifs = requests
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.type === "Верификация");

  const sr = sel != null ? requests[sel] : null;

  const RequestRow = ({ r, i, compact }: { r: Request; i: number; compact?: boolean }) => {
    const ts = typeStyle(r.type);
    const ss = stStyle(r.status);
    if (compact) {
      return (
        <button onClick={() => setSel(i)} className="arow foc" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #f0ece2", cursor: "pointer", padding: "13px 4px", fontFamily: "'Onest'" }}>
          <span style={{ ...pill(ts.bg, ts.color), fontSize: 10, padding: "3px 8px", flex: "none" }}>{r.type}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{r.client}</span>
            <span style={{ color: "#9aa0aa", fontSize: 13 }}> · {r.item}</span>
          </span>
          <span style={{ ...pill(ss.bg, ss.color), flex: "none" }}>{r.status}</span>
        </button>
      );
    }
    return (
      <button onClick={() => setSel(i)} className="arow foc" style={{ display: "grid", gridTemplateColumns: "96px 1fr 1fr 92px 130px", gap: 12, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #f0ece2", cursor: "pointer", padding: "15px 22px", fontFamily: "'Onest'" }}>
        <span><span style={{ ...pill(ts.bg, ts.color), fontSize: 10, padding: "3px 8px" }}>{r.type}</span></span>
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 0 }}>{r.client}</span>
        <span style={{ color: "#6B7280", fontSize: 13, minWidth: 0 }}>{r.item}</span>
        <span style={{ ...mono, fontSize: 12, color: "#9aa0aa" }}>{r.date}</span>
        <span><span style={pill(ss.bg, ss.color)}>{r.status}</span></span>
      </button>
    );
  };

  return (
    <div className="a-shell" style={{ display: "grid", gridTemplateColumns: "248px 1fr", minHeight: "100vh", background: "#FBF3E8", color: "#14181F", fontFamily: "'Onest', system-ui, sans-serif" }}>
      {/* SIDEBAR */}
      <aside className="a-side" style={{ position: "sticky", top: 0, height: "100vh", background: "#14181F", color: "#FBF3E8", display: "flex", flexDirection: "column", padding: "22px 16px", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 18px" }}>
          <Mark />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 14 }}>Админка</div>
            <div style={{ ...mono, fontSize: 9, color: "#8a93a3", letterSpacing: ".06em", marginTop: 3 }}>клуб выпускников</div>
          </div>
        </div>
        {navDef.map((n) => {
          const active = section === n.key;
          return (
            <button key={n.key} onClick={() => setSection(n.key)} className="foc" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: "'Onest'", fontWeight: 600, fontSize: 14, padding: "11px 13px", borderRadius: 11, background: active ? "rgba(236,90,19,.18)" : "transparent", color: active ? "#FBF3E8" : "#c8cdd6" }}>
              <span>{n.label}</span>
              {n.badge ? (
                <span style={{ ...mono, fontSize: 11, background: "#EC5A13", color: "#FBF3E8", borderRadius: 999, minWidth: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{n.badge}</span>
              ) : null}
            </button>
          );
        })}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid rgba(251,243,232,.1)" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#2E6FAE,#11296B)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 13, flex: "none" }}>О</div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Учебный офис</div>
            <div style={{ ...mono, fontSize: 10, color: "#8a93a3" }}>админ</div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ padding: "30px 34px 70px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "-0.01em", margin: 0 }}>{TITLES[section]}</h1>
          {tableKey ? (
            <button onClick={() => create(tableKey)} className="foc" style={{ fontFamily: "'Onest'", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 11, border: "none", background: "#EC5A13", color: "#FBF3E8", cursor: "pointer" }}>+ {CREATE_LABELS[section]}</button>
          ) : null}
        </div>

        {/* OVERVIEW */}
        {section === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 18 }}>
              {stats.map((s) => (
                <div key={s.label} style={card}>
                  <div style={{ ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".05em" }}>{s.label}</div>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 38, letterSpacing: "-0.02em", marginTop: 10, color: s.color }}>{s.value}</div>
                  <div style={{ ...mono, fontSize: 11, color: "#9aa0aa", marginTop: 6 }}>{s.note}</div>
                </div>
              ))}
            </div>

            <div className="a-shell" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 24 }}>
              <div style={{ ...card, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>Последние заявки</div>
                  <button onClick={() => setSection("requests")} className="foc" style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, color: "#2E6FAE", fontSize: 13 }}>Все →</button>
                </div>
                {requests.slice(0, 4).map((r, i) => (
                  <RequestRow key={i} r={r} i={i} compact />
                ))}
              </div>
              <div style={{ ...card, padding: 24 }}>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em", marginBottom: 6 }}>На верификацию</div>
                {verifs.map((x) => {
                  const pending = x.r.status === "Новая";
                  return (
                    <div key={x.i} style={{ borderTop: "1px solid #f0ece2", padding: "14px 0" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{x.r.client}</div>
                      <div style={{ ...mono, fontSize: 11, color: "#9aa0aa", marginTop: 4 }}>{x.r.item}</div>
                      {pending ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                          <button onClick={() => setStatus(x.i, "Подтверждена")} className="foc" style={{ flex: 1, fontFamily: "'Onest'", fontWeight: 600, fontSize: 13, padding: 8, borderRadius: 9, border: "none", background: "#1F8A5B", color: "#fff", cursor: "pointer" }}>Подтвердить</button>
                          <button onClick={() => setStatus(x.i, "Отклонена")} className="foc" style={{ flex: 1, fontFamily: "'Onest'", fontWeight: 600, fontSize: 13, padding: 8, borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", color: "#B5331B", cursor: "pointer" }}>Отклонить</button>
                        </div>
                      ) : (
                        <div style={{ ...mono, fontSize: 11, marginTop: 9, color: x.r.status === "Подтверждена" ? "#1F8A5B" : "#B5331B" }}>
                          {x.r.status === "Подтверждена" ? "✓ подтверждено" : "✕ отклонено"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* REQUESTS TABLE */}
        {section === "requests" && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "96px 1fr 1fr 92px 130px", gap: 12, padding: "14px 22px", background: "#FBF7EF", ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".05em", textTransform: "uppercase" }}>
              <span>Тип</span><span>Клиент</span><span>Позиция</span><span>Дата</span><span>Статус</span>
            </div>
            {requests.map((r, i) => (
              <RequestRow key={i} r={r} i={i} />
            ))}
          </div>
        )}

        {/* CRUD TABLE */}
        {tableKey && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 130px 150px", gap: 12, padding: "14px 22px", background: "#FBF7EF", ...mono, fontSize: 11, color: "#6B7280", letterSpacing: ".05em", textTransform: "uppercase" }}>
              <span>{COL_HEAD[tableKey][0]}</span><span>{COL_HEAD[tableKey][1]}</span><span>Статус</span><span style={{ textAlign: "right" }}>Действия</span>
            </div>
            {tables[tableKey].map((t, i) => {
              const ss = stStyle(t.status);
              return (
                <div key={i} className="arow" style={{ display: "grid", gridTemplateColumns: "1fr 150px 130px 150px", gap: 12, alignItems: "center", borderTop: "1px solid #f0ece2", padding: "15px 22px" }}>
                  <span style={{ fontWeight: 600, fontSize: 14, minWidth: 0 }}>{t.name}</span>
                  <span style={{ ...mono, fontSize: 13, color: "#6B7280" }}>{t.meta}</span>
                  <span><span style={pill(ss.bg, ss.color)}>{t.status}</span></span>
                  <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => togglePub(tableKey, i)} className="foc" title="Публикация" style={{ border: "1.5px solid #E5E7EB", background: "#fff", borderRadius: 9, padding: "7px 11px", cursor: "pointer", ...mono, fontSize: 11, color: "#14181F" }}>{t.status === "Опубликовано" ? "Снять" : "Опубл."}</button>
                    <button onClick={() => delRow(tableKey, i)} className="foc" title="Удалить" style={{ border: "1.5px solid #E5E7EB", background: "#fff", borderRadius: 9, padding: "7px 10px", cursor: "pointer", color: "#B5331B", fontSize: 13 }}>✕</button>
                  </span>
                </div>
              );
            })}
            {tables[tableKey].length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#9aa0aa", fontSize: 14 }}>Пусто — нажмите «Создать», чтобы добавить запись.</div>
            )}
          </div>
        )}

        {/* PAGE BLOCK EDITOR */}
        {section === "pages" && (
          <>
            <p style={{ color: "#6B7280", fontSize: 15, margin: "0 0 18px", maxWidth: 560 }}>Блоки главной страницы. Меняйте порядок стрелками, скрывайте ненужные.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680 }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: "16px 18px", opacity: b.visible ? 1 : 0.5 }}>
                  <span style={{ cursor: "grab", color: "#cdd2da", fontSize: 18, flex: "none", letterSpacing: -2 }}>⠿</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{b.name}</div>
                    <div style={{ ...mono, fontSize: 11, color: "#9aa0aa", marginTop: 3 }}>{b.type}</div>
                  </div>
                  <span style={{ ...mono, fontSize: 11, flex: "none", color: b.visible ? "#1F8A5B" : "#9aa0aa" }}>{b.visible ? "виден" : "скрыт"}</span>
                  <div style={{ display: "flex", gap: 6, flex: "none" }}>
                    <button onClick={() => moveBlock(i, -1)} className="foc" title="Выше" style={{ width: 32, height: 32, border: "1.5px solid #E5E7EB", background: "#fff", borderRadius: 9, cursor: "pointer", color: "#14181F" }}>↑</button>
                    <button onClick={() => moveBlock(i, 1)} className="foc" title="Ниже" style={{ width: 32, height: 32, border: "1.5px solid #E5E7EB", background: "#fff", borderRadius: 9, cursor: "pointer", color: "#14181F" }}>↓</button>
                    <button onClick={() => toggleBlock(i)} className="foc" title="Скрыть/показать" style={{ width: 32, height: 32, border: "1.5px solid #E5E7EB", borderRadius: 9, cursor: "pointer", background: b.visible ? "rgba(31,138,91,.12)" : "#fff", color: b.visible ? "#1F8A5B" : "#cdd2da" }}>◉</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* REQUEST DETAIL MODAL */}
      {sr && sel != null && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,18,24,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 460, background: "#fff", borderRadius: 22, padding: 30, boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)", animation: "g-pop .26s cubic-bezier(.2,.8,.2,1)" }}>
            <button onClick={() => setSel(null)} className="foc" style={{ position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 15 }}>✕</button>
            <span style={pill(typeStyle(sr.type).bg, typeStyle(sr.type).color)}>{sr.type}</span>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 600, fontSize: 22, letterSpacing: "-0.01em", marginTop: 14, lineHeight: 1.2 }}>{sr.client}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, border: "1px solid #E5E7EB", borderRadius: 13, overflow: "hidden", marginTop: 18 }}>
              {[
                { k: "Позиция", v: sr.item, mono: false, alt: false },
                { k: "Телефон", v: sr.phone, mono: true, alt: true },
                { k: "Email", v: sr.email, mono: true, alt: false },
                { k: "Дата", v: sr.date, mono: true, alt: true },
              ].map((row) => (
                <div key={row.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 15px", background: row.alt ? "#FBF7EF" : "#fff" }}>
                  <span style={{ ...mono, fontSize: 12, color: "#6B7280" }}>{row.k}</span>
                  <span style={{ ...(row.mono ? mono : {}), fontSize: 13, fontWeight: row.mono ? 400 : 500, textAlign: "right" }}>{row.v}</span>
                </div>
              ))}
            </div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".1em", color: "#6B7280", textTransform: "uppercase", marginTop: 20 }}>Статус заявки</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {(["Новая", "В работе", "Подтверждена", "Отклонена"] as ReqStatus[]).map((s) => {
                const active = sr.status === s;
                const ss = stStyle(s);
                return (
                  <button key={s} onClick={() => setStatus(sel, s)} className="foc" style={{ fontFamily: "'Onest'", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${active ? ss.color : "#E5E7EB"}`, background: active ? ss.color : "#fff", color: active ? "#fff" : ss.color, cursor: "pointer" }}>{s}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
