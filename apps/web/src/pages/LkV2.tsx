import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loginResponseSchema, ORDER_STATUS_RU, ORDER_STATUS_VERB_RU, type Classmate, type LkEvent } from "@club/shared";
import { apiGet, apiPost, isAuthError, rub, type LoginResponse, type AlumniBrief, type Me, type MyOrder } from "../lib/api.js";
import { useMe, useMyOrders, useClassmates, useAddFriend, useRemoveFriend, useLkEvents } from "../lib/queries.js";
import { logout as logoutSession } from "../lib/cart.js";
import { fmtEventDate, type ClubEvent } from "../lib/events.js";
import { useToast } from "../components/Toast.js";
import { useHead } from "../lib/title.js";
import { VisionCorner } from "../components/Vision.js";
import { BlankField, mono, disp } from "../v2/Shell.js";
import { Mark } from "../v2/Mark.js";
import { CabinetShell, Section, Initial, TOKEN_KEY, label, field, action, actionGhost } from "../v2/cabinet.js";
import { MobileTabs } from "../v2/MobileTabs.js";

/**
 * Личный кабинет v2. Режим отличается от внешнего контура (DESIGN.md):
 * плотность 7, движения нет – только состояния. Здесь действия совершаются
 * десятками раз, и анимация делает их медленнее, а не приятнее.
 *
 * Язык тот же – реестр: данные моноширинные, записи разделяются линиями,
 * а не карточками. Сигнатура «поле бланка» ложится буквально: карточка
 * выпускника и есть удостоверение, где под чертой подписано, что в неё вписано.
 *
 * Цвет: один акцент на страницу (охра) для всех действий. Зелёный и кармин –
 * только текст статуса и только через -text-токены: заливочные тона не
 * проходят AA на мелкой моно-подписи.
 *
 * Живёт на /v2/lk рядом со старым кабинетом, чтобы их можно было сравнить.
 */

/* ── Вход ─────────────────────────────────────────────────────────── */

function Gate({ onAuthed }: { onAuthed: (r: LoginResponse) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      onAuthed(await apiPost<LoginResponse>("/auth/login", { email, password }, loginResponseSchema));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <VisionCorner />
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, background: "var(--c-bg-raised)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <Link to="/v2" className="foc" style={{ ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>← на главную</Link>
        <Mark kind="scales" size={40} style={{ color: "var(--c-accent-text)", marginTop: 20 }} />
        <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: "14px 0 0" }}>Вход для выпускников</h1>
        <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
          Доступ открывается после верификации учебным офисом.
        </p>

        <label htmlFor="lkv2-email" style={{ ...label, display: "block", marginTop: 22 }}>Почта</label>
        <input id="lkv2-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="foc" style={field} />

        <label htmlFor="lkv2-pass" style={{ ...label, display: "block", marginTop: 16 }}>Пароль</label>
        <input id="lkv2-pass" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="foc" style={field} />

        {err && <p role="alert" style={{ ...mono, margin: "14px 0 0", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{err}</p>}

        <button type="submit" disabled={busy} className="foc"
          style={{ width: "100%", marginTop: 22, padding: "14px 20px", borderRadius: "var(--r-md)", border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)", fontWeight: 600, fontSize: 15, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Входим…" : "Войти в кабинет"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16, fontSize: "var(--t-small)" }}>
          <Link to="/v2/join" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Вступить в клуб</Link>
          <Link to="/v2/forgot" className="foc" style={{ color: "var(--c-text-3)" }}>Забыли пароль?</Link>
        </div>
      </form>
      {/* Без панели экран входа – тупик: во вкладках «кабинет» ведёт сюда */}
      <MobileTabs />
    </main>
  );
}

function PendingScreen({ alumni, onBack }: { alumni: AlumniBrief; onBack: () => void }) {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--c-bg-raised)", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <div style={{ ...label, color: "var(--c-status)" }}>заявка принята</div>
        <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: "12px 0 0" }}>Ожидает верификации</h1>
        <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6 }}>
          {alumni.fio ?? "Выпускник"}, учебный офис сверяет ваш выпуск с реестром факультета. Кабинет откроется после подтверждения.
        </p>
        <button onClick={onBack} className="foc" style={{ width: "100%", marginTop: 22, padding: "13px 20px", borderRadius: "var(--r-md)", border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-text)", fontWeight: 600, cursor: "pointer" }}>Назад</button>
      </div>
      <MobileTabs />
    </main>
  );
}

/* ── Клубная карта ────────────────────────────────────────────────── */

const VERIFY_STATUS: Record<string, { text: string; color: string }> = {
  verified: { text: "Подтверждён", color: "var(--c-ok-text)" },
  pending: { text: "На проверке", color: "var(--c-status)" },
  rejected: { text: "Проверка не пройдена", color: "var(--c-danger-text)" },
};

