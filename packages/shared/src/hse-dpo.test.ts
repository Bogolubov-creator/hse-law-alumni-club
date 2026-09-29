import { describe, it, expect } from "vitest";
import {
  parseHseDpoCards,
  parseHseInitialState,
  mapHseStateItem,
  collectHseDpoCards,
  humanizeDate,
  mapHseFormat,
  parseHsePrice,
  hseDpoPageUrl,
  HSE_DPO_ACTUAL_URL,
} from "./hse-dpo";
import { slugifyRu, normalizeTitle } from "./slug";

// Фикстура – фрагмент реальной вёрстки листинга hse.ru (dpob-card), 2 карточки.
const FIXTURE = `
<div class="dpob-cards__list">
<div class="dpob-card dpob-cards__item"><div class="dpob-card__heading"><div>
<div class="dpob-card__category">Право</div>
<h3 class="dpob-title dpob-card__title"><a href="https://www.hse.ru/edu/dpo/958734693" title="Актуальные вопросы гражданского права" class="dpob-card__title-inner">Актуальные вопросы гражданского права</a></h3>
</div></div>
<div class="dpob-card__type"><p class="dpob-color-orange dpob-card__type-text"><span>ПК</span></p></div>
<div class="dpob-card__bottom"><ul class="dpob-card__icons">
<li class="dpob-card__stat"><p class="dpob-icon_pin dpob-icon dpob-card__icon dpob-icon_card" title="Кампус">Москва</p></li>
<li class="dpob-card__stat"><p class="dpob-icon_home dpob-icon dpob-card__icon dpob-icon_card" title="Формат обучения">Онлайн асинхронный</p></li>
</ul><ul class="dpob-card__icons">
<li class="dpob-card-important dpob-card__stat"><p class="dpob-icon_date dpo-strong dpob-icon dpob-card__icon dpob-icon_card" title="Дата начала">06.07.2026</p></li>
</ul>
<div class="dpob-card__buttons"><div class="dpob-card__price"><div>22 000 ₽</div></div></div>
</div></div>
<div class="dpob-card dpob-cards__item"><div class="dpob-card__heading"><div>
<div class="dpob-card__category">Право</div>
<h3 class="dpob-title dpob-card__title"><a href="https://www.hse.ru/edu/dpo/961021723" title="Французское (европейское) экономическое право" class="dpob-card__title-inner">Французское (европейское) экономическое право / Droit économique</a></h3>
</div></div>
<div class="dpob-card__type"><p class="dpob-color-orange dpob-card__type-text"><span>ПП</span></p></div>
<div class="dpob-card__bottom"><ul class="dpob-card__icons">
<li class="dpob-card__stat"><p title="Формат обучения" class="dpob-icon_card">Смешанный</p></li>
<li class="dpob-card__stat"><p title="Продолжительность" class="dpob-icon_card">6 месяцев</p></li>
</ul>
<div class="dpob-card__buttons"><div class="dpob-card__price"><div>180 000 ₽</div></div></div>
</div></div>
</div>`;

const STATE_FIXTURE = `<html><script>
window.__INITIAL_STATE__ = {
  items: [
    {
      id: 958734693,
      title: "Актуальные вопросы гражданского права",
      url: "https://www.hse.ru/edu/dpo/958734693",
      type: { shortTitle: "ПК", title: "Повышение квалификации", __proto__: null },
      studyFormat: { title: "Онлайн асинхронный", __proto__: null },
      startDate: new Date(1783296000000),
      isStartDateWithoutDay: false,
      hours: "5 недель",
      educationPricing: 22000,
      discountPrice: null,
      __proto__: null
    },
    {
      id: 961021723,
      title: "Французское экономическое право",
      url: "https://www.hse.ru/edu/dpo/961021723",
      type: { shortTitle: "ПП", __proto__: null },
      studyFormat: { title: "Смешанный", __proto__: null },
      startDate: new Date(1786003200000),
      educationPricing: 180000,
      __proto__: null
    }
  ],
  total: 31,
  pageSize: 20,
  __proto__: null
};
window.__URQL_DATA__ = {};
</script></html>`;

