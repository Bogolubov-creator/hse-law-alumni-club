import { CabinetClubOverview } from "../components/CabinetClubOverview.js";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loginResponseSchema, ORDER_STATUS_RU, ORDER_STATUS_VERB_RU, type Classmate, type LkEvent } from "@club/shared";
import { apiPost, isAuthError, rub, type LoginResponse, type AlumniBrief, type Me, type MyOrder } from "../lib/api.js";
import { useMe, useMyOrders, useClassmates, useAddFriend, useRemoveFriend, useLkEvents } from "../lib/queries.js";
import { logout as logoutSession } from "../lib/cart.js";
import { useHead } from "../lib/title.js";
import { VisionCorner } from "../components/Vision.js";
import { BlankField, mono, disp } from "../v2/Shell.js";
import { Mark } from "../v2/Mark.js";
import { CabinetShell, DataRow, Section, Initial, TOKEN_KEY, label, field, action, actionGhost } from "../v2/cabinet.js";
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
 * Живёт на /lk рядом со старым кабинетом, чтобы их можно было сравнить.
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
    <main id="main" style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: "calc(24px + var(--cookie-h, 0px) + var(--tabs-h, 0px))" }}>
      <VisionCorner />
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, background: "var(--c-bg-raised)", border: "1px solid var(--c-line-control)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <Link to="/" className="foc" style={{ ...label, color: "var(--c-accent-text)", textDecoration: "none" }}>← на главную</Link>
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

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 16, fontSize: "var(--t-small)" }}>
          <Link to="/join" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Вступить в клуб</Link>
          <Link to="/forgot" className="foc" style={{ color: "var(--c-text-3)" }}>Забыли пароль?</Link>
        </div>
      </form>
      {/* Без панели экран входа – тупик: во вкладках «кабинет» ведёт сюда */}
      <MobileTabs />
    </main>
  );
}

function PendingScreen({ alumni, onBack }: { alumni: AlumniBrief; onBack: () => void }) {
  return (
    <main id="main" style={{ minHeight: "100dvh", background: "var(--c-bg)", color: "var(--c-text)", fontFamily: "var(--f-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: "calc(24px + var(--cookie-h, 0px) + var(--tabs-h, 0px))" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--c-bg-raised)", border: "1px solid var(--c-line-control)", borderRadius: "var(--r-lg)", padding: 32 }}>
        <div style={{ ...label, color: "var(--c-status-text)" }}>статус · pending</div>
        <h1 style={{ ...disp, fontWeight: 700, fontSize: "var(--t-h3)", margin: "12px 0 0" }}>Ожидает верификации</h1>
        <p style={{ margin: "12px 0 0", color: "var(--c-text-2)", fontSize: "var(--t-body)", lineHeight: 1.6 }}>
          {alumni.fio ?? "Выпускник"}, учебный офис сверяет выпуск с реестром факультета.
        </p>
        <ul style={{ margin: "16px 0 0", paddingLeft: 18, color: "var(--c-text-2)", fontSize: "var(--t-small)", lineHeight: 1.65 }}>
          <li>Кабинет, баллы и скидка на ДПО откроются после подтверждения.</li>
          <li>Заявки из корзины уже можно подавать – скидка подтянется после верификации.</li>
          <li>Обычно проверка занимает 1–2 рабочих дня.</li>
        </ul>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          <Link to="/dpo" className="foc" style={{ ...action, textAlign: "center", textDecoration: "none" }}>Смотреть программы ДПО</Link>
          <button onClick={onBack} className="foc" style={{ width: "100%", padding: "13px 20px", borderRadius: "var(--r-md)", border: "1px solid var(--c-line-control)", background: "transparent", color: "var(--c-text)", fontWeight: 600, cursor: "pointer" }}>Назад ко входу</button>
        </div>
      </div>
      <MobileTabs />
    </main>
  );
}

/* ── Удостоверение ────────────────────────────────────────────────── */

