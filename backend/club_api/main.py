import logging
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import httpx
import psycopg
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from club_api.core.config import load_settings
from club_api.core.errors import ApiError
from club_api.core.http import SecurityMiddleware
from club_api.db.pool import Database
from club_api.db.store import Store
from club_api.domain import DOMAIN
from club_api.jobs.runner import Jobs
from club_api.modules.analytics.pageviews import ROUTE_LIMITS as ANALYTICS_LIMITS
from club_api.modules.analytics.pageviews import router as analytics_router
from club_api.modules.auth.routes import ROUTE_LIMITS
from club_api.modules.auth.routes import router as auth_router
from club_api.modules.auth.service import AuthService
from club_api.modules.catalog.sync import ROUTE_LIMITS as SYNC_LIMITS
from club_api.modules.catalog.sync import router as sync_router
from club_api.modules.checkout.admin import router as admin_orders_router
from club_api.modules.checkout.cart import ROUTE_LIMITS as CART_LIMITS
from club_api.modules.checkout.cart import router as cart_router
from club_api.modules.checkout.orders import ROUTE_LIMITS as ORDER_LIMITS
from club_api.modules.checkout.orders import router as order_router
from club_api.modules.checkout.payments import ROUTE_LIMITS as PAYMENT_LIMITS
from club_api.modules.checkout.payments import Payments
from club_api.modules.checkout.payments import router as payment_router
from club_api.modules.checkout.store import Checkout
from club_api.modules.content.admin import router as admin_content_router
from club_api.modules.content.routes import router as content_router
from club_api.modules.events.routes import ROUTE_LIMITS as EVENT_LIMITS
from club_api.modules.events.routes import router as events_router
from club_api.modules.gamification.routes import router as points_router
from club_api.modules.gamification.service import Gamification
from club_api.modules.media.routes import ROUTE_LIMITS as MEDIA_LIMITS
from club_api.modules.media.routes import router as media_router
from club_api.modules.media.service import Media
from club_api.modules.members.admin import router as admin_members_router
from club_api.modules.members.community import ROUTE_LIMITS as COMMUNITY_LIMITS
from club_api.modules.members.community import router as community_router
from club_api.modules.members.profile import ROUTE_LIMITS as PROFILE_LIMITS
from club_api.modules.members.profile import router as profile_router
from club_api.modules.news.routes import ROUTE_LIMITS as NEWS_LIMITS
from club_api.modules.news.routes import router as news_router
from club_api.modules.notifications.mail import Notifications
from club_api.modules.notifications.push import ROUTE_LIMITS as PUSH_LIMITS
from club_api.modules.notifications.push import Push
from club_api.modules.notifications.push import router as push_router
from club_api.modules.office.routes import ROUTE_LIMITS as OFFICE_LIMITS
from club_api.modules.office.routes import router as office_router
from club_api.modules.podcasts.routes import ROUTE_LIMITS as PODCAST_LIMITS
from club_api.modules.podcasts.routes import router as podcast_router
from club_api.modules.support.routes import ROUTE_LIMITS as SUPPORT_LIMITS
from club_api.modules.support.routes import router as support_router
from club_api.modules.telegram.bot import Telegram
from club_api.modules.telegram.routes import ROUTE_LIMITS as TELEGRAM_LIMITS
from club_api.modules.telegram.routes import router as telegram_router
from club_api.observability.health import build_health

logger = logging.getLogger("club.api")


