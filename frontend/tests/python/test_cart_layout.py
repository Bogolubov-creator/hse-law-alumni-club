import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import PRODUCT, PROGRAM


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


def cart_records(site):
    cart = {
        "items": [
            {"type": "dpo", "ref_id": PROGRAM["slug"], "title": PROGRAM["title"], "price": 300000, "qty": 1},
            {
                "type": "merch",
                "ref_id": PRODUCT["slug"],
                "title": "Худи выпускника факультета права – длинное название выбранного товара",
                "price": 590000,
                "qty": 2,
                "variant_sku": "hoodie-graphite-M",
            },
        ],
        "count": 3,
        "subtotal": 1480000,
        "estimated_total": 1465000,
        "member_discount": 5,
    }
    site[1]["/cart"] = cart
    return cart


def fits(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    for node in page.locator(".cart-item,.cart-summary,.cart-empty,.cart-guide").all():
        assert node.evaluate("node => node.scrollWidth <= node.clientWidth + 1")


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_cart_empty_and_filled_layout_uses_server_estimate(page, site, width, pwa):
    page.set_viewport_size({"width": width, "height": 1000})
    path = "/cart?pwa=1" if pwa else "/cart"
    page.goto(path)
    expect(page.get_by_role("heading", name="В корзине пока ничего нет.", exact=True)).to_be_visible()
    expect(page.get_by_role("link", name="Выбрать программу", exact=True)).to_have_attribute("href", "/dpo")
    expect(page.get_by_role("link", name="Посмотреть мерч", exact=True)).to_have_attribute("href", "/merch")
    expect(page.locator("form[data-checkout]")).to_have_count(0)
    fits(page)
    cart_records(site)
    page.reload()
    expect(page.locator(".cart-item")).to_have_count(2)
    expect(page.locator(".cart-summary__total strong")).to_have_text("14 650 ₽")
    expect(page.locator(".cart-totals")).to_contain_text("5%")
    expect(page.locator("[data-cart-variant]:visible")).to_have_text("Вариант: hoodie-graphite-M")
    expect(page.get_by_label("Получение", exact=True)).to_be_visible()
    for button in page.locator(".cart-page button,.cart-empty__actions a").all():
        assert button.evaluate("node => node.getBoundingClientRect().height >= 44")
    fits(page)
    layout = page.locator(".cart-layout")
    columns = layout.evaluate("node => getComputedStyle(node).gridTemplateColumns.split(' ').length")
    assert columns == (1 if width <= 700 or pwa else 2)


def test_cart_load_error_and_retry_never_show_empty_cart(page, site):
    cart_records(site)
    blocked = []
    page.route("**/views/cart", lambda route: blocked.append(route))
    page.goto("/cart")
    expect(page.get_by_role("heading", name="Загружаем корзину", exact=True)).to_be_visible()
    expect(page.locator(".cart-empty")).to_have_count(0)
    page.wait_for_function("() => document.querySelector('[data-cart-loading]') !== null")
    assert len(blocked) == 1
    blocked[0].abort()
    expect(page.get_by_role("heading", name="Не удалось загрузить корзину", exact=True)).to_be_visible()
    page.unroute("**/views/cart")
    page.get_by_role("button", name="Повторить загрузку", exact=True).click()
    expect(page.locator(".cart-item")).to_have_count(2)
    site[1]["unavailable_cart"] = True
    page.reload()
    expect(page.get_by_role("heading", name="Не удалось загрузить корзину", exact=True)).to_be_visible()
    expect(page.locator(".cart-empty")).to_have_count(0)


@pytest.mark.parametrize("width", [390, 1440])
def test_cart_mutation_errors_drafts_keyboard_and_checkout(page, site, width):
    page.set_viewport_size({"width": width, "height": 1000})
    cart = cart_records(site)
    requests = []

    def change(route):
        request = route.request
        if request.method == "GET":
            route.continue_()
            return
        body = request.post_data_json
        requests.append((request.method, body))
        if body.get("qty") == 4:
            route.fulfill(status=409, json={"error": "Недостаточно товара в наличии."})
            return
        cart["items"] = [
            item
            for item in cart["items"]
            if item["type"] != body["type"] or item["ref_id"] != body["ref_id"] or body["qty"]
        ]
        for item in cart["items"]:
            if item["type"] == body["type"] and item["ref_id"] == body["ref_id"]:
                item["qty"] = body["qty"]
        route.fulfill(json=cart)

    page.route("**/api/cart", change)
    page.goto("/cart")
    form = page.locator("form[data-checkout]")
    form.get_by_label("ФИО", exact=True).fill("Тестовый выпускник")
    form.get_by_label("Телефон", exact=True).fill("+7 000 000-00-00")
    form.get_by_label("Почта", exact=True).fill("test@example.test")
    form.get_by_label("Получение", exact=True).select_option("delivery")
    form.get_by_label("Адрес доставки", exact=True).fill("Тестовый адрес")
    form.locator("[name=consent_pdn]").check()
    row = page.locator(".cart-item").last
    quantity = row.get_by_role("spinbutton", name="Количество", exact=True)
    quantity.fill("4")
    row.get_by_role("button", name="Обновить", exact=True).click()
    expect(row.locator("[data-error]")).to_contain_text("Недостаточно товара")
    expect(form.get_by_label("ФИО", exact=True)).to_have_value("Тестовый выпускник")
    quantity.fill("3")
    update = row.get_by_role("button", name="Обновить", exact=True)
    update.focus()
    page.keyboard.press("Enter")
    expect(quantity).to_have_value("3")
    expect(update).to_be_focused()
    expect(form.get_by_label("Адрес доставки", exact=True)).to_have_value("Тестовый адрес")
    expect(form.get_by_label("Получение", exact=True)).to_have_value("delivery")
    expect(form.locator("[name=consent_pdn]")).to_be_checked()
    page.locator(".cart-item").first.get_by_role("button", name="Удалить", exact=True).click()
    expect(page.locator(".cart-item")).to_have_count(1)
    expect(page.get_by_role("heading", name="Выбранные позиции", exact=True)).to_be_focused()
    form.get_by_role("button", name="Отправить заявку", exact=True).click()
    expect(page.get_by_role("heading", name="Заявка отправлена в учебный офис")).to_be_focused()
    order = [write for write in site[2] if write["path"] == "/orders"][-1]
    assert order["body"]["address"] == "Тестовый адрес"
    assert order["body"]["fulfillment"] == "delivery"
    assert order["headers"]["idempotency-key"]
    assert requests[1][1] == {"type": "merch", "ref_id": PRODUCT["slug"], "variant_sku": "hoodie-graphite-M", "qty": 3}
    fits(page)


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_cart_shared_layout_quantity_clear_and_safe_demo(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: writes.append(request.url) if request.method not in ("GET", "HEAD") else None)
    page.goto(mirror_site + "cart/")
    expect(page.locator(".cart-empty")).to_be_visible()
    page.get_by_role("link", name="Посмотреть мерч", exact=True).click()
    page.goto(mirror_site + "merch/hoodie-faculty/")
    page.get_by_label("Размер и цвет").select_option("hoodie-graphite-M")
    page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart-count]").first).to_have_text("1")
    page.goto(mirror_site + "cart/")
    expect(page.locator(".cart-item")).to_have_count(1)
    expect(page.locator(".cart-demo")).to_contain_text("Отправка заявки отключена")
    expect(page.locator("form[data-checkout]")).to_have_count(0)
    fits(page)
    page.get_by_role("spinbutton", name="Количество", exact=True).fill("2")
    page.get_by_role("button", name="Обновить", exact=True).click()
    expect(page.get_by_role("button", name="Обновить", exact=True)).to_be_focused()
    expect(page.locator("[data-cart-count]").first).to_have_text("2")
    page.reload()
    expect(page.get_by_role("spinbutton", name="Количество", exact=True)).to_have_value("2")
    page.get_by_role("button", name="Очистить корзину", exact=True).click()
    expect(page.get_by_role("heading", name="В корзине пока ничего нет.", exact=True)).to_be_focused()
    expect(page.locator(".cart-item")).to_have_count(0)
    assert not errors and not writes
    context.close()


