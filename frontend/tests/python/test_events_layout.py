from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import pytest
import test_browser
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import EVENT

from club_web.events import event_order, prepare_event


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


def events_records(site):
    primary = {
        **EVENT,
        "title": "Встреча выпускников: профессиональные связи, практика и развитие юридической карьеры",
        "description": "Обсуждаем профессиональные вопросы.\nВстречаемся с выпускниками.\n\nВторая часть встречи.",
        "location": "Москва, Милютинский переулок, 13",
        "starts_at": "2032-02-28T22:30:00Z",
    }
    another = {**primary, "id": "second", "title": "Вторая встреча в тот же день", "starts_at": "2032-02-29T17:00:00Z"}
    past = {**primary, "id": "past", "title": "Архивная встреча", "status": "done", "starts_at": "2032-02-12T10:00:00Z"}
    january = {**primary, "id": "january", "title": "Январская встреча", "starts_at": "2032-01-12T10:00:00Z"}
    site[1]["/events"] = [january, past, another, primary]
    return primary


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_event_month_agenda_and_detail_keep_content_and_calendar_links(page, site, width, pwa):
    primary = events_records(site)
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/events?month=2032-02" + ("&pwa=1" if pwa else ""))
    expect(page.locator("[data-events-count]")).to_have_text("Событий: 3")
    expect(page.locator(".event-card:visible")).to_have_count(3)
    expect(page.locator(".site-calendar-grid .has-events")).to_have_count(2)
    assert page.locator(".site-calendar-grid > div > span").count() == 29
    expect(page.locator('[data-calendar-date="2032-02-29"] a')).to_have_attribute("href", "#event-event-1")
    expect(page.locator(".event-card:visible").first.locator("h3")).to_have_text(primary["title"])
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    for card in page.locator(".event-card:visible").all():
        assert card.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
        assert card.locator("h3").evaluate("node => getComputedStyle(node).overflow") != "hidden"
    page.locator('[data-calendar-date="2032-02-29"] a').click()
    expect(page).to_have_url(site[0] + "/events?month=2032-02" + ("&pwa=1" if pwa else "") + "#event-event-1")
    card = page.locator("#event-event-1")
    card.get_by_role("button", name="Сохранить", exact=True).click()
    card.get_by_role("link", name="Подробнее о встрече", exact=True).click()
    expect(page.locator("#main h1")).to_have_text(primary["title"])
    expect(page.locator(".club-event-detail__story p")).to_have_count(2)
    expect(page.locator(".club-event-detail__info")).to_contain_text("29 февраля 2032 · 01:30")
    expect(page.locator("#main .save-material")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_role("link", name="Файл .ics", exact=True)).to_have_attribute("href", "/api/events/event-1.ics")
    fields = parse_qs(
        urlsplit(page.get_by_role("link", name="Google Календарь", exact=False).get_attribute("href")).query
    )
    assert fields["dates"] == ["20320228T223000Z/20320229T003000Z"]
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.get_by_role("link", name="← Все события", exact=True).click()
    expect(page.locator("[data-events-period]")).to_have_text("Февраль 2032")
    expect(page.locator(".event-card:visible")).to_have_count(3)


def test_event_registration_keeps_member_login_and_cancel_flow(page, site):
    events_records(site)
    page.goto("/events/event-1?month=2032-02")
    page.get_by_role("button", name="Записаться", exact=True).click()
    expect(page.locator("#main h1")).to_have_text("Вход для выпускников")
    page.evaluate("localStorage.setItem('club_token','member-qa')")
    page.goto("/events/event-1?month=2032-02")
    page.get_by_role("button", name="Записаться", exact=True).click()
    expect(page.get_by_role("button", name="Отменить запись", exact=True)).to_be_visible()
    page.get_by_role("button", name="Отменить запись", exact=True).click()
    expect(page.get_by_role("button", name="Записаться", exact=True)).to_be_visible()
    assert [write["path"] for write in site[2]] == ["/events/event-1/rsvp", "/events/event-1/rsvp"]
    assert all(write["headers"]["authorization"] == "Bearer member-qa" for write in site[2])


def test_event_external_registration_and_past_state(page, site):
    record = events_records(site)
    record["reg_url"] = "https://example.test/registration"
    page.goto("/events/event-1")
    expect(page.get_by_role("link", name="Регистрация", exact=False)).to_have_attribute("href", record["reg_url"])
    expect(page.locator("[data-events-back]")).to_have_attribute("href", "/events?month=2032-02")
    page.goto("/events/past")
    expect(page.locator("[data-event-register]")).to_have_count(0)
    expect(page.locator(".club-event-detail__actions")).to_have_text("Событие завершено")


