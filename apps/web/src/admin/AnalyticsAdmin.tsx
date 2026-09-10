import { useState } from "react";
import { ORDER_STATUS_RU } from "@club/shared";
import { rub } from "../lib/api.js";
import {
  downloadAnalyticsCsv,
  useAnalytics,
  type AnalyticsRange,
} from "../lib/admin.js";
import { mono, label, actionGhost, Panel, PanelTitle, Row, Stat } from "./ui.js";

const RANGE_LABEL: Record<AnalyticsRange, string> = {
  "7d": "7 дней",
  "30d": "30 дней",
  "90d": "90 дней",
};

const ORDER_TYPE_RU: Record<string, string> = {
  dpo: "ДПО",
  merch: "Мерч",
  mixed: "Смешанная",
};

const REASON_RU: Record<string, string> = {
  program: "Программа ДПО",
  event: "Событие",
  referral: "Реферал",
  mentorship: "Менторство",
  order: "Заказ",
  decay: "Списание",
  manual: "Офис",
  achievement: "Достижение",
};

const SUPPORT_STATUS_RU: Record<string, string> = {
  open: "Открыты",
  answered: "С ответом",
  closed: "Закрыты",
};

function BucketTable({
  title,
  rows,
  empty,
  valueLabel = "шт.",
}: {
  title: string;
  rows: Array<{ name: string; value: string | number }>;
  empty: string;
  valueLabel?: string;
}) {
  return (
    <Panel>
      <PanelTitle>{title}</PanelTitle>
      {rows.length === 0 && (
        <p style={{ ...label, margin: "12px 0 0", textTransform: "none", letterSpacing: 0 }}>{empty}</p>
      )}
      {rows.map((r) => (
        <Row key={r.name} cols="minmax(0,1fr) auto">
          <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          <span style={{ ...mono, fontSize: 13, color: "var(--c-text-2)" }}>{r.value}{typeof r.value === "number" ? ` ${valueLabel}` : ""}</span>
        </Row>
      ))}
    </Panel>
  );
}

