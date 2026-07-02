import { describe, it, expect } from "vitest";
import { parseHseDpoCards, humanizeDate, mapHseFormat, parseHsePrice } from "./hse-dpo";
import { slugifyRu, normalizeTitle } from "./slug";

// Фикстура — фрагмент реальной вёрстки листинга hse.ru (dpob-card), 2 карточки.
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
    // латинский дубль хвостом в скобках — тоже отбрасывается при сопоставлении
    expect(normalizeTitle("Французский юридический язык: право, терминология и аргументация (Le français juridique: droit, terminologie et argumentation)"))
      .toBe(normalizeTitle("Французский юридический язык: право, терминология и аргументация"));
  });
});
