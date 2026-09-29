import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { loadBotCatalog } from "../support-bot/catalog.js";
import {
  createActionQueue,
  detectIntent,
  formatPrice,
  introFor,
  pickBy,
  priceRange,
  reply,
  sphereList,
  upcoming,
} from "../support-bot/bot-reply.js";
import type { BotFaqData, BotProgram, BotReply, BotReplyData } from "../support-bot/types.js";
import "./ClubSupportBot.css";

const GREETING =
  "Спрашивайте про программы ДПО, вступление в клуб, подкасты, мерч, события или кабинет.";
const HINTS = [
  "Подобрать программу",
  "Как вступить",
  "Подкасты",
  "Скидка выпускника",
  "Онлайн",
];
const TYPE_LABELS: Array<[string, string]> = [
  ["ПК", "Повышение квалификации"],
  ["ПП", "Переподготовка"],
];
const GAP_TEXT =
  "Об этом на сайте не написано, а придумывать я не стану. Напишите человеку в поддержку – ответят.";
const FAIL_TEXT = "Не получилось загрузить данные. Напишите в поддержку – ответим.";
const WAIT_TEXT = "Секунду, гружу программы…";

/** Счётчик gap/none без текста вопроса. */
function reportFaqHit(kind: "gap" | "none", gapId?: string) {
  void fetch("/api/support/faq-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, gapId, channel: "site" }),
    keepalive: true,
  }).catch(() => undefined);
}

type LogItem =
  | { id: string; kind: "say" | "mine" | "typing"; text: string }
  | { id: string; kind: "more"; href: string; label: string }
  | { id: string; kind: "escalate" }
  | { id: string; kind: "card"; program: BotProgram }
  | { id: string; kind: "hints"; labels: string[]; mode: "starter" | "pick" };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function programMeta(p: BotProgram): string {
  const priceLabel = typeof p.price === "number" ? formatPrice(p.price) : null;
  return [p.formatLabel || p.format, priceLabel, p.start].filter(Boolean).join(" · ");
}

async function loadFaq(): Promise<BotFaqData> {
  const res = await fetch("/content/bot-faq.json");
  if (!res.ok) throw new Error("faq");
  return (await res.json()) as BotFaqData;
}

type Props = { open: boolean; onClose: () => void };

