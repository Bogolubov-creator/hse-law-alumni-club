from copy import deepcopy
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import PROFILE

from club_web.mirror import fixtures, snapshot
from club_web.pages import resource


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        instance = getattr(playwright, request.param).launch()
        yield instance
        instance.close()


def member_profile():
    profile = deepcopy(PROFILE)
    profile["level"].update(points=137, discount=17, next_level="Друг клуба", to_next=63)
    profile["achievements"] = [
        {
            "key": "office_seal",
            "title": "Печать офиса",
            "description": "Выпуск подтверждён учебным офисом.",
            "icon": "✓",
            "earned": True,
            "current": 1,
            "target": 1,
            "kind": "статус",
        },
        {
            "key": "activist",
            "title": "Активист",
            "description": "Посетите три мероприятия клуба.",
            "icon": "3",
            "earned": False,
            "current": 2,
            "target": 3,
            "kind": "мероприятия",
        },
    ]
    return profile


def test_mirror_has_achievement_catalog_without_inventing_completed_activity():
    root = Path(__file__).resolve().parents[3]
    profile = snapshot(fixtures(root))["/me"]
    definitions = resource("domain-data.json")["achievements"]
    assert [row["key"] for row in profile["achievements"]] == [row["key"] for row in definitions]
    assert [row["key"] for row in profile["achievements"] if row["earned"]] == ["office_seal"]
    assert all(row["current"] == 0 for row in profile["achievements"] if row["key"] == "first_step")
    assert profile["level"]["next_level"] == "Друг клуба"
    assert profile["level"]["to_next"] == 120


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_cabinet_displays_server_progress_and_distinct_achievement_states(page, site, width, pwa):
    site[1]["/me"] = member_profile()
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk?pwa=1" if pwa else "/lk")
    expect(page.locator(".cabinet-membership")).to_contain_text("137")
    expect(page.locator(".cabinet-membership")).to_contain_text("17%")
    expect(page.locator(".cabinet-membership")).to_contain_text("63 балла")
    expect(page.locator("[data-achievement-earned='true']")).to_have_count(1)
    earned = page.locator("[data-achievement-key=office_seal]")
    locked = page.locator("[data-achievement-key=activist]")
    expect(earned).to_contain_text("Получено")
    expect(locked).to_contain_text("Ещё не получено")
    expect(locked.get_by_role("progressbar")).to_have_attribute("value", "2")
    expect(locked.get_by_role("progressbar")).to_have_attribute("max", "3")
    page.get_by_role("navigation", name="Разделы кабинета").get_by_role("link", name="Достижения").click()
    expect(page.locator("#achievements > h2")).to_be_in_viewport()
    expect(page.locator(".cabinet-nav a[aria-current]")).to_contain_text("Достижения")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert page.locator(".cabinet-membership").evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    assert locked.evaluate("node => node.scrollWidth <= node.clientWidth + 1")


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_unverified_member_does_not_see_verified_benefits_or_awards(page, site, status):
    profile = member_profile()
    profile["alumni"]["verification_status"] = status
    site[1]["/me"] = profile
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk")
    expect(
        page.get_by_role("heading", name="Заявка отклонена" if status == "rejected" else "Заявка на проверке")
    ).to_be_visible()
    expect(page.locator(".cabinet-membership")).to_have_count(0)
    expect(page.locator("[data-achievement-key]")).to_have_count(0)


def test_missing_achievement_data_does_not_claim_no_activity(page, site):
    site[1]["/me"] = deepcopy(PROFILE)
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#achievements")
    expect(page.locator("#achievements")).to_contain_text("Прогресс достижений пока недоступен.")
    expect(page.locator("#achievements")).not_to_contain_text("Достижения появятся по мере участия")
    expect(page.locator("[data-achievement-key]")).to_have_count(0)


def test_cabinet_avatar_uses_existing_avatar_endpoint(page, site):
    profile = member_profile()
    identifier = "00000000-0000-4000-8000-000000000001"
    profile["alumni"]["avatar"] = identifier
    site[1]["/me"] = profile
    page.route(
        "**/api/avatars/" + identifier,
        lambda route: route.fulfill(path=Path(__file__).resolve().parents[2] / "public/icon-192.png"),
    )
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk")
    avatar = page.locator(".cabinet-avatar")
    expect(avatar).to_have_attribute("src", "/api/avatars/" + identifier)
    avatar.evaluate("image => image.decode()")
    assert avatar.evaluate("image => image.naturalWidth > 0")


def test_event_load_error_is_not_presented_as_empty_schedule(page, site):
    site[1]["unavailable_events"] = True
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk")
    expect(page.locator("#club-overview")).to_contain_text("Не удалось загрузить ближайшие встречи.")
    expect(page.locator("#club-overview")).not_to_contain_text("Ближайших встреч пока нет.")


def test_mirror_cabinet_exposes_earned_and_locked_achievements(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.goto(mirror_site + "lk/")
    expect(page.locator("[data-achievement-key]")).to_have_count(16)
    expect(page.locator("[data-achievement-earned=true]")).to_have_count(1)
    page.get_by_role("navigation", name="Разделы кабинета").get_by_role("link", name="Достижения").click()
    expect(page.locator("[data-achievement-key=office_seal]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    context.close()
