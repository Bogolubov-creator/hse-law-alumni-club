import { useState, useEffect } from "react";
import { usePageMutations, useAdminPage } from "../lib/admin.js";
import { Card, FormField } from "./common.js";

export function PagesAdmin() {
  const page = useAdminPage("home");
  const { savePage } = usePageMutations();
  const [hero, setHero] = useState<Record<string, string>>({});
  const [cta, setCta] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!page.data || loaded) return;
    const h = page.data.blocks.hero ?? {}, c = page.data.blocks.cta ?? {};
    setHero({ title_pre: h.title_pre ?? "", title_accent: h.title_accent ?? "", subtitle: h.subtitle ?? "", cta_primary: h.cta_primary ?? "" });
    setCta({ text: c.text ?? "", button: c.button ?? "" });
    setLoaded(true);
  }, [page.data, loaded]);

  const hset = (k: string, v: string) => setHero((s) => ({ ...s, [k]: v }));
  const cset = (k: string, v: string) => setCta((s) => ({ ...s, [k]: v }));
  const save = () => savePage.mutate({
    slug: "home",
    hero,
    cta,
  });

  if (page.isLoading) return <Card><p className="font-mono text-sm text-[var(--c-text-3)]">Загрузка…</p></Card>;
  if (page.isError) return <Card><p className="font-mono text-sm text-[var(--c-danger-text)]">Не удалось загрузить страницу.</p></Card>;

  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <Card>
        <div className="font-display text-lg font-semibold">Главная · Hero</div>
        <p className="mt-1 font-mono text-[11px] text-[var(--c-text-3)]">Первый экран: заголовок, подзаголовок и основная кнопка.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок (начало)" value={hero.title_pre ?? ""} onChange={(v) => hset("title_pre", v)} />
          <FormField label="Заголовок (акцент)" value={hero.title_accent ?? ""} onChange={(v) => hset("title_accent", v)} />
          <FormField label="Подзаголовок" value={hero.subtitle ?? ""} onChange={(v) => hset("subtitle", v)} textarea />
          <FormField label="Кнопка (основная)" value={hero.cta_primary ?? ""} onChange={(v) => hset("cta_primary", v)} />
        </div>
      </Card>
      <Card>
        <div className="font-display text-lg font-semibold">Главная · CTA-блок</div>
        <p className="mt-1 font-mono text-[11px] text-[var(--c-text-3)]">Тёмный блок призыва внизу страницы.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Текст" value={cta.text ?? ""} onChange={(v) => cset("text", v)} textarea />
          <FormField label="Кнопка" value={cta.button ?? ""} onChange={(v) => cset("button", v)} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={savePage.isPending} className="foc rounded-[11px] bg-[var(--c-accent)] px-6 py-2.5 font-semibold text-[var(--c-on-accent)] disabled:opacity-60">
            {savePage.isPending ? "Сохраняем…" : "Сохранить все секции"}
          </button>
          {savePage.isSuccess && <span className="font-mono text-[12px] text-[var(--c-ok-text)]">сохранено ✓ – уже на сайте</span>}
          {savePage.isError && <span className="font-mono text-[12px] text-[var(--c-danger-text)]">не удалось сохранить</span>}
        </div>
      </Card>
    </div>
  );
}