export function ClubSupportBot({ open, onClose }: Props) {
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef(createActionQueue());
  const dataRef = useRef<BotReplyData | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const failureShown = useRef(false);
  const started = useRef(false);
  const seq = useRef(0);
  const nextId = () => `m-${++seq.current}`;

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const append = useCallback(
    (items: LogItem[]) => {
      setLog((prev) => [...prev, ...items]);
      scrollDown();
    },
    [scrollDown],
  );

  const respond = useCallback(
    (build: () => LogItem[]) => {
      if (reducedMotion()) {
        append(build());
        return;
      }
      const typingId = nextId();
      setLog((prev) => [...prev, { id: typingId, kind: "typing", text: "" }]);
      scrollDown();
      window.setTimeout(() => {
        setLog((prev) => [...prev.filter((x) => x.id !== typingId), ...build()]);
        scrollDown();
      }, 420);
    },
    [append, scrollDown],
  );

  const showFailure = useCallback(() => {
    if (failureShown.current) return;
    failureShown.current = true;
    respond(() => [
      { id: nextId(), kind: "say", text: FAIL_TEXT },
      { id: nextId(), kind: "escalate" },
    ]);
  }, [respond]);

  const ensureData = useCallback(() => {
    if (dataRef.current || busy) return;
    setBusy(true);
    Promise.all([loadBotCatalog(), loadFaq()])
      .then(([programs, faq]) => {
        const packed: BotReplyData = { programs, ...faq };
        dataRef.current = packed;
        queueRef.current.resolve(packed);
      })
      .catch(() => {
        queueRef.current.reject();
        showFailure();
      })
      .finally(() => setBusy(false));
  }, [busy, showFailure]);

  const runWhenReady = useCallback(
    (action: (data: BotReplyData) => LogItem[]) => {
      const wasEmpty = queueRef.current.isEmpty();
      const status = queueRef.current.run(
        (loaded) => respond(() => action(loaded)),
        showFailure,
        dataRef.current ?? undefined,
      );
      if (status === "queued" && wasEmpty) {
        append([{ id: nextId(), kind: "say", text: WAIT_TEXT }]);
      }
      ensureData();
    },
    [append, ensureData, respond, showFailure],
  );

  const renderReply = (out: BotReply): LogItem[] => {
    const items: LogItem[] = [];
    const pushSay = (t: string) => items.push({ id: nextId(), kind: "say", text: t });
    const pushCards = (list: BotProgram[]) => {
      for (const p of list) items.push({ id: nextId(), kind: "card", program: p });
    };
    const pushExtra = (extra?: BotProgram[]) => {
      if (!extra?.length) return;
      pushSay("Ещё нашла программы по теме:");
      pushCards(extra);
    };
    switch (out.kind) {
      case "programs":
        pushSay(out.intro);
        pushCards(out.programs);
        break;
      case "programs-weak":
        pushSay("Точного совпадения нет, вот близкое по теме:");
        pushCards(out.programs);
        break;
      case "duration":
        out.text.split("\n").forEach(pushSay);
        items.push({ id: nextId(), kind: "more", href: out.anchor, label: "Подробнее на сайте" });
        pushExtra(out.extra);
        break;
      case "answer":
        out.answer.text.split("\n").forEach(pushSay);
        items.push({ id: nextId(), kind: "more", href: out.answer.anchor, label: "Подробнее на сайте" });
        pushExtra(out.extra);
        break;
      case "gap":
        reportFaqHit("gap", out.gap.id);
        pushSay(GAP_TEXT);
        items.push({ id: nextId(), kind: "escalate" });
        break;
      case "none":
        reportFaqHit("none");
        pushSay("Такого не нашла. Вот что стартует ближе всего:");
        pushCards(out.programs);
        items.push({ id: nextId(), kind: "escalate" });
        break;
      default: {
        const _exhaustive: never = out;
        void _exhaustive;
      }
    }
    return items;
  };

  const ask = useCallback(
    (query: string) => {
      const text = String(query || "").trim();
      if (!text) return;
      append([{ id: nextId(), kind: "mine", text }]);
      const intent = detectIntent(text);
      if (intent === "pickProgram") {
        runWhenReady((data) => {
          const labels = [
            ...sphereList(data.programs),
            ...TYPE_LABELS.map(([, label]) => label),
          ];
          return [
            { id: nextId(), kind: "say", text: "Выберите сферу или тип программы:" },
            { id: nextId(), kind: "hints", labels, mode: "pick" },
          ];
        });
        return;
      }
      if (intent === "upcomingStarts") {
        runWhenReady((data) => {
          const list = upcoming(data.programs, 5).filter((p) => p.startIso || p.start);
          if (!list.length) return [{ id: nextId(), kind: "say", text: "Дат старта в каталоге сейчас нет." }];
          return [
            {
              id: nextId(),
              kind: "say",
              text: list.length === 1 ? "Ближайший старт:" : "Вот ближайшие старты:",
            },
            ...list.map((p) => ({ id: nextId(), kind: "card" as const, program: p })),
          ];
        });
        return;
      }
      if (intent === "priceRange") {
        runWhenReady((data) => {
          const range = priceRange(data.programs);
          if (!range) {
            return [{ id: nextId(), kind: "say", text: "Цены сейчас не в каталоге – загляните в раздел ДПО." }];
          }
          return [
            {
              id: nextId(),
              kind: "say",
              text: `Программы стоят от ${formatPrice(range.min)} до ${formatPrice(range.max)}.`,
            },
            {
              id: nextId(),
              kind: "say",
              text: "Могу отобрать по цене – напишите, например, «до 30000» или «от 50000».",
            },
            { id: nextId(), kind: "more", href: "/dpo", label: "Открыть витрину ДПО" },
          ];
        });
        return;
      }
      runWhenReady((data) => renderReply(reply(text, data)));
    },
    [append, runWhenReady],
  );

  const onPickHint = (label: string, mode: "starter" | "pick") => {
    if (mode === "starter") {
      ask(label);
      return;
    }
    append([{ id: nextId(), kind: "mine", text: label }]);
    const data = dataRef.current;
    if (!data) return;
    const typePair = TYPE_LABELS.find(([, l]) => l === label);
    const matched = typePair
      ? pickBy(data.programs, "type", typePair[0])
      : pickBy(data.programs, "sphere", label);
    respond(() => {
      if (!matched.length) {
        return [
          { id: nextId(), kind: "say", text: "Такого не нашла. Вот что стартует ближе всего:" },
          ...upcoming(data.programs, 3).map((p) => ({ id: nextId(), kind: "card" as const, program: p })),
          { id: nextId(), kind: "escalate" },
        ];
      }
      return [
        { id: nextId(), kind: "say", text: introFor("filter", matched.length) },
        ...matched.slice(0, 5).map((p) => ({ id: nextId(), kind: "card" as const, program: p })),
      ];
    });
  };

  useEffect(() => {
    if (!open) return;
    if (!started.current) {
      started.current = true;
      failureShown.current = false;
      queueRef.current = createActionQueue();
      dataRef.current = null;
      setLog([
        { id: nextId(), kind: "say", text: GREETING },
        { id: nextId(), kind: "hints", labels: HINTS, mode: "starter" },
      ]);
      ensureData();
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ensureData, onClose]);

  useEffect(() => {
    if (!open) {
      started.current = false;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="club-bot-panel is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="club-bot-head">
        <div className="club-bot-brand">
          <h2 id={titleId}>Поддержка клуба</h2>
        </div>
        <button type="button" className="club-bot-close foc" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="club-bot-log" ref={logRef} aria-live="polite">
        {log.map((item) => {
          switch (item.kind) {
            case "say":
              return (
                <p key={item.id} className="club-bot-say">
                  {item.text}
                </p>
              );
            case "mine":
              return (
                <p key={item.id} className="club-bot-mine">
                  {item.text}
                </p>
              );
            case "typing":
              return (
                <div key={item.id} className="club-bot-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              );
            case "more":
              return (
                <Link key={item.id} className="club-bot-more" to={item.href} onClick={onClose}>
                  {item.label}
                </Link>
              );
            case "escalate":
              return (
                <Link key={item.id} className="club-bot-apply" to="/support" onClick={onClose}>
                  Написать человеку
                </Link>
              );
            case "card":
              return (
                <article key={item.id} className="club-bot-card">
                  <Link to={item.program.url} onClick={onClose}>
                    {item.program.title}
                  </Link>
                  <p>{programMeta(item.program)}</p>
                </article>
              );
            case "hints":
              return (
                <div key={item.id} className="club-bot-hints">
                  {item.labels.map((label) => (
                    <button key={label} type="button" onClick={() => onPickHint(label, item.mode)}>
                      {label}
                    </button>
                  ))}
                </div>
              );
            default: {
              const _exhaustive: never = item;
              return _exhaustive;
            }
          }
        })}
      </div>
      <form
        className="club-bot-form"
        onSubmit={(e) => {
          e.preventDefault();
          const q = input.trim();
          if (!q) return;
          setInput("");
          ask(q);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Вопрос про клуб или ДПО"
          aria-label="Вопрос"
          autoComplete="off"
        />
        <button type="submit">Спросить</button>
      </form>
      <div className="club-bot-foot">
        <Link to="/support" className="club-bot-human" onClick={onClose}>
          Написать человеку
        </Link>
        <a
          className="club-bot-human"
          href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "pravohse_alumni_bot"}`}
          target="_blank"
          rel="noreferrer"
        >
          Telegram @{import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "pravohse_alumni_bot"}
        </a>
      </div>
    </div>
  );
}
