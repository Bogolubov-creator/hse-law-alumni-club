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


@pytest.mark.parametrize("width", [390, 1440])
@pytest.mark.parametrize("javascript", [True, False])
def test_mirror_support_stays_closed_with_cached_legacy_styles(chromium, mirror_site, width, javascript):
    context = chromium.new_context(
        viewport={"width": width, "height": 900}, java_script_enabled=javascript, service_workers="block"
    )
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def legacy_styles(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + "\n.club-bot-panel { display: flex; }\n")

    page.route("**/assets/site-*.css", legacy_styles)
    page.goto(mirror_site)
    dialog = page.locator("#support-bot")
    assert dialog.get_attribute("open") is None
    expect(dialog).to_be_hidden()
    if javascript:
        launcher = page.get_by_role("button", name="Открыть бота поддержки", exact=True)
        launcher.click()
        expect(dialog).to_be_visible()
        assert dialog.get_attribute("open") is not None
        page.get_by_role("button", name="Закрыть поддержку", exact=True).click()
        expect(dialog).to_be_hidden()
        expect(launcher).to_be_focused()
        launcher.press("Enter")
        expect(dialog).to_be_visible()
        page.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
    page.reload()
    expect(dialog).to_be_hidden()
    page.goto(mirror_site + "news/")
    expect(dialog).to_be_hidden()
    assert not errors
    context.close()


@pytest.mark.parametrize("width,height", [(1440, 1000), (390, 844), (320, 568), (390, 420)])
def test_support_conversation_scroll_keeps_composer_and_close_visible(page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.goto("/support")
    page.get_by_role("button", name="Спросить бота", exact=True).click()
    dialog = page.locator("#support-bot")
    field = dialog.get_by_role("textbox", name="Вопрос", exact=True)
    for count in range(6):
        field.fill("Как вступить в клуб? " + "Подскажите порядок проверки выпускника. " * 8)
        dialog.get_by_role("button", name="Спросить", exact=True).click()
        expect(dialog.locator(".club-bot-say")).to_have_count(count + 1)
    geometry = dialog.evaluate(
        """node => {
          const rect = element => {
            const box = element.getBoundingClientRect();
            return {top:box.top,bottom:box.bottom,left:box.left,right:box.right};
          };
          const log = node.querySelector('.club-bot-log');
          return {panel:rect(node),close:rect(node.querySelector('[data-action="close-bot"]')),
            form:rect(node.querySelector('form')),footer:rect(node.querySelector('a[href$="support"]')),
            overflow:node.scrollHeight-node.clientHeight,scroll:log.scrollTop,
            logOverflow:log.scrollHeight-log.clientHeight};
        }"""
    )
    assert geometry["panel"]["top"] >= 0
    assert geometry["panel"]["bottom"] <= height
    assert geometry["panel"]["left"] >= 0
    assert geometry["panel"]["right"] <= width
    assert geometry["overflow"] <= 1
    assert geometry["logOverflow"] > 0
    assert geometry["scroll"] > 0
    for name in ("close", "form", "footer"):
        assert geometry[name]["top"] >= geometry["panel"]["top"]
        assert geometry[name]["bottom"] <= geometry["panel"]["bottom"]
    expect(field).to_be_editable()


@pytest.mark.parametrize("width", [390, 1440])
def test_support_close_restores_trigger_and_allows_reopening(page, width):
    page.set_viewport_size({"width": width, "height": 844})
    page.goto("/support")
    trigger = page.get_by_role("button", name="Спросить бота", exact=True)
    trigger.click()
    dialog = page.locator("#support-bot")
    expect(dialog.get_by_role("textbox", name="Вопрос", exact=True)).to_be_focused()
    dialog.get_by_role("button", name="Закрыть поддержку", exact=True).click()
    expect(dialog).to_be_hidden()
    expect(trigger).to_be_focused()
    trigger.press("Enter")
    expect(dialog).to_be_visible()
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    expect(trigger).to_be_focused()
    page.goto("/news")
    launcher = page.get_by_role("button", name="Открыть бота поддержки", exact=True)
    expect(launcher).to_be_visible()
    launcher.click()
    expect(dialog).to_be_visible()
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    expect(launcher).to_be_focused()


def test_support_error_keeps_question_and_allows_retry(page):
    page.set_viewport_size({"width": 390, "height": 568})
    page.route(
        "**/api/support/ask",
        lambda route: route.fulfill(status=503, json={"error": "Ответ временно недоступен."}),
    )
    page.goto("/support")
    page.get_by_role("button", name="Спросить бота", exact=True).click()
    dialog = page.locator("#support-bot")
    field = dialog.get_by_role("textbox", name="Вопрос", exact=True)
    field.fill("Как вступить в клуб?")
    dialog.get_by_role("button", name="Спросить", exact=True).click()
    expect(dialog.get_by_role("alert")).to_contain_text("Ответ временно недоступен.")
    expect(dialog.locator(".club-bot-mine")).to_have_text("Как вступить в клуб?")
    expect(field).to_be_editable()
    page.unroute("**/api/support/ask")
    field.fill("Как вступить в клуб?")
    dialog.get_by_role("button", name="Спросить", exact=True).click()
    expect(dialog.locator(".club-bot-say")).to_contain_text("Подайте заявку на сайте.")


@pytest.mark.parametrize("width", [390, 768, 1440])
def test_home_program_cards_align_details_without_underlining_everything(page, site, width):
    titles = [
        "Короткое название",
        "Программа по договорному праву",
        "Практические вопросы применения корпоративного права",
        "Медиация",
    ]
    site[1]["/programs"] = [
        {
            **PROGRAM,
            "id": f"program-{i}",
            "slug": f"program-{i}",
            "title": title,
            "cover": "/assets/programs/472681893.jpg",
        }
        for i, title in enumerate(titles)
    ]
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/")
    cards = page.locator(".home-dpo__grid > article")
    expect(cards).to_have_count(4)
    geometry = cards.evaluate_all(
        """cards => cards.map(card => ({
          top:Math.round(card.getBoundingClientRect().top),
          price:card.querySelector('strong').getBoundingClientRect().top,
          decoration:getComputedStyle(card.querySelector('a')).textDecorationLine
        }))"""
    )
    for card in geometry:
        assert card["decoration"] == "none"
        row = [item["price"] for item in geometry if item["top"] == card["top"]]
        assert max(row) - min(row) <= 1
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