/** Строка карты: как DataRow, но значение можно красить – статус верификации живёт цветом. */
function CardRow({ name, value, color, accent }: { name: string; value: string; color?: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "10px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={label}>{name}</span>
      <span style={{ ...mono, fontSize: 15, fontWeight: 500, textAlign: "right", color: color ?? (accent ? "var(--c-accent-text)" : "var(--c-text)") }}>{value}</span>
    </div>
  );
}

/**
 * Клубная карта (паттерн Oxford «My Oxford Card») – единое удостоверение
 * выпускника в кабинете: фото, эмблема, строки реестра. Поглощает бывший
 * блок «удостоверение» (уровень/баллы/скидка/код приглашения), чтобы ФИО
 * и статусы не дублировались в двух карточках. Баллы, скидку и прогресс
 * показываем только подтверждённым: до верификации они не действуют
 * (честно про «На проверке»).
 */
function ClubCard({ me }: { me: Me }) {
  const a = me.alumni;
  const l = me.level;
  const verified = a.verification_status === "verified";
  const st = VERIFY_STATUS[a.verification_status] ?? VERIFY_STATUS.pending!;
  const sub = [a.cohort ? `выпуск ${a.cohort}` : null, a.edu_program].filter(Boolean).join(" · ") || "выпускник клуба";
  const joined = (() => {
    if (!a.joined_at) return null;
    const d = new Date(a.joined_at);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  })();

  return (
    <div style={{ border: "1px solid var(--c-line-strong)", borderRadius: "var(--r-lg)", padding: 20, background: "var(--c-bg-raised)", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {a.avatar
          ? <img src={`/api/avatars/${a.avatar}`} alt="" width={56} height={56}
              style={{ width: 56, height: 56, flexShrink: 0, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--c-line)" }} />
          : <Initial fio={a.fio} size={56} radius="var(--r-sm)" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={label}>клубная карта</div>
          {/* Кегль ниже h3 и перенос только по словам: длинное ФИО в колонке
              ~330px иначе рвётся посреди слова. */}
          <div style={{ ...disp, fontWeight: 700, fontSize: 18, lineHeight: 1.25, marginTop: 5, hyphens: "none", overflowWrap: "anywhere" }}>{a.fio ?? "Выпускник"}</div>
          <div style={{ ...mono, fontSize: 11, color: "var(--c-text-3)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em", overflowWrap: "anywhere" }}>{sub}</div>
        </div>
        <img src="/brand/emblem.jpg" alt="Эмблема клуба" width={40} height={40}
          style={{ width: 40, height: 40, flexShrink: 0, alignSelf: "flex-start", borderRadius: "50%", objectFit: "cover", transform: "scale(1.1)" }} />
      </div>
      <div style={{ marginTop: 14 }}>
        {verified && (
          <>
            <CardRow name="уровень" value={l.level_title} />
            <CardRow name="баллы" value={String(l.points)} accent />
            <CardRow name="скидка выпускника" value={`${l.discount}%`} accent />
            {l.next_level && <CardRow name={`до «${l.next_level}»`} value={String(l.to_next)} />}
          </>
        )}
        <CardRow name="статус" value={st.text} color={st.color} />
        {joined && <CardRow name="в клубе с" value={joined} />}
      </div>
      {a.referral_code && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--c-line)" }}>
          <div style={label}>код приглашения</div>
          <div style={{ ...mono, fontSize: 17, fontWeight: 500, marginTop: 6, letterSpacing: "0.08em", overflowWrap: "anywhere" }}>{a.referral_code}</div>
          <div style={{ ...mono, fontSize: 11, color: "var(--c-text-3)", marginTop: 8 }}>
            приведено: {a.referrals_verified ?? 0} · ждут проверки: {a.referrals_pending ?? 0}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Общие запросы дашборда ───────────────────────────────────────── */

/** Афиша клуба: кэш общий у «Моих событий», хаба возможностей и «Для меня». */
function useEvents(token: string) {
  return useQuery({ queryKey: ["events", token], queryFn: () => apiGet<ClubEvent[]>("/events", token) });
}

/** Ссылка привязки tg-бота как query: результат делят блок TgLink и хаб возможностей. */
function useTgLink(token: string) {
  return useQuery({
    queryKey: ["tg-link", token],
    queryFn: () => apiGet<{ linked: boolean; url: string }>("/me/tg-link", token),
    retry: false,
  });
}

type PushState = "loading" | "unavailable" | "off" | "on" | "busy";

/**
 * Начальное состояние push-подписки: поддержка браузером, конфиг сервера
 * (/push/vapid) и живая подписка. Читается блоком «Уведомления» и строкой
 * хаба «Мои возможности» – логика одна, инстансов два, запрос дешёвый.
 */
function usePushState(): [PushState, (s: PushState) => void] {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (alive) setState("unavailable");
        return;
      }
      try {
        const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
        if (!cfg.enabled || !cfg.key) { if (alive) setState("unavailable"); return; }
        // В dev sw.js не регистрируется (только PROD) – .ready не резолвится, страхуемся таймаутом.
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no-sw")), 3000)),
        ]);
        const sub = await reg.pushManager.getSubscription();
        if (alive) setState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        if (alive) setState("unavailable");
      }
    })();
    return () => { alive = false; };
  }, []);

  return [state, setState];
}

