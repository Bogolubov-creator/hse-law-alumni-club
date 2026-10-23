import re

import pytest
from playwright.sync_api import expect
from test_browser import chromium as chromium
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_browser import wait_for_offline_page
from test_pages import PROFILE


@pytest.mark.parametrize("entry", ["/", "/tg"])
@pytest.mark.parametrize("parameter", ["tgWebAppStartParam", "startapp"])
def test_mini_launch_opens_requested_section(page, entry, parameter):
    page.goto(entry + "?" + parameter + "=stories")
    expect(page).to_have_url(re.compile(r"/stories$"))


def test_mini_signed_start_has_priority_and_does_not_redirect_other_sections(page):
    page.add_init_script("window.Telegram={WebApp:{initData:'synthetic',initDataUnsafe:{start_param:'saved'}}};")
    page.goto("/tg?tgWebAppStartParam=dpo&startapp=events")
    expect(page).to_have_url(re.compile(r"/saved$"))
    page.goto("/news?tgWebAppStartParam=dpo")
    expect(page.get_by_role("heading", name="Новости", exact=True)).to_be_visible()


def test_mini_club_launch_from_root_opens_mobile_hub(page):
    page.goto("/?tgWebAppStartParam=club")
    expect(page).to_have_url(re.compile(r"/tg$"))
    expect(page.locator(".mini-home")).to_be_visible()


@pytest.mark.parametrize("width", [320, 390, 1440])
def test_mobile_hub_has_current_sections_and_install_help(page, width):
    page.set_viewport_size({"width": width, "height": 844})
    page.goto("/tg?source=pwa")
    expect(page.get_by_role("navigation", name="Разделы приложения")).to_be_visible()
    assert page.locator(".mini-shortcuts a").count() == 8
    expect(
        page.get_by_role("navigation", name="Разделы приложения").get_by_role(
            "link", name=re.compile("Истории выпускников")
        )
    ).to_be_visible()
    page.get_by_role("button", name="Как установить приложение", exact=True).click()
    expect(page.locator("#site-dialog")).to_be_visible()
    expect(page.locator("#site-dialog")).to_contain_text("На экран Домой")
    page.get_by_role("button", name="Закрыть окно", exact=True).click()
    assert page.locator("#site-stage").bounding_box()["width"] <= 430
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    for label in page.locator(".mini-shortcuts a").all():
        assert label.bounding_box()["height"] >= 44
    page.get_by_role("navigation", name="Основные разделы").get_by_role("link", name="Клуб", exact=True).click()
    expect(page).to_have_url(re.compile(r"/tg$"))


def test_installed_iphone_hides_preview_and_install_help(page):
    page.add_init_script("Object.defineProperty(navigator,'standalone',{value:true});")
    page.goto("/tg?source=pwa")
    expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
    expect(page.locator("[data-mini-preview]")).to_be_hidden()
    expect(page.get_by_role("link", name="Вернуться на сайт", exact=True)).to_be_hidden()
    expect(page.get_by_role("button", name="Как установить приложение", exact=True)).to_be_hidden()


def test_pending_profile_does_not_offer_subscription_check(page, site):
    from copy import deepcopy

    profile = deepcopy(PROFILE)
    profile["alumni"].update(verification_status="pending", telegram_available=True, telegram_linked=True)
    site[1]["/me"] = profile
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk/profile")
    expect(page.locator(".telegram-subscription")).to_contain_text("после подтверждения выпуска учебным офисом")
    expect(page.get_by_role("button", name="Проверить подписку", exact=True)).to_have_count(0)