def test_event_empty_month_and_api_error_are_different(page, site):
    events_records(site)
    page.goto("/events?month=2032-03")
    expect(page.locator("[data-events-empty]")).to_be_visible()
    expect(page.locator("[data-events-count]")).to_have_text("Событий: 0")
    page.get_by_role("link", name="Предыдущий месяц", exact=True).click()
    expect(page.locator(".event-card:visible")).to_have_count(3)
    site[1]["unavailable_events"] = True
    page.reload()
    expect(page.get_by_role("heading", name="События временно недоступны", exact=True)).to_be_visible()
    expect(page.locator("[data-events-empty]")).to_have_count(0)
    site[1]["unavailable_events"] = False
    page.get_by_role("button", name="Повторить загрузку", exact=True).click()
    expect(page.locator(".event-card:visible")).to_have_count(3)


@pytest.mark.parametrize("width", [390, 1440])
def test_mirror_event_month_history_detail_and_ics(chromium, mirror_site, width):
    context = chromium.new_context(viewport={"width": width, "height": 1000}, service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(mirror_site + "events/?month=2026-09")
    expect(page.locator(".event-card:visible")).to_have_count(1)
    expect(page.locator("[data-events-count]")).to_have_text("Событий: 1")
    page.get_by_role("link", name="Следующий месяц", exact=True).click()
    expect(page.locator(".event-card:visible")).to_have_count(1)
    expect(page.locator("[data-events-period]")).to_contain_text("октябрь")
    page.get_by_role("link", name="Следующий месяц", exact=True).click()
    expect(page.locator("[data-events-empty]")).to_be_visible()
    page.go_back()
    expect(page.locator(".event-card:visible")).to_have_count(1)
    card = page.locator(".event-card:visible")
    title = card.locator("h3").inner_text()
    card.get_by_role("link", name="Подробнее о встрече", exact=True).click()
    expect(page.locator("#main h1")).to_have_text(title)
    with page.expect_download() as download:
        page.get_by_role("link", name="Файл .ics", exact=True).click()
    assert "BEGIN:VEVENT" in download.value.path().read_text()
    page.get_by_role("link", name="← Все события", exact=True).click()
    expect(page.locator("[data-events-period]")).to_contain_text("октябрь")
    expect(page.locator(".event-card:visible")).to_have_count(1)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not errors
    context.close()


def test_event_dates_are_moscow_local_without_invented_values():
    original = {**EVENT, "starts_at": "2032-02-28T22:30:00Z"}
    event = prepare_event(original, datetime(2032, 2, 28, tzinfo=UTC))
    assert (event["start_day"], event["day_number"], event["time_label"]) == ("2032-02-29", "29", "01:30")
    assert "start_day" not in original
    unknown = prepare_event({**EVENT, "starts_at": "неизвестно"})
    assert not unknown["starts_iso"] and not unknown["calendar_url"] and not unknown["start_day"]
    past = prepare_event({**original, "id": "past", "status": "done"})
    assert sorted([past, unknown, event], key=event_order) == [event, past, unknown]


@pytest.fixture
def future_mirror_data(monkeypatch):
    original = test_browser.fixtures

    def records(root):
        data = original(root)
        data["events"] = [
            {**EVENT, "starts_at": "2032-02-29T15:00:00Z"},
            {**EVENT, "id": "event-later", "starts_at": "2032-02-29T17:00:00Z"},
        ]
        return data

    monkeypatch.setattr(test_browser, "fixtures", records)


@pytest.fixture
def future_mirror_site(future_mirror_data, mirror_site):
    return mirror_site


def test_mirror_updates_past_status_after_build_and_marks_moscow_today(chromium, future_mirror_site):
    context = chromium.new_context(service_workers="block")
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.clock.install(time=datetime(2032, 2, 29, 22, 30, tzinfo=UTC))
    assert "data-event-register" in page.request.get(future_mirror_site + "events/").text()
    page.goto(future_mirror_site + "events/?month=2032-02")
    expect(page.locator(".event-card:visible")).to_have_count(2)
    expect(page.locator(".event-card:visible").first).to_have_attribute("data-event-id", "event-later")
    expect(page.locator("[data-event-register]")).to_have_count(0)
    expect(page.locator("[data-event-status]")).to_have_text(["Событие завершено", "Событие завершено"])
    page.get_by_role("link", name="Подробнее о встрече", exact=True).first.click()
    expect(page.locator("[data-event-register]")).to_have_count(0)
    expect(page.locator(".club-event-detail__actions")).to_have_text("Событие завершено")
    page.get_by_role("link", name="← Все события", exact=True).click()
    page.get_by_role("link", name="Этот месяц", exact=True).click()
    expect(page.locator('[data-calendar-date="2032-03-01"] [aria-current=date]')).to_have_text("1")
    expect(page.locator("[data-events-empty]")).to_be_visible()
    context.close()