export default function AnalyticsAdmin() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const q = useAnalytics(range);
  const d = q.data;
  const p = d?.pulse;

  const exportCsv = async () => {
    setCsvErr(null);
    setCsvBusy(true);
    try {
      await downloadAnalyticsCsv(range);
    } catch (e) {
      setCsvErr((e as Error).message);
    } finally {
      setCsvBusy(false);
    }
  };

  const pulseStats = [
    { label: "Новые участники", value: p?.joins ?? 0, note: `регистраций в журнале ${p?.registers ?? 0}` },
    { label: "Верифицировано", value: p?.verified_in_range ?? 0 },
    { label: "Заявки", value: p?.orders_created ?? 0, note: `новые ${p?.orders_new ?? 0} · оплачено ${p?.orders_paid ?? 0}` },
    { label: "RSVP", value: p?.rsvps ?? 0 },
    { label: "Прослушивания", value: p?.podcast_plays ?? 0 },
    { label: "Достижения", value: p?.achievements_granted ?? 0 },
    { label: "Рефералы", value: p?.referrals_alumni ?? 0, note: `начислений ${p?.referrals_ledger ?? 0}` },
    { label: "Дружбы", value: p?.friendships_new ?? 0 },
    { label: "Push-подписки", value: p?.push_subs_new ?? 0 },
    { label: "Входы OK", value: p?.login_ok ?? 0, note: `ошибки ${p?.login_fail ?? 0} · блоки ${p?.login_locked ?? 0}` },
    {
      label: "Тикеты поддержки",
      value: p?.support_created ?? "—",
      note: p?.support_open != null ? `открыто сейчас ${p.support_open}` : "БД поддержки недоступна",
    },
  ] as { label: string; value: number | string; note?: string }[];

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 22 }}>
        <div role="group" aria-label="Период" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["7d", "30d", "90d"] as const).map((r) => {
            const on = range === r;
            return (
              <button
                key={r}
                type="button"
                className="foc"
                aria-pressed={on}
                onClick={() => setRange(r)}
                style={{
                  ...mono,
                  fontSize: 12,
                  letterSpacing: "var(--tr-data)",
                  textTransform: "uppercase",
                  padding: "8px 14px",
                  borderRadius: "var(--r-sm)",
                  border: `1px solid ${on ? "var(--c-accent)" : "var(--c-line-control)"}`,
                  background: on ? "var(--c-bg-sunken)" : "transparent",
                  color: on ? "var(--c-text)" : "var(--c-text-3)",
                  cursor: "pointer",
                }}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <button type="button" className="foc" disabled={csvBusy || q.isLoading} onClick={() => void exportCsv()} style={{ ...actionGhost, marginLeft: "auto" }}>
          {csvBusy ? "Выгрузка…" : "Скачать CSV"}
        </button>
      </div>

      {csvErr && (
        <p role="alert" style={{ ...mono, margin: "0 0 16px", fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>{csvErr}</p>
      )}

      {q.isLoading && <p style={{ ...label, margin: 0, textTransform: "none" }}>Считаем агрегаты…</p>}
      {q.isError && (
        <p role="alert" style={{ ...mono, margin: 0, fontSize: "var(--t-caption)", color: "var(--c-danger-text)" }}>
          Не удалось загрузить аналитику.{" "}
          <button type="button" className="foc" onClick={() => q.refetch()} style={{ ...mono, background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
            Повторить
          </button>
        </p>
      )}

      {d && (
        <>
          <p style={{ ...label, margin: "0 0 16px", textTransform: "none", letterSpacing: 0, color: "var(--c-text-3)" }}>
            Окно с {new Date(d.since).toLocaleDateString("ru-RU")} · снимок: {d.snapshot.alumni_verified} из {d.snapshot.alumni_count} верифицированы ({d.snapshot.verified_ratio}%)
            {d.orders.paid_sum_kop > 0 ? ` · оплачено на ${rub(d.orders.paid_sum_kop)}` : ""}
          </p>

          <div className="adm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 28px" }}>
            {pulseStats.map((s) => (
              <Stat key={s.label} name={s.label} value={s.value} note={s.note} />
            ))}
          </div>

          <div className="adm-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }}>
            <BucketTable
              title="Заявки по типу"
              empty="Заявок за период нет."
              rows={d.orders.by_type.map((x) => ({ name: ORDER_TYPE_RU[x.key] ?? x.key, value: x.count }))}
            />
            <BucketTable
              title="Заявки по статусу"
              empty="Заявок за период нет."
              rows={d.orders.by_status.map((x) => ({ name: ORDER_STATUS_RU[x.key] ?? x.key, value: x.count }))}
            />
            <BucketTable
              title="Топ программ ДПО"
              empty="В заявках за период нет позиций ДПО."
              valueLabel=""
              rows={(d.orders.programs_top ?? []).map((x) => ({
                name: x.title,
                value: `${x.qty} поз. · ${x.orders} заявок`,
              }))}
            />
            <BucketTable
              title="Баллы по причинам"
              empty="Начислений за период нет."
              rows={d.community.points_by_reason.map((x) => ({ name: REASON_RU[x.key] ?? x.key, value: x.count }))}
            />
            <BucketTable
              title="Достижения"
              empty="Выданных достижений нет."
              rows={d.community.achievements_top.map((x) => ({ name: x.title, value: x.count }))}
            />
            <BucketTable
              title="События по RSVP"
              empty="Записей на события нет."
              valueLabel=""
              rows={d.engagement.events_top.map((x) => ({
                name: x.title,
                value: `${x.rsvps} RSVP · ${x.attended} были`,
              }))}
            />
            <BucketTable
              title="Подкасты"
              empty="Прослушиваний нет."
              valueLabel=""
              rows={d.engagement.podcasts_top.map((x) => ({
                name: x.title,
                value: `${x.plays} · ${x.listeners} слуш.`,
              }))}
            />
            <BucketTable
              title="Поддержка: статусы"
              empty={d.support.open == null && d.support.created_in_range == null ? "БД поддержки недоступна." : "Тикетов за период нет."}
              rows={d.support.by_status.map((x) => ({ name: SUPPORT_STATUS_RU[x.status] ?? x.status, value: x.count }))}
            />
            <BucketTable
              title="Поддержка: темы"
              empty={d.support.by_topic.length ? "" : "Тем за период нет."}
              rows={d.support.by_topic.map((x) => ({ name: x.topic, value: x.count }))}
            />
            <BucketTable
              title="Вступления по дням"
              empty="Нет вступлений за период."
              rows={d.series.joins_by_day.filter((x) => x.count > 0).map((x) => ({ name: x.day, value: x.count }))}
            />
            <BucketTable
              title="Заявки по дням"
              empty="Нет заявок за период."
              rows={d.series.orders_by_day.filter((x) => x.count > 0).map((x) => ({ name: x.day, value: x.count }))}
            />
            <BucketTable
              title="Просмотры по дням"
              empty={d.pageviews.hits == null ? "БД просмотров недоступна." : "Нет просмотров за период (нужно «Принять все» у посетителей)."}
              rows={(d.series.pageviews_by_day ?? []).filter((x) => x.count > 0).map((x) => ({ name: x.day, value: x.count }))}
            />
            <BucketTable
              title="Топ страниц"
              empty={d.pageviews.hits == null ? "БД просмотров недоступна." : "Просмотров с согласием cookies нет."}
              rows={(d.pageviews.paths_top ?? []).map((x) => ({ name: x.path, value: x.count }))}
            />
          </div>

          <p style={{ ...label, margin: "28px 0 0", textTransform: "none", letterSpacing: 0, color: "var(--c-text-3)", lineHeight: 1.5 }}>
            Просмотры – только при «Принять все»: путь и день UTC, без IP и user-id.
            FAQ-бот – во вкладке Support; очереди – в «Обзор»; сырой след – в «Журнале».
          </p>
        </>
      )}
    </>
  );
}
