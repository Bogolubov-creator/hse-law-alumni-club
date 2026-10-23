import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import PROGRAM


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        instance = getattr(playwright, request.param).launch()
        yield instance
        instance.close()


def faculty_program(identifier, **changes):
    return {
        **PROGRAM,
        "id": identifier,
        "slug": identifier,
        "title": "Программа " + identifier,
        "hse_id": identifier,
        "source_url": "https://www.hse.ru/edu/dpo/" + identifier,
        **changes,
    }


def test_comparison_waits_for_browser_initialization(page):
    pending = []
    page.route("**/assets/catalog.js", lambda route: pending.append(route), times=1)
    page.goto("/dpo", wait_until="commit")
    button = page.get_by_role("button", name="Сравнить", exact=True).first
    expect(button).to_be_visible()
    expect(button).to_be_disabled()
    assert len(pending) == 1
    pending.pop().continue_()
    button.click()
    expect(button).to_have_attribute("aria-pressed", "true")
    assert "compare=" + PROGRAM["slug"] in page.url
    page.reload()
    expect(page.get_by_role("button", name="Сравнить", exact=True).first).to_have_attribute("aria-pressed", "true")


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_dpo_cards_reserve_media_and_align_footer_without_losing_actions(page, site, width, pwa):
    site[1]["/programs"] = [
        {**PROGRAM, "title": "А. Программа Клуба"},
        faculty_program(
            "second", title="Б. Юридические требования к внедрению цифровых инструментов в кадровую работу"
        ),
        faculty_program("third", title="В. Контрактное право", cover="/assets/programs/472681893.jpg"),
    ]
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/dpo?pwa=1#program-list" if pwa else "/dpo#program-list")
    cards = page.locator("[data-program-id]")
    expect(cards).to_have_count(3)
    expect(page.locator(".dpo-card__placeholder")).to_have_count(2)
    geometry = []
    for card in cards.all():
        expect(card.locator(".site-card-media")).to_be_visible()
        card.get_by_role("button", name="Сохранить", exact=True).scroll_into_view_if_needed()
        assert card.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        geometry.append(
            card.evaluate(
                "node => ({top:node.offsetTop,media:node.querySelector('.site-card-media').clientHeight,price:node.querySelector('.dpo-card__price').getBoundingClientRect().top + scrollY,foot:node.querySelector('.dpo-card__actions').getBoundingClientRect().bottom + scrollY})"
            )
        )
    for left in geometry:
        for right in geometry:
            if abs(left["top"] - right["top"]) < 2:
                assert left["media"] == pytest.approx(right["media"], abs=1)
                assert left["price"] == pytest.approx(right["price"], abs=2)
                assert left["foot"] == pytest.approx(right["foot"], abs=2)
    club = page.locator("[data-program-id='program-1']")
    expect(club.get_by_role("button", name="В корзину", exact=True)).to_be_visible()
    expect(page.locator("[data-program-id=second] [data-cart]")).to_have_count(0)
    club.get_by_role("button", name="Сохранить", exact=True).click()
    expect(club.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    club.get_by_role("button", name="Сравнить", exact=True).click()
    page.get_by_role("button", name="Сравнить выбранные программы", exact=True).click()
    expect(page.get_by_role("dialog", name="Сравнение программ")).to_contain_text("А. Программа Клуба")
    page.get_by_role("button", name="Закрыть сравнение").click()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    with page.expect_response("**/api/cart"):
        club.get_by_role("button", name="В корзину", exact=True).click()
    assert site[2][-1]["body"]["qty"] == 1


@pytest.mark.parametrize("width", [390, 1440])
def test_program_page_has_readable_sections_and_truthful_missing_values(page, site, width):
    site[1]["/programs/course-one"] = {
        **PROGRAM,
        "price": None,
        "dates": {"start": None},
        "description": "Описание программы из каталога.",
        "audience": ["Юристам"],
        "results": ["Работа с договорами"],
        "modules": [{"title": "Практика договоров", "points": ["Условия договора"]}],
        "teachers": [{"name": "Анна Семёнова", "role": "Преподаватель"}],
    }
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/dpo/course-one")
    expect(page.locator(".program-summary")).to_contain_text("Стоимость уточняется")
    expect(page.locator(".program-summary")).to_contain_text("Начало уточняется")
    expect(page.locator(".program-summary")).not_to_contain_text("0 ₽")
    page.get_by_role("navigation", name="О программе").get_by_role("link", name="Программа обучения").click()
    expect(page.locator("#program-modules > h2")).to_be_in_viewport()
    page.get_by_text("Практика договоров", exact=True).click()
    expect(page.get_by_text("Условия договора", exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def test_dpo_load_error_is_not_presented_as_empty_catalog(page, site):
    site[1]["unavailable_programs"] = True
    page.goto("/dpo")
    expect(page.get_by_role("heading", name="Каталог временно недоступен", exact=True)).to_be_visible()
    expect(page.locator("[data-catalog-count]")).to_have_count(0)
    expect(page.locator("[data-catalog-empty]")).to_have_count(0)


def test_mirror_has_source_covers_and_keeps_missing_cover_layout(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 1440, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.goto(mirror_site + "dpo/#program-list")
    expect(page.locator("[data-program-id]")).to_have_count(31)
    expect(page.locator(".dpo-card__placeholder")).to_have_count(2)
    for identifier in ("1162952114", "934858556", "474413637", "1029651795"):
        card = page.locator("[data-program-id]").filter(has=page.locator(f'a[href$="-{identifier}"]')).first
        image = card.locator("img")
        image.scroll_into_view_if_needed()
        image.evaluate("image => image.decode()")
        assert image.evaluate("image => image.naturalWidth > 0 && image.clientWidth <= image.naturalWidth + 1")
    context.close()
