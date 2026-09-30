import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminReq } from "../lib/admin.js";
import { action, actionGhost, field } from "../styles/primitives.js";
import { topics, type Ticket } from "../pages/SupportV2.js";
import { mono, label, Panel, PanelTitle, Pill, Row } from "./ui.js";

type BotStatus = {
  telegram: {
    username: string;
    tokenConfigured: boolean;
    polling: boolean;
    link: string;
  };
  siteFaq: {
    answers: number;
    gaps: number;
    note: string;
    hits?: {
      gap_hits: number;
      none_hits: number;
      by_gap: Array<{ gap_id: string; count: number }>;
      by_channel: Array<{ channel: string; count: number }>;
    };
  };
  tickets: {
    enabled: boolean;
    draft: boolean;
    openApprox: number | null;
  };
};

type StatusFilter = "all" | "open" | "answered" | "closed";

const STATUS_RU: Record<string, string> = {
  open: "Ожидает ответа",
  answered: "Ответ отправлен",
  closed: "Закрыто",
};

function pillStatus(s: string): string {
  if (s === "open") return "pending";
  if (s === "answered") return "confirmed";
  return "closed";
}

function Reply({ ticket, refresh }: { ticket: Ticket; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (status: "answered" | "closed") => {
    setBusy(true);
    setError("");
    try {
      await adminReq("PATCH", `/admin/support/${ticket.id}`, {
        status,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setMessage("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details style={{ borderTop: "1px solid var(--c-line)" }}>
      <summary
        className="foc"
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto auto",
          gap: 12,
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {topics[ticket.topic] ?? ticket.topic}
          <span style={{ ...mono, fontSize: 11, color: "var(--c-text-3)", marginLeft: 10 }}>
            {ticket.id.slice(0, 8)}
          </span>
        </span>
        <span style={{ ...mono, fontSize: 11, color: "var(--c-text-3)" }}>
          {(() => {
            const at = ticket.messages[ticket.messages.length - 1]?.at ?? ticket.expires_at;
            return new Date(at).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          })()}
        </span>
        <Pill status={pillStatus(ticket.status)}>{STATUS_RU[ticket.status] ?? ticket.status}</Pill>
      </summary>
      <div style={{ padding: "0 0 16px" }}>
        {ticket.messages.map((m, i) => (
          <article key={i} style={{ padding: "10px 0", borderTop: i ? "1px solid var(--c-line)" : undefined }}>
            <strong style={{ ...mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)" }}>
              {m.author === "support" ? "Поддержка" : "Посетитель"}
            </strong>
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14, lineHeight: 1.45 }}>{m.text}</p>
          </article>
        ))}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save("answered");
          }}
          style={{ marginTop: 12 }}
        >
          <label style={{ display: "block", ...label, textTransform: "none", letterSpacing: 0, marginBottom: 6 }}>
            Ответ посетителю
            <textarea
              style={{ ...field, marginTop: 6, minHeight: 88, width: "100%" }}
              minLength={5}
              maxLength={4000}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={busy} className="foc" style={action}>
              Отправить ответ
            </button>
            <button type="button" disabled={busy} className="foc" style={actionGhost} onClick={() => void save("closed")}>
              Закрыть обращение
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" style={{ ...mono, margin: "10px 0 0", fontSize: 12, color: "var(--c-danger-text)" }}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export default function SupportAdmin() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const status = useQuery({
    queryKey: ["admin-bot-status"],
    queryFn: () => adminReq<BotStatus>("GET", "/admin/bot-status"),
  });
  const q = useQuery({
    queryKey: ["admin-support", page],
    queryFn: () => adminReq<Ticket[]>("GET", `/admin/support?page=${page}`),
  });

  const st = status.data;
  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    if (statusFilter === "all") return rows;
    return rows.filter((t) => t.status === statusFilter);
  }, [q.data, statusFilter]);

  const setFilter = (key: StatusFilter) => {
    setStatusFilter(key);
  };

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "все" },
    { key: "open", label: "ожидают" },
    { key: "answered", label: "с ответом" },
    { key: "closed", label: "закрыты" },
  ];

  return (
    <>
      <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
        <Panel>
          <PanelTitle>Telegram</PanelTitle>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>@{st?.telegram.username ?? "pravohse_alumni_bot"}</p>
          <p style={{ ...label, margin: "8px 0 0", textTransform: "none", letterSpacing: 0, lineHeight: 1.45 }}>
            Токен: {st?.telegram.tokenConfigured ? "задан" : "не задан"}.
            {st?.telegram.polling ? " Long-polling включён." : ""}
          </p>
          {st && (
            <a className="foc" href={st.telegram.link} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 12, display: "inline-block", marginTop: 10, color: "var(--c-link)" }}>
              Открыть бота →
            </a>
          )}
        </Panel>
        <Panel>
          <PanelTitle>FAQ на сайте</PanelTitle>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {st?.siteFaq.answers ?? "–"} ответов · {st?.siteFaq.gaps ?? "–"} эскалаций
          </p>
          <p style={{ ...label, margin: "8px 0 0", textTransform: "none", letterSpacing: 0, lineHeight: 1.45 }}>
            {st?.siteFaq.note ?? "Ворона и Telegram используют один FAQ."}
          </p>
          {st?.siteFaq.hits && (
            <p style={{ ...mono, margin: "10px 0 0", fontSize: 12, color: "var(--c-text-2)", lineHeight: 1.45 }}>
              30д: gap {st.siteFaq.hits.gap_hits} · none {st.siteFaq.hits.none_hits}
              {st.siteFaq.hits.by_gap[0] ? ` · топ ${st.siteFaq.hits.by_gap[0].gap_id} (${st.siteFaq.hits.by_gap[0].count})` : ""}
            </p>
          )}
        </Panel>
        <Panel>
          <PanelTitle>Тикеты</PanelTitle>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {st?.tickets.enabled ? (st.tickets.draft ? "Стенд (draft)" : "Приём включён") : "Выключены"}
          </p>
          <p style={{ ...label, margin: "8px 0 0", textTransform: "none", letterSpacing: 0, lineHeight: 1.45 }}>
            Открыто ≈ {st?.tickets.openApprox ?? "–"}. Ответы только в переписке на сайте.
          </p>
        </Panel>
      </div>

      {status.isError && (
        <p role="alert" style={{ ...mono, margin: "0 0 16px", fontSize: 12, color: "var(--c-danger-text)" }}>
          {status.error.message}{" "}
          <button type="button" className="foc" onClick={() => void status.refetch()} style={{ ...mono, background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>
            Повторить
          </button>
        </p>
      )}

      {st?.siteFaq.hits?.by_gap && st.siteFaq.hits.by_gap.length > 0 && (
        <Panel style={{ marginBottom: 22 }}>
          <PanelTitle>Пробелы FAQ (30 дней)</PanelTitle>
          {st.siteFaq.hits.by_gap.slice(0, 8).map((g) => (
            <Row key={g.gap_id} cols="minmax(0,1fr) auto">
              <span style={{ ...mono, fontSize: 13 }}>{g.gap_id}</span>
              <span style={{ ...mono, fontSize: 13, color: "var(--c-text-2)" }}>{g.count}</span>
            </Row>
          ))}
        </Panel>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {filters.map((f) => {
          const on = statusFilter === f.key;
          const urgent = f.key === "open" && (st?.tickets.openApprox ?? 0) > 0 && !on;
          return (
            <button
              key={f.key}
              type="button"
              className="foc"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              style={{
                ...mono,
                fontSize: "var(--t-caption)",
                letterSpacing: "var(--tr-data)",
                textTransform: "uppercase",
                padding: "7px 12px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${on ? "var(--c-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-line)"}`,
                background: on ? "var(--c-accent)" : "transparent",
                color: on ? "var(--c-on-accent)" : urgent ? "var(--c-accent-text)" : "var(--c-text-2)",
              }}
            >
              {f.label}
            </button>
          );
        })}
        <span style={{ ...label, marginLeft: "auto" }}>
          на странице: {filtered.length}
          {statusFilter !== "all" && q.data ? ` из ${q.data.length}` : ""}
        </span>
      </div>

      <Panel style={{ paddingTop: 8, paddingBottom: 8 }}>
        {q.isLoading && <p style={{ ...label, margin: "12px 0", textTransform: "none" }}>Загружаем…</p>}
        {q.isError && (
          <p role="alert" style={{ ...mono, margin: "12px 0", fontSize: 12, color: "var(--c-danger-text)" }}>
            {q.error.message}{" "}
            <button type="button" className="foc" onClick={() => void q.refetch()} style={{ ...mono, background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>
              Повторить
            </button>
          </p>
        )}
        {!q.isLoading && !q.isError && filtered.length === 0 && (
          <p style={{ ...label, margin: "12px 0", textTransform: "none" }}>
            {statusFilter === "all" ? "Обращений нет." : "На этой странице нет тикетов с выбранным статусом."}
          </p>
        )}
        {filtered.map((t) => (
          <Reply key={t.id} ticket={t} refresh={() => void q.refetch()} />
        ))}
      </Panel>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16 }}>
        <button type="button" className="foc" style={actionGhost} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Назад
        </button>
        <span style={{ ...mono, fontSize: 12 }}>Страница {page}</span>
        <button type="button" className="foc" style={actionGhost} disabled={!q.data || q.data.length < 30} onClick={() => setPage((p) => p + 1)}>
          Далее
        </button>
      </div>
    </>
  );
}
