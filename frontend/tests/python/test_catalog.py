from datetime import date

import pytest

from club_web.catalog import prepare_catalog, start_day


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("24 октября 2026 г.", date(2026, 10, 24)),
        ("2026-10-19T23:30:00Z", date(2026, 10, 20)),
        ("2026-10-20", date(2026, 10, 20)),
        ("октябрь 2026", None),
        ("31 февраля 2026", None),
        (None, None),
    ],
)
def test_start_date_precision_and_moscow_boundary(raw, expected):
    assert start_day(raw) == expected


def test_catalog_filters_and_upcoming_do_not_invent_dates():
    base = {"title": "Курс", "direction": "Право", "format": "online", "document": "Диплом", "price": 10000}
    rows = [
        {**base, "slug": str(index), "enrollment": state, "dates": {"start": start}}
        for index, (start, state) in enumerate(
            [
                ("19 октября 2026", "actual"),
                ("24 октября 2026", "actual"),
                ("20 октября 2026", "actual"),
                ("21 октября 2026", "nonactual"),
                ("октябрь 2026", "actual"),
            ]
        )
    ]
    data = prepare_catalog(rows, {"document": "Удостоверение"}, date(2026, 10, 20))
    assert data["items"] == []
    assert [item["slug"] for item in data["upcoming"]] == ["2", "1"]
    assert data["filters"]["document"] == ["Диплом"]
    assert data["program_data"][1]["price_label"] == "100 ₽"
    assert not any("dates" in row for row in data["program_data"])
