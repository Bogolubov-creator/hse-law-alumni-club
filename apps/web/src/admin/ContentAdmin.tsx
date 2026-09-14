import { useState } from "react";
import { EventsAdmin } from "./EventsAdmin.js";
import { NewsAdmin } from "./NewsAdmin.js";
import { PodcastsAdmin } from "./PodcastsAdmin.js";
import { PagesAdmin } from "./PagesAdmin.js";
import { ProgramsAdmin } from "./ProgramsAdmin.js";
import { ProductsAdmin } from "./ProductsAdmin.js";

export const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL as string) || "http://localhost:8055";

export function Content() {
  const [tab, setTab] = useState<"programs" | "products" | "events" | "news" | "podcasts" | "pages">("programs");
  const tabs = [
    { key: "programs" as const, label: "Программы ДПО", collection: "programs" },
    { key: "products" as const, label: "Товары (мерч)", collection: "products" },
    { key: "events" as const, label: "События", collection: "events" },
    { key: "news" as const, label: "Новости", collection: "news" },
    { key: "podcasts" as const, label: "Подкасты", collection: "podcasts" },
    { key: "pages" as const, label: "Страницы", collection: "pages" },
  ];
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  const directusCollection = `${DIRECTUS_URL.replace(/\/$/, "")}/admin/content/${active.collection}`;
  const directusFiles = `${DIRECTUS_URL.replace(/\/$/, "")}/admin/files`;
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-line)] text-[var(--c-text-2)]"}`}>{t.label}</button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={directusCollection} target="_blank" rel="noopener noreferrer" className="foc rounded-[11px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] px-4 py-2.5 font-mono text-[12px] text-[var(--c-text-3)]">
            Directus → {active.collection}
          </a>
          <a href={directusFiles} target="_blank" rel="noopener noreferrer" className="foc rounded-[11px] border border-[var(--c-line)] bg-[var(--c-bg-raised)] px-4 py-2.5 font-mono text-[12px] text-[var(--c-text-3)]">
            Медиа
          </a>
        </div>
      </div>
      <p className="mb-4 font-mono text-[11px] text-[var(--c-text-3)]">
        Быстрые правки – здесь. Схемы полей, файлы и роли – в Directus Studio по ссылке коллекции выше.
      </p>
      {tab === "programs" && <ProgramsAdmin />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "events" && <EventsAdmin />}
      {tab === "news" && <NewsAdmin />}
      {tab === "podcasts" && <PodcastsAdmin />}
      {tab === "pages" && <PagesAdmin />}
    </>
  );
}
