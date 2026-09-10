import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminReq } from "../lib/admin.js";
import { action, actionGhost, field } from "../styles/primitives.js";
import { topics, type Ticket } from "../pages/SupportV2.js";

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
    <details style={{ padding: "20px 0", borderTop: "1px solid var(--c-line)" }}>
      <summary className="foc" style={{ cursor: "pointer", overflowWrap: "anywhere" }}>
        {topics[ticket.topic]} · {ticket.id.slice(0, 8)} ·{" "}
        {({ open: "Ожидает ответа", answered: "Ответ отправлен", closed: "Закрыто" } as Record<string, string>)[ticket.status]}
      </summary>
      {ticket.messages.map((m, i) => (
        <article key={i} className="club-support-message">
          <strong>{m.author === "support" ? "Поддержка" : "Посетитель"}</strong>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</p>
        </article>
      ))}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save("answered");
        }}
      >
        <label>
          Ответ посетителю
          <textarea style={field} minLength={5} maxLength={4000} required value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="club-support-actions">
          <button disabled={busy} style={action}>
            Отправить ответ
          </button>
          <button type="button" disabled={busy} style={actionGhost} onClick={() => void save("closed")}>
            Закрыть обращение
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

export default function SupportAdmin() {
  const [page, setPage] = useState(1);
  const status = useQuery({
    queryKey: ["admin-bot-status"],
    queryFn: () => adminReq<BotStatus>("GET", "/admin/bot-status"),
  });
  const q = useQuery({
    queryKey: ["admin-support", page],
    queryFn: () => adminReq<Ticket[]>("GET", `/admin/support?page=${page}`),
  });

  const st = status.data;

  return (
    <section>
      <h2>Поддержка и бот</h2>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          marginBottom: 28,
          padding: 18,
          background: "var(--c-bg-sunken)",
          borderRadius: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Telegram</div>
          <strong>@{st?.telegram.username ?? "pravohse_alumni_bot"}</strong>
          <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.45 }}>
            Команды /points, /calendar и свободные вопросы по FAQ сайта. Токен:{" "}
            {st?.telegram.tokenConfigured ? "задан" : "не задан в API"}.
            {st?.telegram.polling ? " Long-polling включён." : ""}
          </p>
          {st && (
            <a className="foc" href={st.telegram.link} target="_blank" rel="noreferrer">
              Открыть бота
            </a>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>FAQ на сайте</div>
          <strong>
            {st?.siteFaq.answers ?? "–"} ответов · {st?.siteFaq.gaps ?? "–"} тем в каталоге эскалаций
          </strong>
          <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.45 }}>
            {st?.siteFaq.note ?? "Ворона на сайте и Telegram используют один набор FAQ."}
          </p>
          {st?.siteFaq.hits && (
            <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
              За 30 дней: gap {st.siteFaq.hits.gap_hits}, без ответа {st.siteFaq.hits.none_hits}
              {st.siteFaq.hits.by_gap[0] ? ` · топ: ${st.siteFaq.hits.by_gap[0].gap_id} (${st.siteFaq.hits.by_gap[0].count})` : ""}
            </p>
          )}
          <a className="foc" href="/" target="_blank" rel="noreferrer">
            Открыть сайт
          </a>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Тикеты</div>
          <strong>{st?.tickets.enabled ? (st.tickets.draft ? "Стенд (draft)" : "Приём включён") : "Выключены"}</strong>
          <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.45 }}>
            Ответы ниже сохраняются в переписке на сайте. Письма и Telegram для тикетов не используются.
          </p>
        </div>
      </div>

      {status.isError && (
        <p role="alert">
          {status.error.message}{" "}
          <button type="button" onClick={() => status.refetch()}>
            Повторить
          </button>
        </p>
      )}

      <h3 style={{ marginTop: 8 }}>Обращения с сайта</h3>
      <p>Ответы сохраняются в переписке на сайте. Email и сторонние мессенджеры не используются.</p>
      {q.isLoading && <p>Загружаем…</p>}
      {q.isError && (
        <p role="alert">
          {q.error.message}{" "}
          <button type="button" onClick={() => q.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {q.data?.map((t) => (
        <Reply key={t.id} ticket={t} refresh={() => void q.refetch()} />
      ))}
      {q.data?.length === 0 && <p>Обращений нет</p>}
      <div className="club-support-actions">
        <button style={actionGhost} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Назад
        </button>
        <span>Страница {page}</span>
        <button style={actionGhost} disabled={!q.data || q.data.length < 30} onClick={() => setPage((p) => p + 1)}>
          Далее
        </button>
      </div>
    </section>
  );
}
