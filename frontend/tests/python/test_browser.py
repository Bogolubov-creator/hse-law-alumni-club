import asyncio
import functools
import json
import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest
import uvicorn
from playwright.sync_api import expect, sync_playwright
from test_pages import EPISODE, EVENT, NEWS, PRODUCT, PROFILE, PROGRAM

from club_web.build import build_public
from club_web.main import PUBLIC, create_app
from club_web.mirror import export, fixtures
from club_web.pages import OFFICE_NAV, PUBLIC_PAGES


@pytest.fixture(scope="module")
def chromium():
    with sync_playwright() as browser:
        instance = browser.chromium.launch()
        yield instance
        instance.close()


@pytest.fixture
def site():
    records = {
        "/pages/home": {"blocks": {}},
        "/timeline": [],
        "/news": [NEWS],
        "/news/news-one": NEWS,
        "/programs": [PROGRAM],
        "/programs/course-one": PROGRAM,
        "/products": [PRODUCT],
        "/events": [EVENT],
        "/podcasts": {"items": [EPISODE], "subscribed": False, "price": 499900},
        "/me": PROFILE,
        "/me/orders": [],
        "/me/classmates": [],
        "/me/events": [],
        "/me/ledger": [],
        "/cart": {"items": [], "subtotal": 0, "count": 0},
        "/auth/admin-session": {"role": "admin"},
        "/support/config": {"enabled": False},
        "/admin/overview": {},
        "/admin/system-health": {"checks": []},
        "/admin/analytics": {"pulse": {}, "series": {}},
        "/admin/podcast-subs": {"items": []},
        "/admin/news-sources": {"items": [], "sources": []},
        "/admin/pages/home": {"blocks": {}},
    }
    writes = []

    def upstream(request):
        path = request.url.path
        if path.startswith(("/me", "/admin", "/auth/admin-session")) and not request.headers.get("authorization"):
            return httpx.Response(401, json={"error": "Войдите в кабинет"})
        if request.method != "GET":
            body = json.loads(request.content) if request.content else {}
            writes.append({"path": path, "method": request.method, "body": body, "headers": dict(request.headers)})
            if path == "/cart":
                assert body["ref_id"] == PROGRAM["slug"]
                records[path] = {
                    "items": [
                        {
                            "type": "dpo",
                            "ref_id": PROGRAM["slug"],
                            "title": PROGRAM["title"],
                            "price": PROGRAM["price"],
                            "qty": 1,
                        }
                    ],
                    "subtotal": PROGRAM["price"],
                    "count": 1,
                }
                return httpx.Response(200, json=records[path])
            if path == "/orders":
                if records.get("order_failure"):
                    return httpx.Response(503, json={"error": "Временно недоступно"})
                return httpx.Response(
                    200, json={"number": "ORD-QA", "total_estimate": 300000, "notified": {"ok": True}}
                )
            if path == "/support/ask":
                return httpx.Response(200, json={"text": "Подайте заявку на сайте.", "anchor": "/join"})
            if path.endswith("login"):
                return httpx.Response(200, json={"token": "member-qa"})
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(200, json=records.get(path, []))

    build_public(PUBLIC)
    api = httpx.AsyncClient(transport=httpx.MockTransport(upstream), base_url="http://api.test")
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    origin = "http://127.0.0.1:" + str(sock.getsockname()[1])
    server = uvicorn.Server(uvicorn.Config(create_app(api), log_level="critical"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() >= deadline:
            raise AssertionError("Не запущен web-стенд")
        time.sleep(0.02)
    yield origin, records, writes
    server.should_exit = True
    thread.join(timeout=5)
    assert not thread.is_alive()
    sock.close()


@pytest.fixture
def page(chromium, site):
    context = chromium.new_context(base_url=site[0], viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    context.add_init_script(
        "localStorage.setItem('club_cookie_consent','essential'); Object.defineProperty(navigator,'serviceWorker',{value:undefined});"
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("https://telegram.org/**", lambda route: route.abort())
    yield page
    assert not errors
    context.close()


@pytest.mark.parametrize("width", [1440, 390])
def test_all_sections_in_browser(page, width):
    page.set_viewport_size({"width": width, "height": 1000})
    for path in PUBLIC_PAGES:
        assert page.goto(path).status == 200
        expect(page.locator("#main")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), path
    page.add_init_script("localStorage.setItem('club_admin_token','admin-qa');")
    for key, _ in OFFICE_NAV:
        path = "/admin" if key == "overview" else "/admin/" + key
        page.goto(path)
        expect(page.locator(".site-office")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), path


def test_catalog_filters_search_compare_and_cart(page, site):
    page.goto("/dpo?q=нет-такого")
    expect(page.get_by_text("По выбранным фильтрам ничего не найдено.")).to_be_visible()
    page.goto("/dpo")
    page.get_by_role("button", name="Сравнить", exact=True).click()
    page.get_by_role("button", name="Сравнить выбранные программы", exact=True).click()
    expect(page.locator("#site-dialog")).to_contain_text(PROGRAM["title"])
    page.get_by_role("button", name="Закрыть окно", exact=True).click()
    page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart-count]").first).to_have_text("1")
    page.goto("/cart")
    expect(page.locator("#main")).to_contain_text(PROGRAM["title"])
    assert next(write for write in site[2] if write["path"] == "/cart")["body"]["ref_id"] == PROGRAM["slug"]
    page.goto("/search?q=правовая")
    expect(page.locator("#main")).to_contain_text(PROGRAM["title"])


def test_checkout_error_keeps_contacts_and_replay_key(page, site):
    page.goto("/dpo")
    page.get_by_role("button", name="В корзину", exact=True).click()
    page.goto("/cart")
    page.get_by_label("ФИО", exact=True).fill("Тестовый выпускник")
    page.get_by_label("Телефон", exact=True).fill("+7 000 000-00-00")
    page.get_by_label("Почта", exact=True).fill("test@example.com")
    page.locator("input[name=consent_pdn]").check()
    site[1]["order_failure"] = True
    page.get_by_role("button", name="Отправить заявку", exact=True).click()
    expect(page.locator("form[data-checkout] [data-error]")).to_contain_text("Временно недоступно")
    expect(page.get_by_label("ФИО", exact=True)).to_have_value("Тестовый выпускник")
    site[1]["order_failure"] = False
    page.get_by_role("button", name="Отправить заявку", exact=True).click()
    expect(page.get_by_role("heading", name="Заявка отправлена в учебный офис")).to_be_visible()
    orders = [write for write in site[2] if write["path"] == "/orders"]
    assert len(orders) == 2 and orders[0]["headers"]["idempotency-key"] == orders[1]["headers"]["idempotency-key"]


def test_reading_storage_survives_navigation_and_rejects_external_path(page):
    page.add_init_script(
        "if(!localStorage.getItem('club-reading-v1')) localStorage.setItem('club-reading-v1',JSON.stringify({saved:[{kind:'news',id:'evil',title:'Внешняя ссылка',path:'https://evil.test',at:100}],recent:[],read:[]}));"
    )
    page.goto("/dpo/course-one")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_role("button", name="Сохранено", exact=True)).to_be_visible()
    page.goto("/saved")
    expect(page.locator("[data-reading-list=saved]")).to_contain_text(PROGRAM["title"])
    expect(page.locator("#main")).not_to_contain_text("Внешняя ссылка")
    page.get_by_label("Тип материала", exact=True).select_option("news")
    expect(page.locator("[data-reading-list=saved]")).not_to_contain_text(PROGRAM["title"])


def test_reading_write_failure_has_no_false_success(page):
    page.add_init_script("Storage.prototype.setItem=function(){throw new Error('quota')};")
    page.goto("/news/news-one")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_role("button", name="Сохранить", exact=True)).to_have_attribute("aria-pressed", "false")
    expect(page.locator("#toast")).to_contain_text("Хранилище браузера недоступно")


def test_a11y_keeps_previous_storage_format(page):
    page.add_init_script(
        "localStorage.setItem('club_vision',JSON.stringify({on:true,zoom:1.2,scheme:'wb',images:false,serif:true,spacing:true}));"
    )
    page.goto("/news")
    expect(page.locator("html")).to_have_class(re.compile("vis-noimg"))
    expect(page.locator("html")).to_have_attribute("data-vis-scheme", "wb")
    page.get_by_role("button", name="Обычная версия", exact=True).click()
    assert page.evaluate("JSON.parse(localStorage.getItem('club_vision')).on") is False


def test_pwa_uses_phone_layout_and_preserves_navigation(page):
    page.goto("/?pwa=1")
    assert page.locator("#site-stage").bounding_box()["width"] == 430
    expect(page.get_by_role("button", name="Открыть меню", exact=True)).to_be_visible()
    assert page.locator(".home-hero").evaluate("node => getComputedStyle(node).gridTemplateColumns").split() == [
        "430px"
    ]
    page.get_by_role("navigation", name="Основные разделы").get_by_role("link", name="Кабинет", exact=True).click()
    expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
    expect(page.get_by_role("heading", name="Вход для выпускников", exact=True)).to_be_visible()


def test_telegram_preview_safe_start_and_return(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto("/tg?startapp=dpo")
    expect(page).to_have_url(re.compile(r"/dpo$"))
    page.get_by_role("navigation", name="Основные разделы").get_by_role("link", name="Клуб", exact=True).click()
    expect(page.get_by_text("Предпросмотр мини-приложения", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Войти через Telegram", exact=True)).to_be_hidden()
    page.get_by_role("link", name="Вернуться на сайт", exact=True).click()
    expect(page.locator(".home-hero")).to_be_visible()
    page.goto("/tg?startapp=admin")
    expect(page.locator(".mini-home")).to_be_visible()


def test_bot_dialog_uses_server_response_and_keyboard(page):
    page.goto("/support")
    page.get_by_role("button", name="Спросить бота", exact=True).click()
    dialog = page.locator("#support-bot")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="Как вступить", exact=True).click()
    expect(dialog.locator(".club-bot-log")).to_contain_text("Подайте заявку на сайте.")
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()


def test_corrupt_reading_data_is_not_overwritten(page):
    page.add_init_script("localStorage.setItem('club-reading-v1','broken-json');")
    page.goto("/news/news-one")
    expect(page.locator("#toast")).to_contain_text("Сохранённые материалы повреждены")
    assert page.evaluate("localStorage.getItem('club-reading-v1')") == "broken-json"
    page.get_by_role("button", name="Сохранить", exact=True).click()
    assert page.evaluate("localStorage.getItem('club-reading-v1')") == "broken-json"


def test_signed_audio_link_is_renewed_once_without_autoplay(page, site):
    site[1]["/podcasts"]["items"] = [{**EPISODE, "audio_url": "/api/media/old-signed.mp3"}]
    page.route("**/api/media/*.mp3", lambda route: route.abort())
    page.goto("/podcasts/" + EPISODE["id"])
    site[1]["/podcasts"]["items"][0]["audio_url"] = "/api/media/new-signed.mp3"
    page.locator("audio").dispatch_event("error")
    expect(page.locator("audio")).to_have_attribute("src", re.compile("new-signed"))
    assert page.locator("audio").evaluate("element => element.paused")
    page.locator("audio").dispatch_event("error")
    expect(page.locator("[data-audio-error]")).to_be_visible()
    expect(page.get_by_role("button", name="Повторить загрузку")).to_be_visible()


@pytest.fixture
def mirror_site(tmp_path):
    root = tmp_path / "club-preview"
    data = fixtures(Path(__file__).resolve().parents[3])
    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(lambda: asyncio.run(export(root, "/club-preview/", data))).result(timeout=30)

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(tmp_path)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield "http://127.0.0.1:" + str(server.server_port) + "/club-preview/"
    server.shutdown()
    thread.join(timeout=5)
    server.server_close()


@pytest.mark.parametrize("width", [1440, 390, 360])
def test_mirror_mobile_preview_navigation_and_exit(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 844}, reduced_motion="reduce")
    context.add_init_script(
        "localStorage.setItem('club_cookie_consent','essential'); Object.defineProperty(navigator,'serviceWorker',{value:undefined});"
    )
    page = context.new_page()
    errors, telegram, writes = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: telegram.append(request.url) if "telegram.org" in request.url else None)
    page.on("request", lambda request: writes.append(request.url) if request.method not in ("GET", "HEAD") else None)
    page.goto(mirror_site)
    page.get_by_role("navigation", name="Просмотр зеркала").get_by_role(
        "link", name="Мобильный просмотр", exact=True
    ).click()
    expect(page).to_have_url(mirror_site + "tg/?pwa=1")
    expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
    expect(page.locator("[data-mini-preview]")).to_have_text("Мобильный просмотр")
    assert page.locator("#site-stage").bounding_box()["width"] == min(width, 430)
    for label, path in (("ДПО", "dpo"), ("Лента", "news"), ("Мерч", "merch"), ("Кабинет", "lk"), ("Клуб", "tg")):
        page.get_by_role("navigation", name="Основные разделы").get_by_role("link", name=label, exact=True).click()
        expect(page).to_have_url(re.compile(re.escape(mirror_site + path) + r"/?$"))
        expect(page.locator("#main")).to_be_visible()
        expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), path
    page.reload()
    expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
    page.get_by_role("navigation", name="Просмотр зеркала").get_by_role("link", name="Обычный сайт").click()
    expect(page).to_have_url(mirror_site + "?site=1")
    expect(page.locator("html")).not_to_have_class(re.compile("pwa-shell|telegram-mini"))
    expect(page.locator(".home-hero")).to_be_visible()
    assert not errors and not telegram and not writes
    context.close()