@pytest.mark.parametrize("subscription", ["subscribed", "not_subscribed", "unavailable"])
def test_telegram_subscription_check_in_cabinet(page, site, subscription):
    from copy import deepcopy

    profile = deepcopy(PROFILE)
    profile["alumni"].update(telegram_linked=True, telegram_available=True)
    profile["social"] = {"subscription": "not_subscribed", "reactions_available": False}
    profile["achievements"] = [
        {
            "key": "on_radar",
            "title": "На радаре",
            "description": "Подписка на канал клуба",
            "icon": "@",
            "current": 0,
            "target": 1,
            "earned": False,
        }
    ]
    site[1]["/me"] = profile
    page.add_init_script("localStorage.setItem('club_token','member-qa');")

    def check(route):
        profile["social"]["subscription"] = subscription
        profile["achievements"][0].update(
            current=int(subscription == "subscribed"), earned=subscription == "subscribed"
        )
        route.fulfill(
            status=503 if subscription == "unavailable" else 200,
            json={"error": "Не удалось проверить подписку. Повторите позже"}
            if subscription == "unavailable"
            else {"subscription": subscription},
        )

    page.route("**/api/me/telegram-subscription", check)
    page.goto("/lk#achievements")
    page.get_by_role("button", name="Проверить подписку", exact=True).click()
    expect(page.locator("#toast")).to_contain_text(
        {
            "subscribed": "Подписка подтверждена",
            "not_subscribed": "Подписка пока не найдена",
            "unavailable": "Не удалось проверить подписку",
        }[subscription]
    )
    if subscription == "subscribed":
        expect(page.locator("[data-achievement-key='on_radar']")).to_have_attribute("data-achievement-earned", "true")


@pytest.mark.parametrize("width", [390, 1440])
def test_installed_mobile_hub_starts_offline_from_manifest(chromium, site, width):
    context = chromium.new_context(base_url=site[0], viewport={"width": width, "height": 900})
    context.add_init_script(
        "localStorage.setItem('club_cookie_consent','essential'); Object.defineProperty(navigator,'standalone',{value:true});"
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto("/news")
        page.wait_for_function("() => navigator.serviceWorker.controller")
        wait_for_offline_page(page, "/tg")
        manifest = context.request.get("/manifest.webmanifest").json()
        assert manifest["start_url"] == "./tg?source=pwa"
        session = context.new_cdp_session(page)
        assert not session.send("Page.getAppManifest")["errors"]
        context.set_offline(True)
        page.goto("/tg?source=pwa")
        expect(page.locator(".mini-home")).to_be_visible()
        expect(page.locator("#offline-notice")).to_contain_text("Сохранённая копия от")
        expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
        expect(page.get_by_role("button", name="Как установить приложение", exact=True)).to_be_hidden()
        expect(page.locator(".mini-agenda img")).to_have_js_property("naturalWidth", 1100)
        assert not errors
    finally:
        context.close()


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_pwa_starts_offline_without_caching_private_sections(chromium, mirror_site, width):
    from urllib.parse import urljoin, urlsplit

    context = chromium.new_context(viewport={"width": width, "height": 900})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential');")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(mirror_site + "news/")
        page.wait_for_function("() => navigator.serviceWorker.controller")
        wait_for_offline_page(page, urlsplit(mirror_site).path + "tg")
        manifest_url = mirror_site + "manifest.webmanifest"
        manifest = context.request.get(manifest_url).json()
        page.goto(mirror_site + "lk/")
        page.goto(mirror_site + "admin/")
        paths = page.evaluate(
            "async () => { const keys = (await caches.keys()).filter(key => key.endsWith('-pages')); return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat(); }"
        )
        assert not any(
            path.startswith(urlsplit(mirror_site).path + prefix)
            for path in paths
            for prefix in ("lk", "admin", "cart", "join")
        )
        context.set_offline(True)
        page.goto(urljoin(manifest_url, manifest["start_url"]))
        expect(page.locator(".mini-home")).to_be_visible()
        expect(page.locator("#offline-notice")).to_contain_text("Сохранённая копия от")
        expect(page.locator("html")).to_have_class(re.compile("pwa-shell"))
        expect(page.locator(".mini-agenda img")).to_have_js_property("naturalWidth", 1100)
        assert not errors, errors
    finally:
        context.close()
