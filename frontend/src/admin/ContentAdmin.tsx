import { useState } from "react";
import { EventsAdmin } from "./EventsAdmin.js";
import { NewsAdmin } from "./NewsAdmin.js";
import { PodcastsAdmin } from "./PodcastsAdmin.js";
import { PagesAdmin } from "./PagesAdmin.js";
import { ProgramsAdmin } from "./ProgramsAdmin.js";
import { ProductsAdmin } from "./ProductsAdmin.js";
import { MediaAdmin } from "./MediaAdmin.js";

export function Content() {
  const [tab, setTab] = useState<"programs" | "products" | "events" | "news" | "podcasts" | "pages" | "media">("programs");
  const tabs = [
    { key: "programs" as const, label: "Программы ДПО", collection: "programs" },
    { key: "products" as const, label: "Товары (мерч)", collection: "products" },
    { key: "events" as const, label: "События", collection: "events" },
    { key: "news" as const, label: "Новости", collection: "news" },
    { key: "podcasts" as const, label: "Подкасты", collection: "podcasts" },
    { key: "pages" as const, label: "Страницы", collection: "pages" },
    { key: "media" as const, label: "Медиа", collection: "media" },
  ];
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`foc rounded-[11px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-line)] text-[var(--c-text-2)]"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "programs" && <ProgramsAdmin />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "events" && <EventsAdmin />}
      {tab === "news" && <NewsAdmin />}
      {tab === "podcasts" && <PodcastsAdmin />}
      {tab === "pages" && <PagesAdmin />}
      {tab === "media" && <MediaAdmin />}
    </>
  );
}
