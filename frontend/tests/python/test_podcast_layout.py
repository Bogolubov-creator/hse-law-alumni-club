import io
import wave

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import EPISODE


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        instance = getattr(playwright, request.param).launch()
        yield instance
        instance.close()


def episode(identifier, free):
    return {
        **EPISODE,
        "id": identifier,
        "title": "Выпуск с длинным названием о договорном праве",
        "is_free": free,
        "audio_url": EPISODE["audio_url"] if free else None,
    }


@pytest.mark.parametrize("width", [320, 390, 768, 1440])
def test_podcast_listing_has_artwork_clear_listening_action_and_compact_subscription(page, site, width):
    site[1]["/podcasts"]["items"] = [EPISODE, episode("episode-2", False)]
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/podcasts")
    cards = page.locator("[data-podcast-card]")
    expect(cards).to_have_count(2)
    for card in cards.all():
        expect(card.locator(".podcast-artwork")).to_be_visible()
        assert card.locator(".podcast-artwork").bounding_box()["width"] >= 80
    assert page.locator(".podcast-artwork__type").evaluate_all(
        "nodes => nodes.every(node => node.scrollHeight <= node.clientHeight + 1 && node.querySelector('strong').scrollWidth <= node.querySelector('strong').clientWidth + 1)"
    )
    action = page.get_by_role("link", name="Слушать открытый выпуск", exact=True)
    expect(action).to_be_visible()
    assert action.get_attribute("href") == "/podcasts/episode-1"
    if width >= 1200:
        assert page.locator("#podcast-subscription").bounding_box()["width"] < width / 2
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    cards.first.get_by_role("button", name="Сохранить", exact=True).click()
    expect(cards.first.get_by_role("button", name="Сохранено", exact=True)).to_have_attribute("aria-pressed", "true")
    action.click()
    expect(page.locator("audio")).to_be_visible()
    assert page.locator("audio").evaluate("audio => audio.paused && !audio.autoplay")


def test_episode_player_decodes_audio_and_keeps_skip_and_speed_controls(page):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(bytes(8000 * 2 * 60))
    content = buffer.getvalue()

    def serve_audio(route):
        headers = {"Accept-Ranges": "bytes"}
        body = content
        status = 200
        requested = route.request.headers.get("range")
        if requested:
            start, end = requested.removeprefix("bytes=").split("-", 1)
            first = int(start or 0)
            last = min(int(end) if end else len(content) - 1, len(content) - 1)
            body = content[first : last + 1]
            headers["Content-Range"] = f"bytes {first}-{last}/{len(content)}"
            status = 206
        route.fulfill(status=status, content_type="audio/wav", headers=headers, body=body)

    page.route("**/api/podcasts/*/audio?*", serve_audio)
    page.goto("/podcasts/episode-1")
    audio = page.locator("audio")
    assert audio.evaluate("audio => audio.paused && !audio.autoplay")
    audio.evaluate("audio => audio.load()")
    expect(audio).to_have_js_property("readyState", 4)
    page.get_by_role("button", name="+15 секунд", exact=True).click()
    expect(audio).to_have_js_property("currentTime", 15)
    page.get_by_role("button", name="−15 секунд", exact=True).click()
    expect(audio).to_have_js_property("currentTime", 0)
    page.get_by_role("combobox", name="Скорость", exact=True).select_option("1.5")
    assert audio.evaluate("audio => audio.playbackRate") == 1.5
    expect(page.locator(".podcast-artwork")).to_be_visible()


@pytest.mark.parametrize("width", [390, 1440])
def test_locked_episode_keeps_artwork_without_exposing_audio(page, site, width):
    site[1]["/podcasts"]["items"] = [episode("episode-2", False)]
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/podcasts/episode-2")
    expect(page.locator(".podcast-artwork")).to_be_visible()
    expect(page.locator("audio")).to_have_count(0)
    expect(page.get_by_role("link", name="Условия подписки", exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def test_podcast_empty_catalog_does_not_offer_missing_trial(page, site):
    site[1]["/podcasts"]["items"] = []
    page.goto("/podcasts")
    expect(page.get_by_text("Выпуски пока не опубликованы.", exact=True)).to_be_visible()
    expect(page.get_by_role("link", name="Слушать открытый выпуск", exact=True)).to_have_count(0)


def test_mirror_podcast_demo_keeps_locked_and_free_states(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.goto(mirror_site + "podcasts/")
    expect(page.locator("[data-podcast-card]")).to_have_count(7)
    page.get_by_role("link", name="Слушать открытый выпуск", exact=True).click()
    expect(page.locator("audio")).to_be_visible()
    assert page.locator("audio").evaluate("audio => audio.paused")
    page.goto(mirror_site + "podcasts/mirror-pod-volos/")
    expect(page.locator("audio")).not_to_be_visible()
    expect(page.locator(".podcast-artwork")).to_be_visible()
    page.get_by_role("button", name="Проверить как подписчик", exact=True).click()
    expect(page.locator("audio")).to_be_visible()
    assert page.locator("audio").evaluate("audio => audio.paused")
    page.get_by_role("button", name="Выключить деморежим подписчика", exact=True).click()
    expect(page.locator("audio")).not_to_be_visible()
    context.close()
