import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import NEWS

from club_web.news import prepare_news
from club_web.pages import resource

MEETING_URL = "https://pravo.hse.ru/news/1133936920.html"
INTERVIEW_URL = "https://pravo.hse.ru/news/894336073.html"


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


def news_records(site):
    current = {
        **NEWS,
        "title": "Встреча выпускников факультета права: развитие сообщества и новые возможности для разных поколений",
        "excerpt": "Выпускники обсудили предложения по развитию клуба и встретились с преподавателями.",
        "source_url": MEETING_URL,
        "body": "Первый абзац публикации.\nВторая строка.\n\nВторой абзац публикации.",
    }
    older = {
        **NEWS,
        "slug": "interview",
        "title": "Интервью с выпускницей факультета права",
        "source_url": INTERVIEW_URL,
        "published_at": "2024-02-06T09:00:00Z",
    }
    undated = {**NEWS, "slug": "undated", "title": "Публикация без фото и даты", "published_at": None}
    site[1]["/news"] = [undated, older, current]
    site[1]["/news/news-one"] = current
    return current


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_news_cards_and_full_article_remain_readable(page, site, width, pwa):
    current = news_records(site)
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/news?pwa=1" if pwa else "/news")
    cards = page.locator(".news-card")
    expect(cards).to_have_count(3)
    expect(cards.first.get_by_role("heading", name=current["title"], exact=True)).to_be_visible()
    expect(cards.first.get_by_text("Последняя публикация", exact=True)).to_be_visible()
    expect(cards.last.locator("time,[data-news-media]")).to_have_count(0)
    for card in cards.all():
        card.scroll_into_view_if_needed()
        assert card.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        title = card.locator("h2")
        assert title.evaluate("node => getComputedStyle(node).overflow") != "hidden"
        for image in card.locator("img").all():
            image.evaluate("node => node.decode()")
            assert image.evaluate("node => node.clientWidth <= node.naturalWidth + 1")
            assert image.evaluate(
                "node => Math.abs(node.clientWidth / node.clientHeight - node.naturalWidth / node.naturalHeight) < .02"
            )
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    cards.first.get_by_role("button", name="Сохранить", exact=True).click()
    expect(cards.first.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    cards.first.get_by_role("link", name="Читать новость", exact=True).click()
    expect(page.locator("#main h1")).to_have_text(current["title"])
    expect(page.locator(".news-post__body p")).to_have_count(2)
    expect(page.locator(".news-post__body p").first).to_have_text("Первый абзац публикации.\nВторая строка.")
    expect(page.locator("#main .save-material")).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".news-post__footer a").last).to_have_attribute("href", MEETING_URL)
    expect(page.locator(".news-post__photo figcaption")).to_contain_text("факультет права НИУ ВШЭ")
    assert page.locator(".news-post__body").evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.get_by_role("link", name="← Все новости", exact=True).click()
    expect(page.locator(".news-card")).to_have_count(3)


@pytest.mark.parametrize("width", [390, 1440])
def test_failed_news_photo_collapses_without_losing_content(page, site, width):
    current = news_records(site)
    page.route("**/assets/photos/alumni-meeting-full.jpg", lambda route: route.fulfill(status=404, body=""))
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/news")
    card = page.locator(".news-card").first
    expect(card.locator("[data-news-media]")).to_be_hidden()
    expect(card.get_by_role("heading", name=current["title"], exact=True)).to_be_visible()
    assert card.evaluate("node => getComputedStyle(node).gridTemplateColumns.split(' ').length") == 1
    card.get_by_role("link", name="Читать новость", exact=True).click()
    expect(page.locator(".news-post__photo")).to_be_hidden()
    expect(page.locator(".news-post__body")).to_contain_text("Второй абзац публикации.")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def test_news_empty_state_and_network_retry_are_distinct(page, site):
    site[1]["/news"] = []
    page.goto("/news")
    expect(page.get_by_role("heading", name="Новостей пока нет", exact=True)).to_be_visible()
    site[1]["unavailable_news"] = True
    page.reload()
    expect(page.get_by_role("heading", name="Новости временно недоступны", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="Новостей пока нет", exact=True)).to_have_count(0)
    site[1]["unavailable_news"] = False
    news_records(site)
    page.get_by_role("button", name="Повторить загрузку", exact=True).click()
    expect(page.locator(".news-card")).to_have_count(3)


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_news_save_detail_source_and_return(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(mirror_site + "news/")
    card = page.locator(".news-card").first
    expect(card.locator("[data-news-image]")).to_be_visible()
    title = card.locator("h2").inner_text()
    card.get_by_role("button", name="Сохранить", exact=True).click()
    card.get_by_role("link", name="Читать новость", exact=True).click()
    expect(page.locator("#main h1")).to_have_text(title)
    expect(page.locator("#main .save-material")).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".news-post__footer a").last).to_have_attribute("href", MEETING_URL)
    page.get_by_role("link", name="← Все новости", exact=True).click()
    expect(page.locator(".news-card").first.locator(".save-material")).to_have_attribute("aria-pressed", "true")
    page.get_by_role("link", name="Сохранённые материалы", exact=True).click()
    expect(page.locator("[data-reading-list=saved]")).to_contain_text(title)
    assert not errors
    context.close()


@pytest.mark.parametrize("source", ["javascript:alert(1)", "https://pravo.hse.ru.evil.test/news/1133936920.html"])
def test_news_photo_and_source_are_not_inferred_from_a_similar_url(source):
    item = prepare_news({**NEWS, "source_url": source, "published_at": "invalid"}, resource("news-media.json"))
    assert item["photo"] is None
    assert item["published_iso"] == ""
    if source.startswith("javascript:"):
        assert item["source_href"] == ""
    else:
        assert item["source_name"] != "Факультет права НИУ ВШЭ"
