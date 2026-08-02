import { useState, useEffect } from "react";
import { useAdminPage, useAdminMutations } from "../../lib/admin.js";
import { Card, FormField } from "../ui.js";

/** Наполнение главной: hero + CTA-блок. Изменения сразу видны на сайте. */
export function PagesAdmin() {
  const page = useAdminPage("home");
  const { savePage } = useAdminMutations();
  const [hero, setHero] = useState<Record<string, string>>({});
  const [cta, setCta] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [history, setHistory] = useState<Record<string, string>>({});
  const [marquee, setMarquee] = useState("");

  useEffect(() => {
    if (!page.data || loaded) return;
    const h = page.data.blocks.hero ?? {}, c = page.data.blocks.cta ?? {};
    setHero({ badge: h.badge ?? "", title_pre: h.title_pre ?? "", title_accent: h.title_accent ?? "", subtitle: h.subtitle ?? "", cta_primary: h.cta_primary ?? "", cta_secondary: h.cta_secondary ?? "" });
    setCta({ title: c.title ?? "", text: c.text ?? "", button: c.button ?? "" });
    setHistory({ history_eyebrow: h.history_eyebrow ?? "История клуба", history_title: h.history_title ?? "От первого выпуска – к сообществу", history_hint: h.history_hint ?? "↓ листайте – таймлайн движется вбок" });
    setMarquee((h.marquee?.length ? h.marquee : ["Выпуск ’24", "Выпуск ’25", "Менторы клуба", "Учебный офис", "Партнёры", "ДПО", "Мерч", "Нетворкинг"]).join(", "));
    setLoaded(true);
  }, [page.data, loaded]);

  const hset = (k: string, v: string) => setHero((s) => ({ ...s, [k]: v }));
  const cset = (k: string, v: string) => setCta((s) => ({ ...s, [k]: v }));
  const xset = (k: string, v: string) => setHistory((s) => ({ ...s, [k]: v }));
  const save = () => savePage.mutate({
    slug: "home",
    hero: { ...hero, ...history, marquee: marquee.split(",").map((x) => x.trim()).filter(Boolean) },
    cta,
  });

  if (page.isLoading) return <Card><p className="font-mono text-sm text-grafit-soft">Загрузка…</p></Card>;
  if (page.isError) return <Card><p className="font-mono text-sm text-karmin">Не удалось загрузить страницу.</p></Card>;

  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <Card>
        <div className="font-display text-lg font-semibold">Главная · Hero</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Первый экран: бейдж, заголовок, подзаголовок, кнопки.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Бейдж" value={hero.badge ?? ""} onChange={(v) => hset("badge", v)} />
          <FormField label="Заголовок (начало)" value={hero.title_pre ?? ""} onChange={(v) => hset("title_pre", v)} />
          <FormField label="Заголовок (акцент)" value={hero.title_accent ?? ""} onChange={(v) => hset("title_accent", v)} />
          <FormField label="Подзаголовок" value={hero.subtitle ?? ""} onChange={(v) => hset("subtitle", v)} textarea />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Кнопка (основная)" value={hero.cta_primary ?? ""} onChange={(v) => hset("cta_primary", v)} />
            <FormField label="Кнопка (вторая)" value={hero.cta_secondary ?? ""} onChange={(v) => hset("cta_secondary", v)} />
          </div>
        </div>
      </Card>
      <Card>
        <div className="font-display text-lg font-semibold">Главная · CTA-блок</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Тёмный блок призыва внизу страницы.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Заголовок" value={cta.title ?? ""} onChange={(v) => cset("title", v)} />
          <FormField label="Текст" value={cta.text ?? ""} onChange={(v) => cset("text", v)} textarea />
          <FormField label="Кнопка" value={cta.button ?? ""} onChange={(v) => cset("button", v)} />
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg font-semibold">Главная · История клуба и лента</div>
        <p className="mt-1 font-mono text-[11px] text-grafit-soft">Заголовок секции «История клуба» и бегущая лента над ней.</p>
        <div className="mt-4 space-y-3">
          <FormField label="Надзаголовок (мелкий, оранжевый)" value={history.history_eyebrow ?? ""} onChange={(v) => xset("history_eyebrow", v)} ph="История клуба" />
          <FormField label="Заголовок секции" value={history.history_title ?? ""} onChange={(v) => xset("history_title", v)} ph="От первого выпуска – к сообществу" />
          <FormField label="Подсказка под заголовком" value={history.history_hint ?? ""} onChange={(v) => xset("history_hint", v)} ph="↓ листайте – таймлайн движется вбок" />
          <FormField label="Бегущая лента (пункты через запятую)" value={marquee} onChange={setMarquee} textarea ph="Выпуск ’24, Выпуск ’25, Менторы клуба, …" />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={savePage.isPending} className="foc rounded-[11px] bg-ohra px-6 py-2.5 font-semibold text-kost disabled:opacity-60">
            {savePage.isPending ? "Сохраняем…" : "Сохранить все секции"}
          </button>
          {savePage.isSuccess && <span className="font-mono text-[12px] text-[#1F8A5B]">сохранено ✓ – уже на сайте</span>}
          {savePage.isError && <span className="font-mono text-[12px] text-karmin">не удалось сохранить</span>}
        </div>
      </Card>
    </div>
  );
}