function Identity({ me }: { me: Me }) {
  const a = me.alumni;
  const l = me.level;
  const sub = [a.cohort ? `выпуск ${a.cohort}` : null, a.edu_program].filter(Boolean).join(" · ") || "выпускник клуба";

  return (
    <div style={{ border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)", padding: 22, background: "var(--c-bg-raised)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {a.avatar
          ? <img src={`/api/avatars/${a.avatar}`} alt="" width={64} height={64} style={{ width: 64, height: 64, flexShrink: 0, borderRadius: "var(--r-md)", objectFit: "cover" }} />
          : <Initial fio={a.fio} size={64} radius="var(--r-md)" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Сигнатура на своём месте: под чертой подписано, что в неё вписано */}
          <BlankField label={sub}>
            {/* Кегль ниже h3 и перенос только по словам: «Кондратьев Сергей
                Андреевич» в колонке 330px иначе рвётся посреди слова. */}
            <span style={{ ...disp, display: "block", fontWeight: 700, fontSize: 20, lineHeight: 1.2, hyphens: "none" }}>
              {a.fio ?? "Выпускник"}
            </span>
          </BlankField>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <DataRow name="уровень" value={l.level_title} />
        <DataRow name="баллы" value={String(l.points)} accent />
        <DataRow name="скидка выпускника" value={`${l.discount}%`} accent />
        <div style={{ ...label, marginTop: 4, color: "var(--c-text-3)" }}>скидка действует только на программы ДПО</div>
        {l.next_level && <DataRow name={`до «${l.next_level}»`} value={String(l.to_next)} />}
      </div>

      {a.referral_code && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--c-line)" }}>
          <div style={label}>код приглашения</div>
          <div style={{ ...mono, fontSize: 17, fontWeight: 500, marginTop: 6, letterSpacing: "0.08em", overflowWrap: "anywhere" }}>{a.referral_code}</div>
          <div style={{ ...mono, fontSize: "var(--t-micro)", color: "var(--c-text-3)", marginTop: 8 }}>
            приведено: {a.referrals_verified ?? 0} · ждут проверки: {a.referrals_pending ?? 0}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Разделы ──────────────────────────────────────────────────────── */

function EventsFeed({ token }: { token: string }) {
  const [showAll, setShowAll] = useState(false);
  const events = useLkEvents(token);
  const addFriend = useAddFriend(token);
  const removeFriend = useRemoveFriend(token);
  const list = events.data ?? [];
  if (!list.length) return null;

  return (
    <Section title="Уведомления">
      {(showAll ? list : list.slice(0, 3)).map((e: LkEvent, i) => {
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
      {list.length > 3 && <button className="foc" style={{ ...actionGhost, marginTop: 14 }} onClick={() => setShowAll(v => !v)}>{showAll ? "Свернуть уведомления" : `Все уведомления (${list.length})`}</button>}
    </Section>
  );
}

function Orders({ token, compact = false }: { token: string; compact?: boolean }) {
  const orders = useMyOrders(token);
  const list = orders.data ?? [];
  return (
    <Section title="Мои заявки" note={list.length ? `всего ${list.length}` : undefined}>
      {orders.isLoading && <p style={{ ...label, margin: 0 }}>загружаем…</p>}
      {orders.isError && <p role="alert">Не удалось загрузить заявки. <button onClick={() => orders.refetch()}>Повторить</button></p>}
      {!orders.isLoading && !orders.isError && list.length === 0 && (
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          Заявок пока нет. <Link to="/dpo" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Посмотреть программы ДПО →</Link>
        </p>
      )}
      {(compact ? list.slice(0, 3) : list).map((o: MyOrder) => (
        <details key={o.number} style={{ padding: "16px 0", borderTop: "1px solid var(--c-line)", overflowWrap: "anywhere" }}>
          <summary className="foc" style={{ cursor: "pointer", padding: "8px 0", lineHeight: 1.6 }}><strong>{o.number}</strong> · {ORDER_STATUS_RU[o.status] ?? o.status} · {rub(o.total_estimate)}</summary>
          <p>Создана: {new Date(o.created_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва)</p>
          {!!o.items_json?.length && <ul>{o.items_json.map((item, i) => <li key={i} style={{ marginBlock: 12 }}>{item.title}{item.variant_sku && ` · ${item.variant_sku}`} · {item.qty} шт. × {rub(item.price)}</li>)}</ul>}
          <p>До скидки: {rub(o.subtotal)}. Скидка на ДПО: {o.member_discount}%.</p>
          <p>Получение: {o.fulfillment === "delivery" ? "Доставка" : "Самовывоз"}. {o.payment_status === "succeeded" ? "Оплата подтверждена" : "Оплата не подтверждена"}.</p>
        </details>
      ))}
      {compact && list.length > 3 && <Link to="/lk?section=orders" className="foc" style={{ display: "inline-block", marginTop: 18, color: "var(--c-text)", textUnderlineOffset: 4 }}>Все заявки ({list.length})</Link>}
    </Section>
  );
}

function Achievements({ me }: { me: Me }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "all" | "earned" = searchParams.get("view") === "earned" ? "earned" : "all";
  const setView = (next: "all" | "earned") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", "achievements");
    nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
  };
  const earned = me.achievements.filter(a => a.earned);
  const list = view === "earned" ? earned : me.achievements;

  if (!me.achievements.length) {
    return (
      <Section title="Достижения">
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14, lineHeight: 1.6 }}>
          Каталог достижений появится после верификации и участия в жизни клуба – встречи, ДПО и активность в сообществе.
        </p>
        <p style={{ margin: "14px 0 0", display: "flex", flexWrap: "wrap", gap: 14, fontSize: "var(--t-small)" }}>
          <Link to="/events" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Афиша событий →</Link>
          <Link to="/dpo" className="foc" style={{ color: "var(--c-accent-text)", fontWeight: 600 }}>Программы ДПО →</Link>
        </p>
      </Section>
    );
  }

  return <Section title="Достижения" note={`получено ${earned.length} из ${me.achievements.length}`}>
    <div className="club-awards-intro">
      <div><h3>Ваша коллекция клуба</h3><p>Встречи, учёба и участие в жизни сообщества становятся частью вашей истории.</p></div>
      <div className="club-awards-total"><strong>{earned.length}<span> / {me.achievements.length}</span></strong><span>достижений получено</span></div>
    </div>
    <div className="club-awards-switch" role="group" aria-label="Показать достижения">
      <button className="foc" aria-pressed={view === "all"} onClick={() => setView("all")}>Все достижения ({me.achievements.length})</button>
      <button className="foc" aria-pressed={view === "earned"} onClick={() => setView("earned")}>Полученные ({earned.length})</button>
    </div>
    <p className="club-awards-hint">{view === "all" ? "Общий каталог для всех участников. Нажмите на знак, чтобы узнать условия." : "Здесь собраны ваши полученные достижения."}</p>
    {list.length === 0 && <div className="club-awards-empty"><h3>Коллекция ещё впереди</h3><p>Посмотрите общий каталог и выберите, с чего начнёте.</p><button className="foc" onClick={() => setView("all")}>Посмотреть все достижения</button></div>}
    <div className="club-achievement-list">
      {list.map(a => <details key={a.key} data-achievement={a.key} className={`club-award ${a.earned ? "is-earned" : ""}`}>
        <summary className="foc">
          <span className="club-award-medal" aria-hidden="true"><span>{a.icon}</span></span>
          <h3>{a.title}</h3>
          <span className="club-award-status">{a.earned ? "получено" : `${a.current} / ${a.target}`}</span>
          <progress value={a.current} max={Math.max(1, a.target)} aria-label={`Прогресс: ${a.title}`} />
          <span className="club-award-disclosure">Условия <span aria-hidden="true">+</span></span>
        </summary>
        <div className="club-award-description"><p>{a.description}</p><span>{a.kind}: {a.current} / {a.target}</span></div>
      </details>)}
    </div>
  </Section>;
}

const FRIEND_LABEL: Record<Classmate["friend_status"], string> = {
  none: "в друзья", incoming: "принять", pending: "заявка отправлена", accepted: "в друзьях",
};

function Community({ token }: { token: string }) {
  const classmates = useClassmates(token);
  const addFriend = useAddFriend(token);
  const removeFriend = useRemoveFriend(token);
  const list = classmates.data ?? [];
  const friends = list.filter((c) => c.friend_status === "accepted").length;

  return (
    <Section title="Однокурсники" note={list.length ? `${list.length} чел. · в друзьях ${friends}` : undefined}>
      {classmates.isLoading && <p style={{ ...label, margin: 0 }}>загружаем…</p>}
      {!classmates.isLoading && list.length === 0 && (
        <p style={{ margin: 0, color: "var(--c-text-2)", fontSize: "var(--t-body)", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          Из вашего выпуска и программы в клубе пока никого нет. Появятся, как только учебный офис их верифицирует.
        </p>
      )}
      {list.map((c) => {
        const settled = c.friend_status === "accepted" || c.friend_status === "pending";
        return (
          <div key={c.id} className="lkv2-mate" style={{ display: "grid", gridTemplateColumns: "36px 1fr auto 34px", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--c-line)" }}>
            {c.avatar
              ? <img src={`/api/avatars/${c.avatar}`} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", objectFit: "cover" }} />
              : <Initial fio={c.fio} size={36} radius="var(--r-sm)" />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--t-body)", fontWeight: 500, overflowWrap: "anywhere" }}>{c.fio ?? "Выпускник"}</div>
              <div style={{ ...label, fontSize: "var(--t-micro)", marginTop: 3 }}>
                {[c.cohort ? `выпуск ${c.cohort}` : null, c.level_title].filter(Boolean).join(" · ")}
              </div>
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
  );
}

/* ── Каркас ───────────────────────────────────────────────────────── */

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [sectionParams, setSectionParams] = useSearchParams();
  const section = sectionParams.get("section") ?? "overview";
  const me = useMe(token);
  const expired = me.isError && isAuthError(me.error);

  // Протухшую сессию гасим сами: иначе кабинет остаётся в вечной ошибке,
  // а localStorage продолжает держать мёртвый токен.
  useEffect(() => {
    if (expired) onLogout();
  }, [expired, onLogout]);

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
        <div className="lkv2-grid" style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
          <div className="lkv2-aside" style={{ position: "sticky", top: 88 }}>
            <div className="club-identity-desktop"><Identity me={me.data} /></div><details className="club-identity-mobile"><summary>{me.data.alumni.fio}<span>Статус, баллы и приглашение</span></summary><Identity me={me.data} /></details>
          </div>
          <div>
            <nav aria-label="Разделы кабинета" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
              {[["overview", "Обзор"], ["orders", "Мои заявки"], ["community", "Сообщество"], ["achievements", "Достижения"]].map(([key, title]) => (
                <button
                  key={key}
                  className="foc"
                  aria-pressed={section === key}
                  style={section === key ? action : actionGhost}
                  onClick={() => {
                    if (key === "achievements") {
                      const next = new URLSearchParams();
                      next.set("section", "achievements");
                      const currentView = sectionParams.get("view");
                      next.set("view", currentView === "earned" ? "earned" : "all");
                      setSectionParams(next, { replace: true });
                    } else {
                      setSectionParams({ section: key! }, { replace: true });
                    }
                  }}
                >{title}</button>
              ))}
            </nav>
            {section === "overview" && <><CabinetClubOverview me={me.data} token={token} /><EventsFeed token={token} /></>}
            {(section === "overview" || section === "orders") && <Orders token={token} compact={section === "overview"} />}
            {section === "achievements" && <Achievements me={me.data} />}
            {section === "community" && <Community token={token} />}
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
