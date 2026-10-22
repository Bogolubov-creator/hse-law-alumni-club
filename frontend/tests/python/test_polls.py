from copy import deepcopy

import pytest
from playwright.sync_api import expect, sync_playwright
from test_browser import mirror_site as mirror_site
from test_browser import page as page
from test_browser import site as site
from test_pages import PROFILE

POLL = {
    "id": "poll-1",
    "question": "Какая тема вам интереснее?",
    "status": "active",
    "created_at": "2026-10-22T09:00:00Z",
    "opened_at": "2026-10-22T09:05:00Z",
    "closed_at": None,
    "options": [
        {"id": "option-1", "label": "Трудовое право"},
        {"id": "option-2", "label": "Гражданское право"},
        {"id": "option-3", "label": "Уголовное право"},
    ],
    "my_option_id": None,
}


@pytest.fixture(scope="module", params=["chromium", "webkit"])
def chromium(request):
    with sync_playwright() as playwright:
        browser = getattr(playwright, request.param).launch()
        yield browser
        browser.close()


@pytest.mark.parametrize("width", [320, 390, 1440])
def test_member_poll_selects_one_option_and_renders_confirmation(page, site, width):
    record = deepcopy(POLL)
    site[1]["/me/polls"] = {"items": [record], "total": 1, "page": 1, "limit": 20}
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#polls")
    expect(page.get_by_role("group", name=POLL["question"])).to_be_visible()
    page.get_by_label("Трудовое право", exact=True).check()
    page.get_by_label("Гражданское право", exact=True).check()
    record["my_option_id"] = "option-2"
    page.get_by_role("button", name="Проголосовать", exact=True).click()
    expect(page.locator("#polls")).to_contain_text("Ваш голос принят")
    expect(page.locator(".poll-answer-selected")).to_contain_text("Гражданское право")
    expect(page.locator("#polls input[type=radio]")).to_have_count(0)
    assert site[2][-1]["body"] == {"option_id": "option-2"}
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def test_poll_available_to_logged_in_pending_member(page, site):
    profile = deepcopy(PROFILE)
    profile["alumni"]["verification_status"] = "pending"
    site[1]["/me"] = profile
    site[1]["/me/polls"] = {"items": [POLL], "total": 1}
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#polls")
    expect(page.get_by_label("Трудовое право", exact=True)).to_be_visible()


def test_poll_closed_and_empty_states(page, site):
    poll = {**POLL, "status": "closed"}
    site[1]["/me/polls"] = {"items": [poll], "total": 1}
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#polls")
    expect(page.locator("#polls")).to_contain_text("Голосование завершено")
    expect(page.get_by_role("button", name="Проголосовать")).to_have_count(0)
    site[1]["/me/polls"] = {"items": [], "total": 0}
    page.reload()
    expect(page.locator("#polls")).to_contain_text("Сейчас опросов нет")


def test_poll_offline_vote_is_not_queued(page, site):
    site[1]["/me/polls"] = {"items": [POLL], "total": 1}
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#polls")
    page.get_by_label("Трудовое право", exact=True).check()
    page.context.set_offline(True)
    page.get_by_role("button", name="Проголосовать").click()
    expect(page.locator("#polls [data-error]")).to_contain_text("Для отправки данных нужен интернет")
    assert not site[2]
    page.context.set_offline(False)
    expect(page.get_by_label("Трудовое право", exact=True)).to_be_checked()
    assert not site[2]


@pytest.mark.parametrize("width", [320, 390, 768, 1440])
def test_admin_poll_form_and_results(page, site, width):
    poll = {
        **POLL,
        "status": "draft",
        "total_votes": 0,
        "opened_at": None,
        "options": [{**row, "count": 0, "percent": 0.0} for row in POLL["options"]],
    }
    site[1]["/admin/polls"] = {"items": [poll], "total": 1, "page": 1, "limit": 20}
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("localStorage.setItem('club_admin_token','office-qa');")
    page.goto("/admin/polls")
    page.locator(".poll-editor").get_by_label("Вопрос", exact=True).fill("Новая встреча клуба?")
    page.get_by_label("Варианты, по одному в строке").fill("Первый вариант\nВторой вариант")
    page.get_by_role("button", name="Создать черновик").click()
    expect(page.locator("#toast")).to_contain_text("Изменения сохранены")
    assert site[2][-1]["body"] == {"question": "Новая встреча клуба?", "options": ["Первый вариант", "Второй вариант"]}
    page.once("dialog", lambda dialog: dialog.accept())
    poll.update(status="active", opened_at=POLL["opened_at"])
    page.get_by_role("button", name="Запустить опрос", exact=True).click()
    expect(page.get_by_role("button", name="Закрыть голосование")).to_be_visible()
    assert site[2][-1]["path"] == "/admin/polls/poll-1/launch"
    poll["total_votes"] = 3
    poll["options"][0].update(count=2, percent=66.7)
    poll["options"][1].update(count=1, percent=33.3)
    page.get_by_role("button", name="Обновить", exact=True).click()
    expect(page.locator(".poll-total")).to_contain_text("3")
    expect(page.get_by_role("meter").first).to_have_attribute("value", "66.7")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.once("dialog", lambda dialog: dialog.accept())
    poll["status"] = "closed"
    page.get_by_role("button", name="Закрыть голосование").click()
    expect(page.locator(".poll-state")).to_have_text("Завершён")


