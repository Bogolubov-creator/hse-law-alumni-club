import httpx
import pytest

from club_web.formatting import payment_url, safe_url
from club_web.main import create_app
from club_web.pages import OFFICE_NAV, PUBLIC_PAGES

NEWS = {
    "id": "news-1",
    "slug": "news-one",
    "title": "Новость клуба",
    "body": "<script>alert(1)</script>",
    "published_at": "2026-10-01T09:00:00Z",
}
PROGRAM = {
    "id": "program-1",
    "slug": "course-one",
    "title": "Правовая программа",
    "direction": "Право",
    "duration": "40 часов",
    "format": "online",
    "price": 300000,
    "enrollment": "actual",
    "modules": [],
    "teachers": [],
}
PRODUCT = {
    "id": "product-1",
    "slug": "bag-one",
    "title": "Сумка клуба",
    "category": "Аксессуары",
    "price": 50000,
    "stock": 3,
    "images": [],
    "variants_json": [],
}
EVENT = {
    "id": "event-1",
    "title": "Встреча клуба",
    "starts_at": "2026-11-01T12:00:00Z",
    "status": "published",
    "format": "offline",
    "points": 60,
}
EPISODE = {
    "id": "episode-1",
    "title": "Правовая грамотность",
    "duration": "30:00",
    "is_free": True,
    "audio_url": "/api/podcasts/episode-1/audio?h=free",
}
PROFILE = {
    "alumni": {
        "fio": "Тестовый выпускник",
        "cohort": "2020",
        "verification_status": "verified",
        "contacts": {},
        "interests": [],
        "referral_code": "TEST",
    },
    "level": {"level_title": "Участник", "points": 100, "discount": 5},
    "achievements": [],
    "activity": [{"month": "сен", "points": 60}],
}
ANALYTICS = {
    "pulse": {"joins": 2},
    "snapshot": {"alumni_count": 5, "alumni_verified": 4, "verified_ratio": 80},
    "orders": {
        "paid_sum_kop": 250000,
        "by_type": [{"key": "dpo", "count": 1}],
        "by_status": [{"key": "confirmed", "count": 1}],
        "programs_top": [{"title": "Программа в аналитике", "qty": 2, "orders": 1}],
    },
    "community": {
        "points_by_reason": [{"key": "event", "count": 2}],
        "achievements_top": [{"title": "Первый шаг", "count": 1}],
    },
    "engagement": {
        "events_top": [{"title": "Встреча в аналитике", "rsvps": 3, "attended": 2}],
        "podcasts_top": [{"title": "Выпуск в аналитике", "plays": 4, "listeners": 3}],
    },
    "pageviews": {"hits": 7, "paths_top": [{"path": "/dpo", "count": 4}]},
    "support": {
        "open": 1,
        "created_in_range": 2,
        "by_status": [{"status": "open", "count": 1}],
        "by_topic": [{"topic": "Регистрация", "count": 1}],
    },
    "series": {"joins_by_day": [{"day": "2026-10-01", "count": 2}]},
}


@pytest.fixture
async def browser_client():
    async def upstream(request):
        path = request.url.path
        if path.startswith(("/me", "/auth/admin-session", "/admin")) and "authorization" not in request.headers:
            return httpx.Response(401, json={"error": "Войдите в кабинет"})
        endpoints = {
            "/pages/home": {"blocks": {}},
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
            "/auth/admin-session": {
                "role": "editor" if request.headers.get("authorization") == "Bearer editor-test" else "admin"
            },
            "/cart": {
                "items": [
                    {
                        "type": "merch",
                        "ref_id": PRODUCT["id"],
                        "title": PRODUCT["title"],
                        "price": PRODUCT["price"],
                        "qty": 2,
                    }
                ],
                "subtotal": 100000,
                "count": 2,
            },
            "/support/config": {"enabled": True, "version": "test-version", "consent": "Тестовое согласие"},
            "/admin/overview": {"alumni_count": 1},
            "/admin/system-health": {"checks": []},
            "/admin/analytics": ANALYTICS,
            "/admin/podcast-subs": {"items": [], "by_podcast": []},
            "/admin/news-sources": {"items": [], "sources": [], "automatic": False},
            "/admin/pages/home": {"blocks": {}},
        }
        if path in endpoints:
            return httpx.Response(200, json=endpoints[path])
        if path.startswith("/admin/"):
            return httpx.Response(200, json=[])
        return httpx.Response(404, json={"error": "Не найдено"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream), base_url="http://api.test") as api:
        app = create_app(api)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://web.test") as client:
            yield client