def test_mirror_cart_ambiguous_slugs_are_separate_and_corruption_is_visible(chromium, mirror_site):
    context = chromium.new_context(service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(mirror_site + "cart/")
    expect(page.locator(".cart-empty")).to_be_visible()
    page.evaluate("""async () => {
      const key = document.body.dataset.base + 'data/mirror-api.json';
      const response = await fetch(key);
      const data = await response.json();
      window.testCartCatalog = data;
    }""")
    catalog = page.evaluate("window.testCartCatalog")
    slug = catalog["/products"][0]["slug"]
    catalog["/programs"].append({"slug": slug, "title": "Тестовая программа", "price": 100000})
    page.route("**/data/mirror-api.json", lambda route: route.fulfill(json=catalog))
    page.evaluate(
        """async slug => {
      await window.clubMirrorCart('POST', {type:'dpo',ref_id:slug,qty:1});
    }""",
        slug,
    )
    product = catalog["/products"][0]
    sku = product.get("variants_json", [{}])[0].get("sku") if product.get("variants_json") else None
    page.evaluate(
        "async body => window.clubMirrorCart('POST',body)",
        {"type": "merch", "ref_id": slug, "qty": 1, "variant_sku": sku},
    )
    page.reload()
    expect(page.locator(".cart-item")).to_have_count(2)
    page.locator(".cart-item").filter(has_text="Тестовая программа").get_by_role(
        "button", name="Удалить", exact=True
    ).click()
    expect(page.locator(".cart-item")).to_have_count(1)
    expect(page.locator("[data-cart-type]")).to_have_text("Мерч клуба")
    page.evaluate("sessionStorage.setItem('club_mirror_cart:'+localStorage.getItem('club_cart'),'invalid')")
    page.reload()
    expect(page.get_by_role("heading", name="Не удалось загрузить корзину", exact=True)).to_be_visible()
    expect(page.locator(".cart-empty")).to_have_count(0)
    assert not errors
    context.close()
