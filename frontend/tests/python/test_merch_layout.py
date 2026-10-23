import json

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import PRODUCT


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_merch_media_and_prices_align_in_each_row(page, site, width, pwa):
    site[1]["/products"] = [
        {**PRODUCT, "title": "А. Мантия выпускника"},
        {
            **PRODUCT,
            "slug": "hoodie",
            "title": "Б. Худи с длинным названием факультета права и символикой клуба выпускников",
            "images": ["/assets/merch-hoodie.webp"],
        },
        {**PRODUCT, "slug": "poster", "title": "В. Постер", "images": ["/assets/missing-merch.jpg"]},
    ]
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/merch?pwa=1" if pwa else "/merch")
    cards = page.locator("[data-catalog-row]")
    expect(cards).to_have_count(3)
    assert page.locator(".merch-filters input,.merch-filters select,.merch-filters button").evaluate_all(
        "nodes => nodes.every(node => Math.abs(node.getBoundingClientRect().height - 48) < 1)"
    )
    expect(page.locator("[data-merch-placeholder]:visible")).to_have_count(2)
    geometry = []
    for card in cards.all():
        card.scroll_into_view_if_needed()
        media = card.locator(".site-card-media")
        expect(media).to_be_visible()
        assert (
            card.locator(".merch-card__media").evaluate("node => getComputedStyle(node).textDecorationLine") == "none"
        )
        assert media.bounding_box()["height"] == pytest.approx(media.bounding_box()["width"], abs=1)
        assert card.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        geometry.append(
            card.evaluate("""node => ({
                top:node.offsetTop,
                price:node.querySelector('.site-price').getBoundingClientRect().top + scrollY,
                actions:node.querySelector('.site-actions').getBoundingClientRect().bottom + scrollY
            })""")
        )
    for left in geometry:
        for right in geometry:
            if abs(left["top"] - right["top"]) < 2:
                assert left["price"] == pytest.approx(right["price"], abs=2)
                assert left["actions"] == pytest.approx(right["actions"], abs=2)
    image = page.locator("img[data-merch-image]:visible")
    image.evaluate("image => image.decode()")
    assert image.evaluate("image => image.clientWidth <= image.naturalWidth + 1")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    cards.first.get_by_role("button", name="Сохранить", exact=True).click()
    expect(cards.first.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    cards.first.get_by_role("link", name="Подробнее", exact=True).click()
    expect(page.get_by_role("heading", name="А. Мантия выпускника", exact=True)).to_be_visible()


@pytest.mark.parametrize("width", [390, 1440])
def test_merch_missing_photo_and_cart_error_keep_size_and_quantity(page, site, width):
    site[1]["/products"] = [
        {
            **PRODUCT,
            "variants_json": [
                {"sku": "size-M", "size": "M", "stock": 0},
                {"sku": "size-L", "size": "L", "stock": 3},
            ],
        }
    ]
    writes = []

    def cart_reply(route):
        if route.request.method != "POST":
            route.continue_()
            return
        writes.append(route.request.post_data_json)
        route.fulfill(
            status=503 if len(writes) == 1 else 200,
            json={"error": "Попробуйте ещё раз."} if len(writes) == 1 else {"count": 2},
        )

    page.route("**/api/cart", cart_reply)
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/merch/bag-one")
    expect(page.locator("[data-merch-placeholder]")).to_be_visible()
    expect(page.locator("option[value='size-M']")).to_have_js_property("disabled", True)
    page.get_by_label("Размер и цвет").select_option("size-L")
    page.get_by_label("Количество", exact=True).fill("2")
    page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart] [role='alert']")).to_contain_text("Попробуйте ещё раз.")
    expect(page.get_by_label("Размер и цвет")).to_have_value("size-L")
    expect(page.get_by_label("Количество", exact=True)).to_have_value("2")
    with page.expect_response("**/api/cart"):
        page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart] [role='alert']")).to_be_hidden()
    assert writes == [{"type": "merch", "ref_id": "bag-one", "variant_sku": "size-L", "qty": 2}] * 2
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_merch_filters_sort_save_and_cart(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(mirror_site + "merch/")
    expect(page.locator("[data-catalog-row]:visible")).to_have_count(3)
    page.get_by_label("Категория", exact=True).select_option("Одежда")
    page.get_by_label("Порядок", exact=True).select_option("price")
    page.get_by_role("button", name="Показать", exact=True).click()
    expect(page.locator("[data-catalog-row]:visible")).to_have_count(2)
    expect(page.locator("#main > p[role='status']")).to_contain_text("2")
    prices = [
        json.loads(card.get_attribute("data-catalog-row"))["price"]
        for card in page.locator("[data-catalog-row]:visible").all()
    ]
    assert prices == sorted(prices)
    page.get_by_role("searchbox", name="Поиск", exact=True).fill("несуществующая вещь")
    page.get_by_role("button", name="Показать", exact=True).click()
    expect(page.locator("[data-catalog-empty]")).to_be_visible()
    expect(page.locator("[data-catalog-row]:visible")).to_have_count(0)
    page.get_by_role("link", name="Сбросить фильтры", exact=True).click()
    expect(page.locator("[data-catalog-row]:visible")).to_have_count(3)
    hoodie = page.locator("[data-catalog-row]").filter(
        has=page.get_by_role("heading", name="Худи с логотипом факультета", exact=True)
    )
    hoodie.get_by_role("button", name="Сохранить", exact=True).click()
    expect(hoodie.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    hoodie.get_by_role("link", name="Подробнее", exact=True).click()
    page.get_by_label("Размер и цвет").select_option("hoodie-graphite-M")
    page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart-count]").first).to_have_text("1")
    page.goto(mirror_site + "cart/")
    expect(page.locator("[data-mirror-cart] article")).to_have_count(1)
    assert not errors
    context.close()


def test_saved_action_waits_for_browser_initialization(page):
    pending = []
    page.route("**/assets/site.js", lambda route: pending.append(route), times=1)
    page.goto("/merch", wait_until="commit")
    button = page.get_by_role("button", name="Сохранить", exact=True).first
    expect(button).to_be_visible()
    expect(button).to_be_disabled()
    assert len(pending) == 1
    pending.pop().continue_()
    button.click()
    expect(page.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    page.reload()
    expect(page.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")


def test_merch_error_and_empty_catalog_are_distinct(page, site):
    site[1]["unavailable_products"] = True
    page.goto("/merch")
    expect(page.get_by_role("heading", name="Каталог временно недоступен", exact=True)).to_be_visible()
    expect(page.locator("#main")).not_to_contain_text("программы")
    expect(page.locator("[data-catalog-empty]")).to_have_count(0)
    site[1]["unavailable_products"] = False
    site[1]["/products"] = []
    page.reload()
    expect(page.get_by_role("heading", name="Товары пока не опубликованы", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="Каталог временно недоступен", exact=True)).to_have_count(0)
