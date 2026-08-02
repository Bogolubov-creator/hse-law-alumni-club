import { useState } from "react";
import { ProgramsAdmin } from "./Programs.js";
import { ProductsAdmin } from "./Products.js";
import { EventsAdmin } from "./Events.js";
import { NewsAdmin } from "./News.js";
import { TimelineAdmin } from "./Timeline.js";
import { PodcastsAdmin } from "./Podcasts.js";
import { PagesAdmin } from "./Pages.js";

const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL as string) || "http://localhost:8055";

// ── Контент: управление каталогом (программы ДПО + мерч) ─────────────
export function Content() {
  const [tab, setTab] = useState<"programs" | "products" | "events" | "news" | "timeline" | "podcasts" | "pages">("programs");
  const tabs = [
    { key: "programs" as const, label: "Программы ДПО" },
    { key: "products" as const, label: "Товары (мерч)" },
    { key: "events" as const, label: "События" },
    { key: "news" as const, label: "Новости" },
    { key: "timeline" as const, label: "История" },
    { key: "podcasts" as const, label: "Подкасты" },
    { key: "pages" as const, label: "Страницы" },
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-grafit text-kost" : "border border-[#E5E7EB] bg-white"}`}>{t.label}</button>
        ))}
        <a href={DIRECTUS_URL} target="_blank" rel="noopener noreferrer" className="foc ml-auto rounded-[11px] border border-[#E5E7EB] bg-white px-4 py-2.5 font-mono text-[12px] text-grafit-soft">Directus Studio → медиа</a>
      </div>
      {tab === "programs" && <ProgramsAdmin />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "events" && <EventsAdmin />}
      {tab === "news" && <NewsAdmin />}
      {tab === "timeline" && <TimelineAdmin />}
      {tab === "podcasts" && <PodcastsAdmin />}
      {tab === "pages" && <PagesAdmin />}
    </>
  );
}
