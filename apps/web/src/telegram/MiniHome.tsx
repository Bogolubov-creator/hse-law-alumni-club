import AlumniOpportunities from "../components/AlumniOpportunities.js";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { V2Shell } from "../v2/Shell.js";
import { publicUrl, isMirror } from "../lib/public-url.js";
import { requestJson } from "../lib/http.js";
import { usePrograms, token } from "../lib/cart.js";
import { useTelegramApp } from "./bridge.js";
import { apiGet } from "../lib/api.js";
import { fmtEventDate, type ClubEvent } from "../lib/events.js";
import { useHead } from "../lib/title.js";

export default function MiniHome() {
  useHead({ title: "Мой клуб", description: "Встречи, знания и возможности сообщества выпускников факультета права." });
  const programs = usePrograms();
  const sessionToken = token();
  const events = useQuery({ queryKey: ["events", sessionToken], queryFn: () => apiGet<ClubEvent[]>("/events", sessionToken ?? undefined) });
  const upcoming = events.data?.filter(e => e.status === "published" && Date.parse(e.starts_at) >= Date.now()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tg = useTelegramApp();
  const canTelegramLogin = !isMirror && !!tg?.initData;
  async function login() {
    if (!canTelegramLogin || busy) return;
    setBusy(true); setError("");
    try {
      const data = await requestJson<{ token: string }>("/auth/telegram", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg!.initData }),
      }, { errorMessage: (status) => status === 404 ? "Telegram ещё не привязан к профилю. Войдите в кабинет по почте и подключите его в профиле." : status === 401 ? "Сессия Telegram устарела. Закройте и снова откройте мини-приложение." : "Вход через Telegram сейчас недоступен. Можно войти по почте." });
      if (!data.token) throw new Error("Не удалось подтвердить вход.");
      localStorage.setItem("club_token", data.token);
      queryClient.clear();
      navigate("/lk");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <V2Shell><main id="main" className="mini-home">
    <section className="mini-welcome">
      <p className="mini-eyebrow">Сообщество выпускников</p>
      <h1>Свои люди.<br /><em>Новые возможности.</em></h1>
      <p>Вышка объединяет. Клуб продолжает.</p>
    </section>
    <section className="mini-agenda" aria-label="Жизнь клуба">
      <img src={publicUrl("assets/photos/alumni-meeting.jpg")} width={1100} height={330} alt="Выпускники факультета права на встрече клуба" />
      <Link to={upcoming ? `/events/${encodeURIComponent(upcoming.id)}` : "/events"} className="mini-agenda__link foc">
        <span className="mini-agenda__body"><span className="mini-eyebrow">{upcoming ? "Следующая встреча" : "Жизнь клуба"}</span>
          <strong>{upcoming?.title ?? "Есть повод встретиться"}</strong>
          <span>{upcoming ? fmtEventDate(upcoming.starts_at) : events.isError ? "Афиша временно недоступна. Открыть раздел" : events.isLoading ? "Загружаем афишу…" : "Смотрите афишу и встречи сообщества"}</span>
        </span><span className="mini-arrow" aria-hidden="true">↗</span>
      </Link>
    </section>
    <section className="mini-membership" aria-label="Кабинет участника">
      <div><span className="mini-eyebrow">Личное</span><h2>Мой кабинет</h2><p>Баллы, заявки и привилегии выпускника</p></div>
      {canTelegramLogin && !token() ? <button className="club-btn club-btn--primary foc" disabled={busy} onClick={() => void login()}>{busy ? "Проверяем…" : "Войти через Telegram"}</button> : <Link className="club-btn club-btn--primary foc" to="/lk">Открыть кабинет →</Link>}
      {canTelegramLogin && !token() && <Link to="/lk" className="mini-email foc">Войти по почте</Link>}
      {error && <p role="alert" className="mini-error">{error}</p>}
      {isMirror && <small>Демонстрационный кабинет</small>}
    </section>
    <nav className="mini-shortcuts" aria-label="Возможности клуба">
      {[['/podcasts','Слушать','Подкасты клуба'],['/events','Встречаться','Афиша клуба'],['/news','Читать','Новости сообщества'],['/support','Спросить','Помощь офиса']].map(([to,title,note]) => <Link to={to!} key={to} className="foc"><h2>{title} <span aria-hidden="true">↗</span></h2><p>{note}</p></Link>)}
    </nav>
    <AlumniOpportunities />
    <section className="mini-learning"><div><h2>Продолжайте учиться</h2><p>{programs.data ? `${programs.data.length} программ факультета права` : programs.isError ? "Каталог временно недоступен" : "Загружаем программы…"}</p><Link to="/dpo" className="foc">Выбрать программу →</Link></div><img src={publicUrl("assets/photos/students-talk.jpg")} width={1083} height={722} alt="Студенты факультета права" loading="lazy" /></section>
    <Link className="mini-shop foc" to="/merch">Вещи с символикой клуба <span>Мерч →</span></Link>
  </main></V2Shell>;
}
