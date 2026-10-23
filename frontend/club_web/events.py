from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from club_web.calendar import google_calendar, instant
from club_web.formatting import MONTHS


def prepare_event(event, now=None):
    start = instant(event.get("starts_at"))
    valid = start.year >= 1900
    local = start.astimezone(ZoneInfo("Europe/Moscow")) if valid else None
    canceled = event.get("status") == "canceled"
    past = canceled or event.get("status") == "done" or valid and start < (now or datetime.now(UTC))
    return {
        **event,
        "past": past,
        "canceled": canceled,
        "start_day": local.strftime("%Y-%m-%d") if local else "",
        "day_number": str(local.day) if local else "–",
        "month_label": MONTHS[local.month - 1] if local else "Дата не указана",
        "time_label": local.strftime("%H:%M") if local else "",
        "starts_iso": start.isoformat() if valid else "",
        "calendar_url": google_calendar(event),
    }


def event_order(event):
    start = instant(event.get("starts_at"))
    if start.year < 1900:
        return 2, 0, event["id"]
    return int(bool(event["past"])), -start.timestamp() if event["past"] else start.timestamp(), event["id"]