describe("parseHseDpoCards (листинг hse.ru)", () => {
  const cards = parseHseDpoCards(FIXTURE);
  it("разбирает обе карточки", () => {
    expect(cards).toHaveLength(2);
  });
  it("поля первой карточки (ПК, онлайн, дата, цена в копейках)", () => {
    expect(cards[0]).toMatchObject({
      hseId: "958734693", type: "ПК", format: "online",
      title: "Актуальные вопросы гражданского права",
      start: "6 июля 2026", priceKop: 2_200_000, duration: null,
    });
  });
  it("вторая: ПП, смешанный, длительность, без даты", () => {
    expect(cards[1]).toMatchObject({ type: "ПП", format: "blended", duration: "6 месяцев", start: null, priceKop: 18_000_000 });
  });
  it("битый HTML → пустой список, не исключение", () => {
    expect(parseHseDpoCards("<html><body>дичь</body></html>")).toEqual([]);
  });
});

describe("parseHseInitialState + mapHseStateItem", () => {
  it("разбирает __INITIAL_STATE__ с Date и __proto__", () => {
    const page = parseHseInitialState(STATE_FIXTURE);
    expect(page.total).toBe(31);
    expect(page.pageSize).toBe(20);
    expect(page.items).toHaveLength(2);
    const first = mapHseStateItem(page.items[0]);
    expect(first).toMatchObject({
      hseId: "958734693",
      type: "ПК",
      format: "online",
      priceKop: 2_200_000,
      duration: "5 недель",
    });
    expect(first?.start).toMatch(/2026/);
  });

  it("collectHseDpoCards ходит по страницам", async () => {
    let calls = 0;
    const cards = await collectHseDpoCards(HSE_DPO_ACTUAL_URL, async (url) => {
      calls++;
      if (url.includes("page=2")) {
        return `<html><script>window.__INITIAL_STATE__ = { items: [{ id: 2, title: "B", url: "https://www.hse.ru/edu/dpo/2", type: { shortTitle: "ПК" }, studyFormat: { title: "Онлайн" }, educationPricing: 1, __proto__: null }], total: 2, pageSize: 1, __proto__: null }; window.__URQL_DATA__ = {};</script></html>`;
      }
      return `<html><script>window.__INITIAL_STATE__ = { items: [{ id: 1, title: "A", url: "https://www.hse.ru/edu/dpo/1", type: { shortTitle: "ПК" }, studyFormat: { title: "Онлайн" }, educationPricing: 1, __proto__: null }], total: 2, pageSize: 1, __proto__: null }; window.__URQL_DATA__ = {};</script></html>`;
    });
    expect(calls).toBe(2);
    expect(cards.map((c) => c.hseId).sort()).toEqual(["1", "2"]);
    expect(hseDpoPageUrl(HSE_DPO_ACTUAL_URL, 2)).toContain("page=2");
  });
});

describe("хелперы hse-dpo", () => {
  it("humanizeDate", () => {
    expect(humanizeDate("06.07.2026")).toBe("6 июля 2026");
    expect(humanizeDate("30.11.2026")).toBe("30 ноября 2026");
    expect(humanizeDate("скоро")).toBe("скоро");
  });
  it("mapHseFormat", () => {
    expect(mapHseFormat("Онлайн синхронный")).toBe("online");
    expect(mapHseFormat("Очный")).toBe("offline");
    expect(mapHseFormat("Гибридный (обучение проходит очно и параллельно в онлайн)")).toBe("blended");
  });
  it("parseHsePrice", () => {
    expect(parseHsePrice("22 000 ₽")).toBe(2_200_000);
    expect(parseHsePrice("бесплатно")).toBeNull();
  });
  it("slugifyRu + normalizeTitle", () => {
    expect(slugifyRu("Нейроправо")).toBe("nejropravo");
    expect(normalizeTitle("Право на английском / Legal English")).toBe("право на английском");
    expect(normalizeTitle("Французский юридический язык: право, терминология и аргументация (Le français juridique: droit, terminologie et argumentation)"))
      .toBe(normalizeTitle("Французский юридический язык: право, терминология и аргументация"));
  });
});