def test_mirror_preserves_filters_cart_calendar_and_subscription(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 390, "height": 1000})
    context.add_init_script(
        "Object.defineProperty(navigator,'serviceWorker',{value:undefined}); localStorage.setItem('club_cookie_consent','essential');"
    )
    page = context.new_page()
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: writes.append(request.url) if request.method not in ("GET", "HEAD") else None)
    page.route("https://telegram.org/**", lambda route: route.abort())
    page.goto(mirror_site + "dpo/")
    page.get_by_role("searchbox", name="Поиск", exact=True).fill("несуществующая программа")
    page.get_by_role("button", name="Показать", exact=True).click()
    expect(page.locator("[data-catalog-row]:visible")).to_have_count(0)
    page.get_by_role("searchbox", name="Поиск", exact=True).fill("")
    page.get_by_role("button", name="Показать", exact=True).click()
    page.goto(mirror_site + "merch/hoodie-faculty/")
    page.get_by_label("Размер и цвет").select_option("hoodie-graphite-M")
    page.get_by_role("button", name="В корзину", exact=True).click()
    expect(page.locator("[data-cart-count]").first).to_have_text("1")
    page.goto(mirror_site + "cart/")
    expect(page.locator("[data-mirror-cart] article")).to_have_count(1)
    page.reload()
    expect(page.locator("[data-mirror-cart] article")).to_have_count(1)
    page.get_by_role("button", name="Удалить", exact=True).click()
    expect(page.locator("[data-mirror-cart]")).to_contain_text("В корзине пока ничего нет")
    page.goto(mirror_site + "events/?month=2024-02")
    expect(page.locator(".site-calendar h2")).to_contain_text("2024")
    assert page.locator(".site-calendar-grid > div > span").count() == 29
    page.get_by_role("link", name="Следующий месяц", exact=True).click()
    expect(page.locator(".site-calendar h2")).to_contain_text("март")
    page.goto(mirror_site + "podcasts/mirror-pod-volos/")
    expect(page.locator(".site-player")).not_to_be_visible()
    page.get_by_role("button", name="Проверить как подписчик", exact=True).click()
    expect(page.locator(".site-player")).to_be_visible()
    expect(page.locator("audio source")).to_have_attribute("type", "audio/mpeg")
    assert page.locator("audio").evaluate("audio => audio.paused")
    page.get_by_role("button", name="Выключить деморежим подписчика", exact=True).click()
    expect(page.locator(".site-player")).not_to_be_visible()
    assert not errors and not writes
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    context.close()


def test_service_worker_does_not_cache_private_pages_or_api(chromium, site):
    context = chromium.new_context(base_url=site[0], viewport={"width": 390, "height": 1000})
    context.add_init_script(
        "localStorage.setItem('club_cookie_consent','essential');localStorage.setItem('club_token','member-qa');"
    )
    page = context.new_page()
    page.goto("/lk")
    page.evaluate("navigator.serviceWorker.ready")
    page.reload()
    expect(page.locator("#main")).to_contain_text("Тестовый выпускник")
    page.goto("/lk/profile")
    page.goto("/cart")
    paths = page.evaluate(
        "async () => {const keys=await caches.keys();return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat();}"
    )
    assert not any(path.startswith(("/api", "/views", "/lk", "/admin", "/cart")) for path in paths)
    context.set_offline(True)
    page.goto("/news")
    expect(page.get_by_role("heading", name="Нет подключения")).to_be_visible()
    context.close()