def test_editor_cannot_open_poll_management(page, site):
    site[1]["/auth/admin-session"] = {"role": "editor"}
    page.add_init_script("localStorage.setItem('club_admin_token','editor-qa');")
    page.goto("/admin/polls")
    expect(page.get_by_role("heading", name="Нужен доступ администратора")).to_be_visible()
    expect(page.get_by_role("button", name="Создать черновик")).to_have_count(0)
    expect(
        page.get_by_role("navigation", name="Панель офиса").get_by_role("link", name="Опросы", exact=True)
    ).to_have_count(0)


def test_poll_error_does_not_claim_no_polls(page, site):
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    site[1]["unavailable_polls"] = True
    page.goto("/lk#polls")
    expect(page.locator("#polls")).to_contain_text("Не удалось загрузить опросы")
    expect(page.locator("#polls")).not_to_contain_text("Сейчас опросов нет")


@pytest.mark.parametrize("path,token", [("/admin/polls", "club_admin_token"), ("/lk#polls", "club_token")])
@pytest.mark.parametrize("status", [429, 503])
def test_session_outage_does_not_present_login_or_clear_token(page, site, path, token, status):
    page.set_viewport_size({"width": 390, "height": 844})
    page.add_init_script("localStorage.setItem('" + token + "','session-qa');")
    site[1]["session_failure_status"] = status
    with page.expect_response(lambda response: response.url.endswith("/views" + path.split("#")[0])) as unavailable:
        page.goto(path)
    assert unavailable.value.status == status
    expect(page.get_by_role("heading", name="Не удалось загрузить страницу", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Войти", exact=True)).to_have_count(0)
    assert page.evaluate("localStorage.getItem('" + token + "')") == "session-qa"
    site[1].pop("session_failure_status")
    page.locator("#main").get_by_role("button", name="Повторить", exact=True).click()
    expect(page.get_by_role("heading", name="Не удалось загрузить страницу", exact=True)).to_have_count(0)


def test_mirror_polls_are_labelled_and_writes_disabled(chromium, mirror_site):
    context = chromium.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.setItem('club_cookie_consent','essential');")
    page = context.new_page()
    page.goto(mirror_site + "lk/#polls")
    expect(page.locator("#polls")).to_contain_text("Голоса здесь не отправляются")
    expect(page.get_by_role("button", name="Проголосовать")).to_be_disabled()
    page.goto(mirror_site + "admin/polls/")
    expect(page.locator(".office-poll-list")).to_contain_text("вымышленные опросы")
    expect(page.locator(".poll-total")).to_contain_text("24")
    expect(page.get_by_role("button", name="Создать черновик")).to_be_disabled()
    context.close()


@pytest.mark.parametrize("width,pwa", [(320, False), (390, False), (768, False), (1440, False), (1440, True)])
def test_poll_choices_remain_compact_and_keyboard_accessible(page, site, width, pwa):
    record = deepcopy(POLL)
    site[1]["/me/polls"] = {"items": [record], "total": 1}
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk?pwa=1#polls" if pwa else "/lk#polls")
    choices = page.locator("#polls .poll-choice")
    expect(choices).to_have_count(3)
    for choice in choices.all():
        radio = choice.get_by_role("radio")
        size = radio.bounding_box()
        assert 16 <= size["width"] <= 24 and 16 <= size["height"] <= 24, size
        assert choice.bounding_box()["height"] <= 80
        assert choice.locator("span").bounding_box()["width"] >= 100
        assert choice.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    first = choices.first.get_by_role("radio")
    first.focus()
    page.keyboard.press("Space")
    expect(first).to_be_checked()
    page.keyboard.press("ArrowDown")
    expect(choices.nth(1).get_by_role("radio")).to_be_checked()
    expect(first).not_to_be_checked()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    record["my_option_id"] = "option-2"
    page.get_by_role("button", name="Проголосовать", exact=True).click()
    expect(page.locator(".poll-answer-selected")).to_contain_text("Гражданское право")


@pytest.mark.parametrize("width", [320, 1440])
def test_poll_long_labels_wrap_and_submission_error_preserves_choice(page, site, width):
    record = deepcopy(POLL)
    label = "Правовые вопросы использования цифровых технологий, обработки персональных данных и защиты трудовых прав сотрудников при дистанционной работе"
    record["options"][0]["label"] = label
    site[1]["/me/polls"] = {"items": [record], "total": 1}
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("localStorage.setItem('club_token','member-qa');")
    page.goto("/lk#polls")
    radio = page.get_by_role("radio", name=label, exact=True)
    radio.check()
    choice = radio.locator("..")
    assert choice.locator("span").bounding_box()["width"] >= 100
    assert choice.evaluate("node => node.scrollWidth <= node.clientWidth + 1")
    page.route(
        "**/api/me/polls/poll-1/vote",
        lambda route: route.fulfill(status=503, json={"error": "Не удалось отправить голос. Повторите позже."}),
    )
    page.get_by_role("button", name="Проголосовать", exact=True).click()
    expect(page.locator("#polls [data-error]")).to_contain_text("Не удалось отправить голос")
    expect(radio).to_be_checked()
    expect(page.get_by_role("button", name="Проголосовать", exact=True)).to_be_enabled()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
