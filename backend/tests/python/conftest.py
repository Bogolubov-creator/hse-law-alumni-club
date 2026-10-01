import os
from urllib.parse import urlsplit

import pytest
import pytest_asyncio

from club_api.core.config import Settings
from club_api.main import create_app


@pytest_asyncio.fixture
async def database_app(tmp_path):
    url = os.environ.get("CLUB_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Нужен одноразовый PostgreSQL из test-django-integration.sh")
    if urlsplit(url).path != "/django_migration_test" or urlsplit(url).hostname not in ("127.0.0.1", "localhost"):
        raise RuntimeError("Интеграционные тесты разрешены только в локальной временной БД")
    settings = Settings(
        AUTH_SECRET="synthetic-session-secret-for-tests-only",
        ADMIN_AUTH_SECRET="synthetic-independent-admin-secret-for-tests",
        CHECKOUT_DATABASE_URL=url,
        UPLOADS_PATH=tmp_path,
        JOBS_ENABLED="false",
    )
    app = create_app(settings)
    async with app.lifespan(app):
        yield app
        await app.state.database.execute(
            "TRUNCATE directus_roles,directus_users,directus_files,alumni,programs,products,news,orders,carts,events,podcasts,podcast_plays,timeline_items,pages,points_ledger,levels,point_rules,achievements,club_settings,club_support_tickets,club_faq_events,club_auth_revocations,club_mail_outbox,club_checkout_commits CASCADE"
        )