@pytest.mark.parametrize(
    "path",
    list(PUBLIC_PAGES)
    + ["/dpo/course-one", "/merch/bag-one", "/news/news-one", "/events/event-1", "/podcasts/episode-1"],
)
async def test_public_pages_render(browser_client, path):
    response = await browser_client.get(path)
    assert response.status_code == 200
    assert '<html lang="ru">' in response.text
    assert 'id="main"' in response.text
    assert "React" not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("section", [key for key, _ in OFFICE_NAV])
async def test_office_sections_render(browser_client, section):
    response = await browser_client.get("/views/admin/" + section, headers={"authorization": "Bearer admin-test"})
    assert response.status_code == 200
    assert 'id="main"' in response.text
    assert "Войти в кабинет" not in response.text


async def test_guest_cannot_load_private_fragment(browser_client):
    response = await browser_client.get("/views/lk", headers={"authorization": ""})
    assert "Тестовый выпускник" not in response.text
    assert "Вход для выпускников" in response.text


async def test_analytics_keeps_financial_and_engagement_sections(browser_client):
    response = await browser_client.get("/views/admin/analytics", headers={"authorization": "Bearer admin-test"})
    assert response.status_code == 200
    for text in ("2 500", "Программа в аналитике", "Встреча в аналитике", "Выпуск в аналитике", "80%", "Регистрация"):
        assert text in response.text.replace("\xa0", " ").replace("\u202f", " ")


async def test_member_fragment_and_cart(browser_client):
    response = await browser_client.get("/views/lk", headers={"authorization": "Bearer member-test"})
    assert response.status_code == 200
    assert "Тестовый выпускник" in response.text
    response = await browser_client.get("/views/cart", headers={"x-cart-session": "test-session"})
    assert "Сумка клуба" in response.text
    assert "contact_email" in response.text


async def test_editor_does_not_receive_full_admin_controls(browser_client):
    response = await browser_client.get("/views/admin/members", headers={"authorization": "Bearer editor-test"})
    assert response.status_code == 200
    assert "Обезличить" not in response.text
    assert 'href="/admin/support"' in response.text
    response = await browser_client.get("/views/admin/support", headers={"authorization": "Bearer editor-test"})
    assert "Переписку поддержки обрабатывает администратор" in response.text
    assert 'data-api="/admin/support/' not in response.text


async def test_html_is_escaped(browser_client):
    response = await browser_client.get("/news/news-one")
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in response.text
    assert "<script>alert(1)</script>" not in response.text


async def test_unknown_and_legacy_paths(browser_client):
    assert (await browser_client.get("/not-a-page")).status_code == 404
    response = await browser_client.get("/legacy/news?q=hello")
    assert response.status_code == 308
    assert response.headers["location"] == "/news?q=hello"


@pytest.mark.parametrize(
    "value",
    [
        "javascript:alert(1)",
        "//example.com/path",
        "https://user:pass@example.com",
        "data:text/html,x",
        "/\\evil.test",
        "/hello\nworld",
    ],
)
def test_unsafe_urls_are_rejected(value):
    assert not safe_url(value)


@pytest.mark.parametrize(
    "value",
    [
        "http://yoomoney.ru/pay",
        "https://yoomoney.ru:invalid/pay",
        "javascript:alert(1)",
        "https://user:pass@yoomoney.ru/pay",
    ],
)
def test_payment_urls_are_restricted(value):
    assert not payment_url(value)


def test_provider_https_redirect_is_preserved():
    assert payment_url("https://payments.example.test/confirmation") == "https://payments.example.test/confirmation"


@pytest.mark.parametrize(
    ("peer", "supplied", "expected"),
    [
        ("172.18.0.4", "spoof, 203.0.113.50", "203.0.113.50"),
        ("203.0.113.7", "198.51.100.2", "203.0.113.7"),
        ("127.0.0.1", "198.51.100.2", "127.0.0.1"),
        ("172.18.0.4", "invalid", None),
    ],
)
def test_web_forwards_ip_only_from_trusted_proxy(peer, supplied, expected):
    from starlette.requests import Request

    from club_web.client import forwarded_headers

    request = Request({"type": "http", "client": (peer, 1234), "headers": [(b"x-forwarded-for", supplied.encode())]})
    assert forwarded_headers(request).get("x-forwarded-for") == expected
