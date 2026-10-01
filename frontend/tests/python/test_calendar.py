from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

from club_web.calendar import calendar_file, google_calendar, month_view


def test_calendar_links_preserve_timezones_and_escape_content():
    event = {
        "id": "event-qa",
        "title": "Право, практика; " + "ю" * 120,
        "description": "Первая\nВторая",
        "starts_at": "2024-02-29T19:30:00+03:00",
        "location": "Москва",
        "format": "offline",
    }
    fields = parse_qs(urlsplit(google_calendar(event)).query)
    assert fields["dates"] == ["20240229T163000Z/20240229T183000Z"]
    document = calendar_file(event, "https://example.test/club", datetime(2024, 1, 1, tzinfo=UTC))
    assert "DTSTART:20240229T163000Z" in document
    assert "DTEND:20240229T183000Z" in document
    assert "SUMMARY:Право\\, практика\\;" in document
    assert "Первая\\nВторая" in document
    assert all(len(line.encode()) <= 75 for line in document.split("\r\n"))
    assert "URL:https://example.test/club/events/event-qa" in document


def test_month_grid_includes_leap_day_and_moscow_midnight():
    events = [{"id": "late", "title": "Встреча", "starts_at": "2024-02-28T22:00:00Z"}]
    month = month_view(events, "2024-02")
    days = [cell for week in month["weeks"] for cell in week if cell["day"]]
    assert len(days) == 29
    assert days[-1]["events"] == events
    assert month["previous"] == "2024-01" and month["next"] == "2024-03"
    default = month_view(events, "../wrong", datetime(2024, 12, 1, tzinfo=UTC))
    assert default["selected"] == "2024-12" and default["next"] == "2025-01"