/* ── Разделы ──────────────────────────────────────────────────────── */

function EventsFeed({ token }: { token: string }) {
  const events = useLkEvents(token);
  const addFriend = useAddFriend(token);
  const removeFriend = useRemoveFriend(token);
  const list = events.data ?? [];
  if (!list.length) return null;

  return (
    <Section title="Требует внимания">
      {list.map((e: LkEvent, i) => {
        if (e.kind === "friend_request") {
          return (
            <div key={`fr-${e.from_id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
              <span style={{ flex: 1, minWidth: 190, fontSize: "var(--t-body)" }}>
                <b>{e.from_fio ?? "Выпускник"}</b> хочет добавить вас в друзья
              </span>
              <button onClick={() => addFriend.mutate(e.from_id)} disabled={addFriend.isPending} className="foc" style={action}
                aria-label={`Принять заявку в друзья – ${e.from_fio ?? "выпускник"}`}>принять</button>
              <button onClick={() => removeFriend.mutate(e.from_id)} disabled={removeFriend.isPending} className="foc" style={actionGhost}
                aria-label={`Отклонить заявку в друзья – ${e.from_fio ?? "выпускник"}`}>отклонить</button>
            </div>
          );
        }
        const line =
          e.kind === "friend_accepted" ? `${e.by_fio ?? "Выпускник"} теперь у вас в друзьях`
          // В ленте – глагольная форма («заявка подтверждена»), в списке заявок – именительная
          : e.kind === "order_status" ? `Заявка ${e.number} ${ORDER_STATUS_VERB_RU[e.status] ?? e.status}${e.paid ? " · оплата прошла" : ""}`
          : `Подписка на подкасты истекает через ${e.days_left} дн.`;
        return (
          <div key={`ev-${i}`} style={{ padding: "12px 0", borderTop: "1px solid var(--c-line)", fontSize: "var(--t-body)", color: "var(--c-text-2)" }}>{line}</div>
        );
      })}
    </Section>
  );
}

/** Ближайшие события клуба с записью (паритет с v1 NextClubEvent, но списком). */
function MyEvents({ token }: { token: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const events = useEvents(token);
  const rsvp = useMutation({
    mutationFn: (id: string) => apiPost<{ going: boolean }>(`/events/${id}/rsvp`, {}, undefined, token),
    onSuccess: (r) => { toast(r.going ? "Вы записаны – ждём вас" : "Запись отменена"); qc.invalidateQueries({ queryKey: ["events"] }); },
    onError: (e) => toast((e as Error).message, "err"),
  });

  const now = Date.now();
  const upcoming = (events.data ?? [])
    .filter((e) => e.status === "published" && new Date(e.starts_at).getTime() >= now)
    .slice(0, 3);

  return (
    <Section title="Мои события" note={upcoming.length ? `ближайших ${upcoming.length}` : undefined}>
      {events.isLoading && <p style={{ ...label, margin: 0 }}>загружаем афишу…</p>}
      {!events.isLoading && upcoming.length === 0 && (
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          Записей на ближайшие события нет.
        </p>
      )}
      {upcoming.map((e) => (
        <div key={e.id} className="lkv2-order" style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 16, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
          <span>
            <span style={{ ...mono, display: "block", fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase", color: "var(--c-accent-text)" }}>{fmtEventDate(e.starts_at)}</span>
            <span style={{ ...label, display: "block", fontSize: 10, marginTop: 4 }}>{e.format === "online" ? "онлайн" : "очно"}</span>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "var(--t-body)", fontWeight: 500, lineHeight: 1.35 }}>{e.title}</span>
            <span style={{ ...label, display: "block", fontSize: 10, marginTop: 4 }}>
              {[e.format !== "online" ? e.location : null, e.points > 0 ? `+${e.points} баллов` : null, e.going > 0 ? `пойдут: ${e.going}` : null].filter(Boolean).join(" · ")}
            </span>
          </span>
          {e.my_attended ? (
            <span style={{ ...label, color: "var(--c-ok-text)", whiteSpace: "nowrap" }}>засчитано</span>
          ) : (
            <button onClick={() => rsvp.mutate(e.id)} disabled={rsvp.isPending} className="foc"
              aria-label={e.my_rsvp ? `Отменить запись: ${e.title}` : `Записаться: ${e.title}`}
              style={{
                ...label, whiteSpace: "nowrap", cursor: rsvp.isPending ? "wait" : "pointer",
                padding: "8px 14px", borderRadius: "var(--r-sm)",
                border: e.my_rsvp ? "1px solid var(--c-ok-text)" : "none",
                background: e.my_rsvp ? "transparent" : "var(--c-accent)",
                color: e.my_rsvp ? "var(--c-ok-text)" : "var(--c-on-accent)",
              }}>
              {e.my_rsvp ? "иду · отменить" : "пойду"}
            </button>
          )}
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--c-line)", paddingTop: 12 }}>
        <Link to="/v2/events" className="foc" style={{ ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>вся афиша →</Link>
      </div>
    </Section>
  );
}

/* ── Хаб возможностей ─────────────────────────────────────────────── */

type OppTone = "ok" | "accent" | "muted";

/** Строка реестра возможностей: название, статус-метка справа, ссылка-действие. */
function OppRow({ name, detail, status, tone, href, linkLabel }: {
  name: string; detail: string; status: string; tone: OppTone; href?: string; linkLabel?: string;
}) {
  const statusColor = tone === "ok" ? "var(--c-ok-text)" : tone === "accent" ? "var(--c-accent-text)" : "var(--c-text-3)";
  const linkStyle = { ...label, color: "var(--c-accent-text)", textDecoration: "none", whiteSpace: "nowrap" as const };
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
      <span style={{ minWidth: 190, flex: 1 }}>
        <span style={{ display: "block", fontSize: "var(--t-body)", fontWeight: 500 }}>{name}</span>
        <span style={{ ...label, display: "block", fontSize: 10, marginTop: 4, textTransform: "none", letterSpacing: "var(--tr-data)" }}>{detail}</span>
      </span>
      <span style={{ ...label, color: statusColor, whiteSpace: "nowrap" }}>{status}</span>
      {href && linkLabel && (href.startsWith("#")
        ? <a href={href} className="foc" style={linkStyle}>{linkLabel}</a>
        : <Link to={href} className="foc" style={linkStyle}>{linkLabel}</Link>)}
    </div>
  );
}

/**
 * «Мои возможности» – реестр того, что клуб уже даёт выпускнику. Каждый
 * статус считается из реальных ответов API (/me, /events, /me/classmates,
 * /me/tg-link, /push/vapid): ничего не обещаем сверх данных.
 */
function Opportunities({ me, token }: { me: Me; token: string }) {
  const events = useEvents(token);
  const classmates = useClassmates(token);
  const tg = useTgLink(token);
  const [push] = usePushState();

  const now = Date.now();
  const pointEvents = (events.data ?? []).filter(
    (e) => e.status === "published" && new Date(e.starts_at).getTime() >= now && e.points > 0,
  );
  const mates = classmates.data;
  const verified = me.alumni.verification_status === "verified";

  const pushStatus: Record<PushState, { status: string; detail: string; tone: OppTone }> = {
    loading: { status: "проверяем…", detail: "заявки в друзья и новые события – сразу на устройство", tone: "muted" },
    unavailable: { status: "недоступно", detail: "не поддерживаются этим браузером или не настроены на сервере", tone: "muted" },
    off: { status: "настроить", detail: "выключены – включите, чтобы не пропустить анонсы", tone: "muted" },
    on: { status: "действует", detail: "включены на этом устройстве", tone: "ok" },
    busy: { status: "настроить", detail: "выключены – включите, чтобы не пропустить анонсы", tone: "muted" },
  };

  return (
    <Section title="Мои возможности">
      {verified ? (
        <OppRow name="Цена выпускника на ДПО" detail={`ваша скидка – ${me.level.discount}% от цены программы`}
          status="действует" tone="ok" href="/v2/dpo" linkLabel="каталог дпо →" />
      ) : (
        <OppRow name="Цена выпускника на ДПО" detail="активируется после проверки выпуска учебным офисом"
          status="на проверке" tone="muted" />
      )}
      <OppRow name="События с баллами клуба"
        detail={!events.data ? "загружаем афишу…" : pointEvents.length ? `ближайших с начислением: ${pointEvents.length}` : "сейчас нет анонсов с баллами"}
        status={!events.data ? "проверяем…" : pointEvents.length ? "доступно" : "нет анонсов"}
        tone={pointEvents.length ? "accent" : "muted"}
        href="/v2/events" linkLabel="афиша →" />
      <OppRow name="Сообщество однокурсников"
        detail={!mates ? "загружаем…" : mates.length ? `найдено выпускников: ${mates.length}` : "пока никого из вашего выпуска и программы"}
        status={!mates ? "проверяем…" : mates.length ? "доступно" : "ждём верификации"}
        tone={mates?.length ? "accent" : "muted"}
        href="#community" linkLabel="к сообществу →" />
      {tg.data && (
        <OppRow name="Telegram-бот: баллы и календарь"
          detail={tg.data.linked ? "привязан – /points и /calendar покажут ваши данные" : "не привязан"}
          status={tg.data.linked ? "действует" : "настроить"} tone={tg.data.linked ? "ok" : "muted"}
          href="#tg-link" linkLabel="к настройке →" />
      )}
      <OppRow name="Push-уведомления" detail={pushStatus[push].detail}
        status={pushStatus[push].status} tone={pushStatus[push].tone}
        href="#push-bell" linkLabel="к настройке →" />
    </Section>
  );
}

/**
 * «Ваш этап» (паттерн Stanford «Hey, New Alums!») – карьерный этап считается
 * из года выпуска: ≤ 5 лет – недавний выпускник, дальше – опытный. Тексты
 * честные: никаких обещаний сверх того, что клуб реально даёт; CTA ведут
 * на существующие разделы (интересы профиля и блок «Могу помочь» ниже).
 * Без cohort блок не рендерится – этап не вычислить.
 */
function CareerStage({ me }: { me: Me }) {
  const a = me.alumni;
  const cohortYear = a.cohort ? Number.parseInt(a.cohort, 10) : NaN;
  if (!Number.isFinite(cohortYear)) return null;

  const recent = new Date().getFullYear() - cohortYear <= 5;
  const hasInterests = (a.interests ?? []).length > 0;

  const ctaStyle = { ...label, color: "var(--c-accent-text)", textDecoration: "none", whiteSpace: "nowrap" as const };

  return (
    <Section title="Ваш этап" note={recent ? "недавний выпускник" : "опытный выпускник"}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.55 }}>
          {recent
            ? "Первые годы после выпуска – время нетворкинга и карьерных разведок. Вам доступны все возможности клуба."
            : "Ваш опыт ценен для сообщества. Однокурсники могут найти вас по темам экспертизы."}
        </span>
        {recent && !hasInterests && (
          <Link to="/v2/lk/profile#interests" className="foc" style={ctaStyle}>заполнить интересы →</Link>
        )}
        {!recent && <a href="#can-help" className="foc" style={ctaStyle}>могу помочь →</a>}
      </div>
    </Section>
  );
}

/**
 * «Для меня» – до двух ближайших опубликованных событий без моей записи.
 * Никакой персонализации сверх данных афиши: если таких событий нет,
 * блок не рендерится вовсе.
 */
function ForMe({ token }: { token: string }) {
  const events = useEvents(token);
  const now = Date.now();
  const picks = (events.data ?? [])
    .filter((e) => e.status === "published" && new Date(e.starts_at).getTime() >= now && !e.my_rsvp)
    .slice(0, 2);
  if (!picks.length) return null;

  return (
    <Section title="Для меня" note="вы ещё не записаны">
      {picks.map((e) => (
        <Link key={e.id} to="/v2/events" className="foc lkv2-order"
          style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 16, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--c-line)", textDecoration: "none", color: "inherit" }}>
          <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase", color: "var(--c-accent-text)" }}>{fmtEventDate(e.starts_at)}</span>
          <span style={{ minWidth: 0, fontSize: "var(--t-body)", fontWeight: 500, lineHeight: 1.35 }}>{e.title}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 12, whiteSpace: "nowrap" }}>
            {e.points > 0 && <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase", color: "var(--c-status)" }}>+{e.points} баллов</span>}
            <span style={{ ...label, color: "var(--c-accent-text)" }}>подробнее →</span>
          </span>
        </Link>
      ))}
    </Section>
  );
}

/**
 * Push-уведомления (паритет с v1 PushBell): GET /push/vapid, подписка через
 * reg.pushManager.subscribe, POST /me/push/subscribe, отписка /me/push/unsubscribe.
 * В отличие от v1 блок не прячется при enabled:false – показывает честное
 * «недоступны», чтобы не молчать о выключенной функции.
 */
function PushBell({ token }: { token: string }) {
  const toast = useToast();
  const [state, setState] = usePushState();

  const b64ToU8 = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const enable = async () => {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Уведомления запрещены в браузере", "err"); setState("off"); return; }
      const cfg = await apiGet<{ enabled: boolean; key: string | null }>("/push/vapid");
      if (!cfg.enabled || !cfg.key) { setState("unavailable"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.key) });
      const j = sub.toJSON();
      await apiPost("/me/push/subscribe", { endpoint: sub.endpoint, keys: j.keys }, undefined, token);
      setState("on");
      toast("Уведомления включены");
    } catch {
      toast("Не удалось включить уведомления", "err");
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiPost("/me/push/unsubscribe", { endpoint: sub.endpoint }, undefined, token).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Уведомления выключены");
    } catch {
      setState("on");
    }
  };

  return (
    <Section title="Уведомления" note={state === "on" ? "включены" : undefined}>
      <div id="push-bell" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.5 }}>
          {state === "unavailable"
            ? "Push-уведомления недоступны: сервер не сконфигурирован или браузер их не поддерживает."
            : "Заявки в друзья, новые события и подкасты – сразу на устройство."}
        </span>
        {state === "loading" && <span style={label}>проверяем…</span>}
        {state === "unavailable" && <span style={label}>выключены</span>}
        {state === "on" && (
          <button onClick={disable} className="foc" style={{ ...actionGhost, color: "var(--c-ok-text)", borderColor: "var(--c-ok-text)" }}>включены · выключить</button>
        )}
        {(state === "off" || state === "busy") && (
          <button onClick={enable} disabled={state === "busy"} className="foc"
            style={{ ...action, cursor: state === "busy" ? "wait" : "pointer", opacity: state === "busy" ? 0.7 : 1 }}>
            {state === "busy" ? "включаем…" : "включить"}
          </button>
        )}
      </div>
    </Section>
  );
}

/**
 * Привязка Telegram-бота (паритет с v1 TgLink): GET /me/tg-link отдаёт
 * { linked, url } с deep-link t.me/<бот>?start=<код>. Отвязки в v1 нет –
 * показываем только статус. 401/403 или сбой сети – блок не рендерим.
 */
function TgLink({ token }: { token: string }) {
  const { data } = useTgLink(token);

  if (!data) return null;
  return (
    <Section title="Telegram-бот" note={data.linked ? "привязан" : undefined}>
      <div id="tg-link" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.5 }}>
          {data.linked
            ? "Привязан – команды /points и /calendar показывают ваши данные."
            : "Привяжите аккаунт – бот покажет ваши баллы (/points) и события (/calendar)."}
        </span>
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="foc"
          style={{ ...label, textDecoration: "none", padding: "8px 14px", borderRadius: "var(--r-sm)", flex: "none",
            ...(data.linked
              ? { border: "1px solid var(--c-line)", color: "var(--c-text-2)", background: "transparent" }
              : { border: "none", background: "var(--c-accent)", color: "var(--c-on-accent)" }) }}>
          {data.linked ? "открыть бота ↗" : "привязать telegram ↗"}
        </a>
      </div>
    </Section>
  );
}

function Orders({ token }: { token: string }) {
  const orders = useMyOrders(token);
  const list = orders.data ?? [];
  return (
    <Section title="Мои заявки" note={list.length ? `всего ${list.length}` : undefined}>
      {orders.isLoading && <p style={{ ...label, margin: 0 }}>загружаем…</p>}
      {!orders.isLoading && list.length === 0 && (
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          Заявок пока нет. <Link to="/v2/dpo" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Посмотреть программы ДПО →</Link>
        </p>
      )}
      {list.map((o: MyOrder) => (
        <div key={o.number} className="lkv2-order" style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 16, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--c-line)" }}>
          <span style={{ ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", color: "var(--c-text-3)" }}>{o.number}</span>
          <span style={{ fontSize: "var(--t-body)" }}>{ORDER_STATUS_RU[o.status] ?? o.status}</span>
          <span style={{ ...mono, fontSize: 15, fontWeight: 500 }}>{rub(o.total_estimate)}</span>
        </div>
      ))}
    </Section>
  );
}

function Achievements({ me }: { me: Me }) {
  const earned = me.achievements.filter((a) => a.earned);
  const inProgress = me.achievements.filter((a) => !a.earned).slice(0, 4);
  if (!me.achievements.length) return null;

  return (
    <Section title="Достижения" note={`получено ${earned.length} из ${me.achievements.length}`}>
      {earned.map((a) => (
        <div key={a.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 14, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span aria-hidden style={{ fontSize: 17 }}>{a.icon}</span>
          <span style={{ fontSize: "var(--t-body)", fontWeight: 500 }}>{a.title}</span>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "var(--tr-data)", color: "var(--c-ok-text)", textTransform: "uppercase" }}>получено</span>
        </div>
      ))}
      {inProgress.map((a) => (
        <div key={a.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 14, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--c-line)" }}>
          <span aria-hidden style={{ fontSize: 17, filter: "grayscale(1)", opacity: 0.6 }}>{a.icon}</span>
          <span style={{ fontSize: "var(--t-body)", color: "var(--c-text-2)" }}>{a.title}</span>
          <span style={{ ...mono, fontSize: "var(--t-caption)", color: "var(--c-text-3)" }}>{a.current} / {a.target}</span>
        </div>
      ))}
    </Section>
  );
}

const FRIEND_LABEL: Record<Classmate["friend_status"], string> = {
  none: "в друзья", incoming: "принять", pending: "заявка отправлена", accepted: "в друзьях",
};

/** Чип-фильтр сообщества: активный – заливка акцентом, как в афише EventsV2. */
function MateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="foc"
      style={{
        ...mono, fontSize: "var(--t-caption)", letterSpacing: "var(--tr-data)", textTransform: "uppercase",
        padding: "7px 12px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? "var(--c-accent)" : "var(--c-line)"}`,
        background: active ? "var(--c-accent)" : "transparent",
        color: active ? "var(--c-on-accent)" : "var(--c-text-2)",
      }}>
      {children}
    </button>
  );
}

function Community({ token, myInterests }: { token: string; myInterests: string[] }) {
  const classmates = useClassmates(token);
  const addFriend = useAddFriend(token);
  const removeFriend = useRemoveFriend(token);
  const [interest, setInterest] = useState<string | null>(null);
  const [cohortOnly, setCohortOnly] = useState(false);
  const [programOnly, setProgramOnly] = useState(false);

  const list = classmates.data ?? [];
  const friends = list.filter((c) => c.friend_status === "accepted").length;

  // Чипы интересов – из того, что реально указали однокурсники (топ по частоте).
  const topInterests = (() => {
    const freq = new Map<string, number>();
    for (const c of list) for (const i of c.interests) freq.set(i, (freq.get(i) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  })();

  const filtered = list.filter((c) =>
    (!interest || c.interests.includes(interest)) &&
    (!cohortOnly || c.match !== "program") &&
    (!programOnly || c.match !== "cohort"));
  const hasFilter = !!interest || cohortOnly || programOnly;

  return (
    <div id="community">
      <Section title="Однокурсники" note={list.length ? `${list.length} чел. · в друзьях ${friends}` : undefined}>
        {classmates.isLoading && <p style={{ ...label, margin: 0 }}>загружаем…</p>}
        {!classmates.isLoading && list.length === 0 && (
          <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
            Из вашего выпуска и программы в клубе пока никого нет. Появятся, как только учебный офис их верифицирует.
          </p>
        )}
        {list.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "12px 0 4px", borderTop: "1px solid var(--c-line)" }}>
            <MateChip active={cohortOnly} onClick={() => setCohortOnly((v) => !v)}>мой выпуск</MateChip>
            <MateChip active={programOnly} onClick={() => setProgramOnly((v) => !v)}>моя оп</MateChip>
            {topInterests.map((name) => (
              <MateChip key={name} active={interest === name} onClick={() => setInterest((cur) => (cur === name ? null : name))}>{name}</MateChip>
            ))}
          </div>
        )}
        {list.length > 0 && filtered.length === 0 && (
          <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
            Под выбранные фильтры никто не подходит.{" "}
            <button onClick={() => { setInterest(null); setCohortOnly(false); setProgramOnly(false); }} className="foc"
              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--c-accent-text)", cursor: "pointer", fontWeight: 600 }}>
              Сбросить фильтры
            </button>
          </p>
        )}
        {filtered.map((c) => {
          const settled = c.friend_status === "accepted" || c.friend_status === "pending";
          const common = myInterests.filter((i) => c.interests.includes(i));
          return (
            <div key={c.id} className="lkv2-mate" style={{ display: "grid", gridTemplateColumns: "36px 1fr auto 34px", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--c-line)" }}>
              {c.avatar
                ? <img src={`/api/avatars/${c.avatar}`} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", objectFit: "cover" }} />
                : <Initial fio={c.fio} size={36} radius="var(--r-sm)" />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--t-body)", fontWeight: 500, overflowWrap: "anywhere" }}>{c.fio ?? "Выпускник"}</div>
                <div style={{ ...label, fontSize: 10, marginTop: 3 }}>
                  {[c.cohort ? `выпуск ${c.cohort}` : null, c.level_title].filter(Boolean).join(" · ")}
                </div>
                {common.length > 0 && (
                  <div style={{ ...label, fontSize: 10, marginTop: 3, textTransform: "none", color: "var(--c-accent-text)" }}>
                    общее: {common.join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => addFriend.mutate(c.id)}
                disabled={addFriend.isPending || settled}
                className="foc"
                /* Без имени экранный диктор читает подряд десяток одинаковых «в друзья» */
                aria-label={`${FRIEND_LABEL[c.friend_status]} – ${c.fio ?? "выпускник"}`}
                style={
                  c.friend_status === "accepted" ? { ...actionGhost, color: "var(--c-ok-text)", cursor: "default" }
                  : c.friend_status === "pending" ? { ...actionGhost, cursor: "default" }
                  : action
                }
              >
                {FRIEND_LABEL[c.friend_status]}
              </button>
              {/* Ячейка есть всегда, даже пустая: иначе строки без «✕» съезжают
                  и колонка действий перестаёт быть колонкой. */}
              {c.friend_status === "none" ? <span aria-hidden /> : (
                <button onClick={() => removeFriend.mutate(c.id)} disabled={removeFriend.isPending} className="foc"
                  aria-label={c.friend_status === "accepted" ? `Удалить ${c.fio ?? "выпускника"} из друзей` : `Отменить заявку к ${c.fio ?? "выпускнику"}`}
                  style={{ ...actionGhost, padding: "8px 9px", width: 34 }}>✕</button>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/**
 * «Могу помочь» – честная минимальная версия: отдельного режима менторства
 * в системе нет, поэтому блок описывает текущее поведение – интересы из
 * профиля видны однокурсникам в разделе сообщества, и по ним вас могут найти.
 */
function CanHelp({ me }: { me: Me }) {
  const interests = me.alumni.interests ?? [];
  return (
    // id="can-help" – якорь для CTA «Могу помочь» из блока «Ваш этап».
    <div id="can-help">
      <Section title="Могу помочь">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--c-line)" }}>
          {interests.length ? (
            <span style={{ flex: 1, minWidth: 220, fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.55 }}>
              Вас могут найти однокурсники по темам: <b style={{ color: "var(--c-text)" }}>{interests.join(" · ")}</b>.
              Однокурсники видят ваши темы в разделе выше и могут обратиться за советом.
            </span>
          ) : (
            <span style={{ flex: 1, minWidth: 220, fontSize: "var(--t-body)", color: "var(--c-text-2)", lineHeight: 1.55 }}>
              Укажите темы, по которым готовы помочь, – однокурсники увидят их в разделе «Однокурсники» и смогут к вам обратиться.
            </span>
          )}
          <Link to={interests.length ? "/v2/lk/profile" : "/v2/lk/profile#interests"} className="foc"
            style={{ ...label, color: "var(--c-accent-text)", textDecoration: "none", whiteSpace: "nowrap" }}>
            {interests.length ? "изменить →" : "указать темы →"}
          </Link>
        </div>
      </Section>
    </div>
  );
}

/* ── Каркас ───────────────────────────────────────────────────────── */

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const me = useMe(token);
  const expired = me.isError && isAuthError(me.error);
  const { hash } = useLocation();

  // Протухшую сессию гасим сами: иначе кабинет остаётся в вечной ошибке,
  // а localStorage продолжает держать мёртвый токен.
  useEffect(() => {
    if (expired) onLogout();
  }, [expired, onLogout]);

  // Якоря из профиля (/v2/lk#push-bell, /v2/lk#tg-link): блоки дорисовываются
  // после /me и /me/tg-link, поэтому скроллим с задержкой, когда данные пришли.
  useEffect(() => {
    if (!hash || !me.data) return;
    const t = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
    }, 600);
    return () => clearTimeout(t);
  }, [hash, me.data]);

  return (
    <CabinetShell active="lk" onLogout={onLogout}>
      {me.isLoading && <p style={{ ...label, margin: 0 }}>загружаем кабинет…</p>}

      {me.isError && !expired && (
        <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 24 }}>
          <p style={{ ...label, color: "var(--c-danger-text)", margin: 0 }}>кабинет сейчас недоступен</p>
          <p style={{ margin: "10px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)" }}>Не удалось получить данные. Попробуйте ещё раз.</p>
          <button onClick={() => me.refetch()} className="foc" style={{ ...action, marginTop: 14, padding: "10px 16px", borderRadius: "var(--r-md)" }}>повторить</button>
        </div>
      )}

      {me.data && (
        <div className="lkv2-grid" style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: 28, alignItems: "start" }}>
          <div className="lkv2-aside" style={{ position: "sticky", top: 88 }}>
            <ClubCard me={me.data} />
          </div>
          <div>
            <Opportunities me={me.data} token={token} />
            <CareerStage me={me.data} />
            <ForMe token={token} />
            <EventsFeed token={token} />
            <MyEvents token={token} />
            <Orders token={token} />
            <Achievements me={me.data} />
            <Community token={token} myInterests={me.data.alumni.interests ?? []} />
            <CanHelp me={me.data} />
            <PushBell token={token} />
            <TgLink token={token} />
          </div>
        </div>
      )}
    </CabinetShell>
  );
}

export default function LkV2() {
  useHead({ title: "Личный кабинет", noindex: true });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [pending, setPending] = useState<AlumniBrief | null>(null);

  const onAuthed = (resp: LoginResponse) => {
    if (resp.alumni.verification_status === "verified") {
      localStorage.setItem(TOKEN_KEY, resp.token);
      setToken(resp.token);
    } else {
      setPending(resp.alumni);
    }
  };
  const doLogout = () => {
    logoutSession();
    setToken(null);
    setPending(null);
  };

  if (pending) return <PendingScreen alumni={pending} onBack={() => setPending(null)} />;
  if (!token) return <Gate onAuthed={onAuthed} />;
  return <Dashboard token={token} onLogout={doLogout} />;
}
