import copy
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_browser import wait_for_offline_page
from test_pages import browser_client as browser_client

from club_web import pages

STORIES = pages.resource("alumni-stories.json")["items"]


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


@pytest.mark.parametrize("story", STORIES, ids=lambda story: story["slug"])
async def test_public_story_renders_full_biography_sources_and_real_photo(browser_client, story):
    response = await browser_client.get("/stories/" + story["slug"])
    assert response.status_code == 200
    assert f"<h1>{story['name']}</h1>" in response.text
    assert story["biography"][0] in response.text
    assert story["study"]["description"] in response.text
    assert "Демоверсия" not in response.text
    for source in story["sources"]:
        assert urlsplit(source["url"]).hostname.endswith(".hse.ru")
        assert source["url"] in response.text
    photo = await browser_client.get("/assets/photos/" + story["photo"]["file"])
    assert photo.status_code == 200
    assert photo.headers["content-type"].startswith("image/")


@pytest.mark.parametrize("path", ["/stories/missing", "/stories/petr-posmakov/extra"])
async def test_unknown_story_is_not_a_successful_or_offline_page(browser_client, path):
    response = await browser_client.get(path)
    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"
    assert "x-club-offline" not in response.headers


@pytest.mark.parametrize("authorized", [False, True])
async def test_public_story_offline_permission_excludes_authenticated_responses(browser_client, authorized):
    headers = {"authorization": "Bearer member-test"} if authorized else {}
    response = await browser_client.get("/stories/petr-posmakov", headers=headers)
    assert response.headers.get("X-Club-Offline") == (None if authorized else "public")


async def test_story_text_is_escaped_in_page_and_metadata(browser_client, monkeypatch):
    original = pages.resource
    data = copy.deepcopy(original("alumni-stories.json"))
    data["items"][0]["teaser"] = '<script>alert("story")</script>'
    monkeypatch.setattr(pages, "resource", lambda name: data if name == "alumni-stories.json" else original(name))
    response = await browser_client.get("/stories/" + data["items"][0]["slug"])
    assert response.status_code == 200
    assert '<script>alert("story")</script>' not in response.text
    assert "&lt;script&gt;" in response.text


async def test_empty_editorial_catalog_has_no_placeholder_people(browser_client, monkeypatch):
    original = pages.resource
    monkeypatch.setattr(
        pages, "resource", lambda name: {"items": []} if name == "alumni-stories.json" else original(name)
    )
    response = await browser_client.get("/stories")
    assert response.status_code == 200
    assert "Истории готовятся к публикации." in response.text
    response = await browser_client.get("/")
    assert 'id="alumni-stories"' not in response.text


@pytest.mark.parametrize("width", [320, 390, 768, 1440])
def test_home_story_cards_open_complete_pages_without_cropping_or_overflow(page, width):
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/")
    cards = page.locator("#alumni-stories [data-alumni-story]")
    expect(cards).to_have_count(min(3, len(STORIES)))
    for index, story in enumerate(STORIES[:3]):
        card = cards.nth(index)
        card.scroll_into_view_if_needed()
        expect(card.get_by_role("heading", name=story["name"], exact=True)).to_be_visible()
        assert "HSE Slab" in card.locator("h3").evaluate("heading => getComputedStyle(heading).fontFamily")
        expect(card).to_contain_text(story["study"]["label"])
        image = card.locator("img")
        expect(image).to_have_js_property("complete", True)
        image.evaluate("image => image.decode()")
        assert image.evaluate(
            "image => image.clientWidth > 0 && image.clientWidth <= image.naturalWidth + 1 && Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < 0.02"
        )
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    cards.first.locator("a").focus()
    page.keyboard.press("Enter")
    expect(page.get_by_role("heading", name=STORIES[0]["name"], exact=True)).to_be_visible()
    page.get_by_role("link", name="← На главную", exact=True).click()
    expect(page.locator("#alumni-stories-title")).to_be_in_viewport()


@pytest.mark.parametrize("width", [320, 390, 768, 1440])
def test_each_story_detail_has_readable_study_career_and_related_navigation(page, width):
    page.set_viewport_size({"width": width, "height": 1000})
    for story in STORIES:
        page.goto("/stories/" + story["slug"])
        expect(page.get_by_role("heading", name=story["name"], exact=True)).to_be_visible()
        expect(page.locator(".story-study")).to_contain_text(story["study"]["description"])
        photo = page.locator(".story-hero__portrait img")
        expect(photo).to_have_js_property("complete", True)
        photo.evaluate("image => image.decode()")
        assert photo.evaluate(
            "image => image.clientWidth > 0 && image.clientWidth <= image.naturalWidth + 1 && Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < 0.02"
        )
        expect(page.locator(".story-timeline li")).to_have_count(len(story["career"]))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    related = page.locator(".story-related [data-alumni-story]").first
    name = related.locator("h3").inner_text()
    related.locator("a").click()
    expect(page.get_by_role("heading", name=name, exact=True)).to_be_visible()
    page.get_by_role("link", name="Все истории выпускников", exact=True).click()
    expect(page.locator("[data-alumni-story]")).to_have_count(len(STORIES))


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_story_links_and_photos_keep_repository_prefix(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(mirror_site)
    page.locator("#alumni-stories [data-alumni-story] a").first.click()
    for story in STORIES:
        response = page.goto(mirror_site + "stories/" + story["slug"] + "/")
        assert response.status == 200
        expect(page.get_by_role("heading", name=story["name"], exact=True)).to_be_visible()
        image = page.locator(".story-hero__portrait img")
        image.evaluate("image => image.decode()")
        assert image.get_attribute("src").startswith("/club-preview/assets/photos/")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        fragment = context.request.get(mirror_site + "views/stories/" + story["slug"] + ".html")
        assert fragment.status == 200
        assert story["name"] in fragment.text()
    page.get_by_role("link", name="Все истории выпускников", exact=True).click()
    assert urlsplit(page.url).path.rstrip("/") == "/club-preview/stories"
    assert not errors
    context.close()


def test_opened_public_story_can_be_read_offline(chromium, site):
    if chromium.browser_type.name != "chromium":
        pytest.skip("Проверка service worker выполняется в Chromium")
    context = chromium.new_context(base_url=site[0], viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.goto("/stories/petr-posmakov")
    page.evaluate("navigator.serviceWorker.ready")
    wait_for_offline_page(page, "/stories/petr-posmakov")
    page.locator(".story-hero__portrait img").evaluate("image => image.decode()")
    page.evaluate("""async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await caches.match(new URL('/assets/photos/alumni-petr-posmakov.jpeg', location.origin))) return;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('Фотография истории не сохранена');
    }""")
    context.set_offline(True)
    page.reload()
    expect(page.get_by_role("heading", name="Петр Посмаков", exact=True)).to_be_visible()
    expect(page.locator("#offline-notice")).to_contain_text("Сохранённая копия от")
    page.locator(".story-hero__portrait img").evaluate("image => image.decode()")
    assert page.locator(".story-hero__portrait img").evaluate("image => image.complete && image.naturalWidth > 0")
    context.close()
