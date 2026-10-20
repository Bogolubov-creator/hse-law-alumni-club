from datetime import date

import pytest

from club_web.catalog import prepare_catalog, start_day


def test_multiple_filters_union_within_group_and_intersection_between_groups():
    rows = [
        {"slug": str(i), "title": f"Курс {i}", "format": format, "document": document, "direction": "Финансы, налоги"}
        for i, (format, document) in enumerate(
            [("online", "Диплом"), ("offline", "Диплом"), ("blended", "Диплом"), ("online", "Удостоверение")]
        )
    ]
    params = {
        "format": ["online", "offline", "online", ""],
        "document": ["Диплом"],
        "direction": ["Финансы, налоги"],
        "compare": "0,1",
    }
    data = prepare_catalog(rows, params)
    assert [row["slug"] for row in data["items"]] == ["0", "1"]
    assert data["catalog_selected"]["format"] == ["online", "offline"]
    assert len(data["catalog_chips"]) == 4
    assert "compare=0%2C1" in data["catalog_reset"]
    assert "format=offline" in data["catalog_chips"][1]["href"]
    assert "format=online" not in data["catalog_chips"][1]["href"]
    assert len(prepare_catalog(rows, {"format": [""]})["items"]) == 4


def test_search_uses_modules_teachers_and_russian_endings_without_exposing_other_fields():
    rows = [
        {
            "slug": "tax",
            "title": "Практика",
            "modules": [{"title": "Налоговые проверки"}],
            "teachers": [{"name": "Анна Семёнова", "role": "Адвокат"}],
            "audience": ["Руководителям"],
            "internal_note": "Скрыто",
        }
    ]
    for query in ("налог проверка", "семенова", "руководителям", "Адвокат"):
        data = prepare_catalog(rows, {"q": query})
        assert len(data["items"]) == 1
    assert not prepare_catalog(rows, {"q": "налог музыка"})["items"]
    assert not prepare_catalog(rows, {"q": "Скрыто"})["items"]
    public = data["program_data"][0]
    assert public["teacher_labels"] == ["Анна Семёнова"]
    assert public["module_labels"] == ["Налоговые проверки"]
    assert "internal_note" not in public
    assert public["price"] is None or public["price"] == ""


def test_calendar_contains_all_exact_future_dates_and_start_sort_keeps_unknown_last():
    rows = [
        {
            "slug": str(i),
            "title": f"Курс {i}",
            "price": None,
            "dates": {"start": f"2027-01-{i + 1:02}"},
            "enrollment": "actual",
        }
        for i in range(9)
    ]
    rows += [
        {"slug": "unknown", "title": "Без даты", "dates": {"start": "Январь 2027"}, "enrollment": "actual"},
        {"slug": "closed", "title": "Закрытый набор", "dates": {"start": "2026-12-20"}, "enrollment": "nonactual"},
    ]
    data = prepare_catalog(rows, {"sort": "start"}, date(2026, 10, 20))
    assert len(data["upcoming"]) == 6
    assert len(data["start_months"]) == 1
    assert data["start_months"][0]["label"] == "Январь 2027"
    assert len(data["start_months"][0]["items"]) == 9
    assert data["items"][-1]["slug"] == "unknown"
    assert data["items"][0]["slug"] == "closed"
    assert data["program_data"][0]["price_label"] == "Стоимость уточняется"


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


def test_organizer_filter_preserves_external_identity_without_a_source_link():
    rows = [
        {"slug": "club", "title": "Клуб"},
        {"slug": "hse-link", "title": "Факультет", "source_url": "https://www.hse.ru/edu/dpo/1"},
        {"slug": "hse-id", "title": "Факультет без ссылки", "hse_id": "2"},
    ]
    data = prepare_catalog(rows, {"organizer": ["hse"]})
    assert {row["slug"] for row in data["items"]} == {"hse-link", "hse-id"}
    assert data["catalog_chips"][0]["label"] == "Факультет права НИУ ВШЭ"
    assert data["filters"]["organizer"] == ["club", "hse"]
    assert prepare_catalog(rows, {"organizer": ["club"]})["items"][0]["slug"] == "club"
    assert len(prepare_catalog(rows, {"organizer": ["club", "hse"]})["items"]) == 3