def create_app(settings=None):
    settings = settings or load_settings()
    if errors := settings.production_errors():
        raise RuntimeError("; ".join(errors))
    database = Database(settings)

    @asynccontextmanager
    async def lifespan(app):
        await database.open()
        try:
            if database.pool:
                await database.execute("DELETE FROM club_auth_revocations WHERE expires_at <= now()")
            async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
                app.state.client = client
                app.state.notifications = Notifications(settings, database, client)
                await app.state.jobs.start()
                try:
                    yield
                finally:
                    await app.state.jobs.stop()
        finally:
            await app.state.media.close()
            await database.close()

    app = FastAPI(
        title="Club API",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        redirect_slashes=False,
        telemetry={
            "tracing": False,
            "metrics": False,
            "logs": False,
            "operation_spans": False,
            "auto_configure": False,
        },
    )
    app.state.settings = settings
    app.state.database = database
    app.state.store = Store(database)
    app.state.auth = AuthService(settings, database, app.state.store)
    app.state.domain = DOMAIN
    app.state.started_at = time.monotonic()
    app.state.checkout = Checkout(app.state)
    app.state.payments = Payments(app.state)
    app.state.gamification = Gamification(app.state)
    app.state.push = Push(app.state)
    app.state.media = Media(app.state)
    app.state.telegram = Telegram(app.state)
    app.state.jobs = Jobs(app.state)
    app.include_router(auth_router)
    app.include_router(content_router)
    app.include_router(cart_router)
    app.include_router(order_router)
    app.include_router(payment_router)
    app.include_router(push_router)
    app.include_router(points_router)
    app.include_router(profile_router)
    app.include_router(community_router)
    app.include_router(events_router)
    app.include_router(admin_members_router)
    app.include_router(admin_orders_router)
    app.include_router(admin_content_router)
    app.include_router(media_router)
    app.include_router(support_router)
    app.include_router(podcast_router)
    app.include_router(office_router)
    app.include_router(analytics_router)
    app.include_router(sync_router)
    app.include_router(news_router)
    app.include_router(telegram_router)

    @app.exception_handler(ApiError)
    async def api_error(_request, exception):
        return JSONResponse({"error": exception.message}, status_code=exception.status)

    @app.exception_handler(RequestValidationError)
    async def invalid_data(_request, _exception):
        return JSONResponse({"error": "Некорректные данные"}, status_code=400)

    @app.exception_handler(psycopg.Error)
    async def database_error(_request, exception):
        code = exception.sqlstate
        logger.error("Ошибка запроса к базе данных: %s", code or "connection")
        if code == "23505":
            return JSONResponse({"error": "Такая запись уже существует"}, status_code=409)
        if code == "23503":
            return JSONResponse({"error": "Запись связана с другими данными"}, status_code=409)
        from club_api.observability.errors import capture

        capture("database_failed")
        return JSONResponse({"error": "Не удалось сохранить или получить данные. Попробуйте позже"}, status_code=500)

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "club-api", "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z")}

    @app.get("/ready")
    async def ready():
        report = await build_health(app.state)
        ready = all(check["status"] == "ok" for check in report["checks"] if check["id"] in ("storage", "database"))
        return JSONResponse({"status": "ok" if ready else "degraded"}, status_code=200 if ready else 503)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://web.telegram.org",
            "https://oauth.telegram.org",
            *[value.strip() for value in settings.CORS_ORIGINS.split(",") if value.strip()],
        ],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["*"],
    )
    app.add_middleware(
        SecurityMiddleware,
        settings=settings,
        route_limits={
            **ROUTE_LIMITS,
            **CART_LIMITS,
            **ORDER_LIMITS,
            **PAYMENT_LIMITS,
            **PUSH_LIMITS,
            **PROFILE_LIMITS,
            **COMMUNITY_LIMITS,
            **EVENT_LIMITS,
            **MEDIA_LIMITS,
            **SUPPORT_LIMITS,
            **PODCAST_LIMITS,
            **OFFICE_LIMITS,
            **ANALYTICS_LIMITS,
            **SYNC_LIMITS,
            **NEWS_LIMITS,
            **TELEGRAM_LIMITS,
        },
    )
    return app


def run():
    import uvicorn

    settings = load_settings()
    from club_api.observability.errors import initialize

    initialize(settings)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    uvicorn.run(
        create_app(settings),
        host=settings.API_HOST,
        port=settings.API_PORT,
        workers=1,
        proxy_headers=False,
        access_log=False,
    )


if __name__ == "__main__":
    run()
