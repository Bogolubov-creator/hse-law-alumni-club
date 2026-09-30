import logging

import sentry_sdk

client = None
CODES = {"request_failed", "database_failed", "job_failed"}


def scrub_event(event, _hint):
    message = event.get("message")
    if message not in CODES:
        return None
    return {
        "event_id": event.get("event_id"),
        "timestamp": event.get("timestamp"),
        "level": "error",
        "message": message,
        "platform": "python",
    }


def initialize(settings):
    global client
    if not settings.secret("SENTRY_DSN"):
        return
    try:
        client = sentry_sdk.Client(
            dsn=settings.secret("SENTRY_DSN"),
            environment=settings.APP_ENV,
            default_integrations=False,
            auto_enabling_integrations=False,
            send_default_pii=False,
            traces_sample_rate=0,
            auto_session_tracking=False,
            before_send=scrub_event,
        )
    except Exception:
        logging.getLogger("club.api").warning("Не удалось включить мониторинг ошибок")


def capture(code):
    if client and code in CODES:
        client.capture_event({"level": "error", "message": code})
