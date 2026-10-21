import re

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        instance = getattr(playwright, request.param).launch()
        yield instance
        instance.close()


@pytest.mark.parametrize("width", [768, 1280, 1440])
def test_changes_filter_controls_align_and_reader_has_inset(page, width):
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/changes?view=all")
    expect(page.get_by_role("button", name="Поиск и фильтры", exact=True)).to_be_hidden()
    form = page.locator("[data-changes-form]")
    controls = form.locator("input,select").evaluate_all(
        "nodes => nodes.map(node => ({height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width}))"
    )
    assert min(item["height"] for item in controls) >= 48
    assert max(item["height"] for item in controls) - min(item["height"] for item in controls) <= 1
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    if width >= 1200:
        inset = page.locator(".changes-reader-hint").evaluate(
            "node => node.querySelector('h2').getBoundingClientRect().left-node.getBoundingClientRect().left"
        )
        assert inset >= 24
    first = page.locator("[data-change-row]").first
    meta = first.locator(".changes-row-meta").inner_text()
    assert "Обзор недели · Обзор недели" not in meta
    inset = first.evaluate(
        "node => node.querySelector('h2').getBoundingClientRect().left-node.getBoundingClientRect().left"
    )
    assert inset >= 16


@pytest.mark.parametrize("width,height", [(320, 568), (390, 844), (390, 420)])
def test_changes_mobile_filters_keep_apply_and_close_visible(page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.goto("/changes?view=all")
    trigger = page.get_by_role("button", name="Поиск и фильтры", exact=True)
    trigger.click()
    dialog = page.locator("[data-changes-filters]")
    expect(dialog).to_be_visible()
    cancel = dialog.get_by_role("button", name="Отмена", exact=True)
    submit = dialog.get_by_role("button", name="Показать", exact=True)
    close = dialog.get_by_role("button", name="Закрыть фильтры", exact=True)
    for control in (cancel, submit, close):
        box = control.bounding_box()
        assert box["y"] >= 0
        assert box["y"] + box["height"] <= height
        assert box["height"] >= 44
    search = dialog.get_by_role("searchbox")
    search.fill("237-ФЗ")
    cancel.click()
    expect(trigger).to_be_focused()
    trigger.click()
    expect(dialog.get_by_role("searchbox")).to_have_value("")
    dialog.get_by_role("searchbox").fill("237-ФЗ")
    submit.click()
    expect(page).to_have_url(re.compile(r"q=237"))
    expect(page.locator("[data-change-row]")).to_have_count(1)
    expect(page.locator("[data-changes-count]")).to_have_text("Найдено: 1")


def test_changes_no_results_has_visible_recovery_action(page):
    page.goto("/changes?view=all&q=none-found-qa")
    empty = page.locator(".changes-empty")
    expect(empty).to_be_visible()
    expect(empty.get_by_role("link", name="Сбросить фильтры", exact=True)).to_be_visible()


def test_changes_filters_still_work_without_javascript(chromium, site):
    context = chromium.new_context(base_url=site[0], viewport={"width": 390, "height": 844}, java_script_enabled=False)
    page = context.new_page()
    page.goto("/changes?view=all")
    form = page.locator("[data-changes-form]")
    expect(form.get_by_role("searchbox")).to_be_visible()
    form.get_by_role("searchbox").fill("237-ФЗ")
    form.get_by_role("button", name="Показать", exact=True).click()
    expect(page.locator("[data-change-row]")).to_have_count(1)
    context.close()


def test_mirror_changes_mobile_apply_cancel_and_empty_recovery(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential')")
    page = context.new_page()
    page.goto(mirror_site + "changes/?view=all")
    trigger = page.get_by_role("button", name="Поиск и фильтры", exact=True)
    dialog = page.locator("[data-changes-filters]")
    trigger.click()
    dialog.get_by_role("searchbox").fill("коллекторов")
    dialog.get_by_role("button", name="Показать", exact=True).click()
    expect(dialog).to_be_hidden()
    expect(page.locator("[data-change-row]:visible")).to_have_count(1)
    trigger.click()
    dialog.get_by_role("searchbox").fill("не применять")
    dialog.get_by_role("button", name="Закрыть фильтры", exact=True).click()
    expect(trigger).to_be_focused()
    trigger.click()
    expect(dialog.get_by_role("searchbox")).to_have_value("коллекторов")
    dialog.get_by_role("searchbox").fill("none-found-qa")
    dialog.get_by_role("button", name="Показать", exact=True).click()
    expect(page.locator(".changes-empty")).to_be_visible()
    page.locator(".changes-empty").get_by_role("link", name="Сбросить фильтры", exact=True).click()
    expect(page.locator(".changes-empty")).to_be_hidden()
    expect(page.locator("[data-change-row]:visible").first).to_be_visible()
    context.close()


def test_changes_mobile_contents_keeps_heading_below_navigation(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto("/changes/tg-17?view=all")
    link = page.get_by_role("navigation", name="Оглавление материала").get_by_role("link").first
    identifier = link.get_attribute("href")
    link.click()
    heading = page.locator(identifier)
    expect(heading).to_be_visible()
    assert heading.bounding_box()["y"] >= page.locator(".club-header").bounding_box()["height"]
