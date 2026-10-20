import re
from datetime import UTC, date, datetime
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from club_web.formatting import FORMAT_LABELS, MONTHS, rub

UPCOMING_LIMIT = 6
FILTER_FIELDS = ("direction", "format", "document", "enrollment")
MONTH_NAMES = (
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
)
SEARCH_ENDINGS = (
    r"(иями|ями|ами|ого|ему|ому|ыми|ими|ий|ый|ой|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ах|ях|ом|ем|ую|юю|а|я|ы|и|у|ю|е|о)$"
)


def search_terms(value):
    return [
        re.sub(SEARCH_ENDINGS, "", word) if len(word) > 4 else word
        for word in re.findall(r"[a-zа-я0-9]+", str(value).lower().replace("ё", "е"))
    ]


def text_values(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for part in value.values() for text in text_values(part)]
    if isinstance(value, list):
        return [text for part in value for text in text_values(part)]
    return []


def named_values(value, keys):
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [
        row if isinstance(row, str) else next((row.get(key) for key in keys if row.get(key)), "")
        for row in value or []
        if isinstance(row, (str, dict))
    ]


def filter_values(params, name):
    value = params.get(name) or []
    return list(dict.fromkeys(part for part in (value if isinstance(value, list) else [value]) if part))


def catalog_link(params, name=None, value=None):
    pairs = []
    for key, raw in params.items():
        for part in raw if isinstance(raw, list) else [raw]:
            if part and (key != name or value is not None and part != value):
                pairs.append((key, part))
    return "/dpo" + ("?" + urlencode(pairs) if pairs else "") + "#program-list"


def start_day(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return instant.astimezone(ZoneInfo("Europe/Moscow")).date() if instant.tzinfo else instant.date()
    except ValueError:
        match = re.fullmatch(r"\s*(\d{1,2})\s+([а-я]+)\s+(\d{4})(?:\s*г\.?)?\s*", value.casefold())
        if not match or match[2] not in MONTHS:
            return None
        try:
            return date(int(match[3]), MONTHS.index(match[2]) + 1, int(match[1]))
        except ValueError:
            return None


def prepare_catalog(items, params, today=None):
    today = today or datetime.now(UTC).astimezone(ZoneInfo("Europe/Moscow")).date()
    programs = []
    for item in items:
        start = (item.get("dates") or {}).get("start") or ""
        day = start_day(start)
        programs.append(
            {
                **item,
                "id": str(item.get("id") or item["slug"]),
                "document": item.get("document") or "",
                "price": item.get("price"),
                "start_label": start,
                "start_day": day.isoformat() if day else "",
                "price_label": rub(item["price"]) if item.get("price") is not None else "Стоимость уточняется",
                "format_label": FORMAT_LABELS.get(item.get("format"), item.get("format") or "Не указан"),
                "module_labels": named_values(item.get("modules"), ("title",)),
                "teacher_labels": named_values(item.get("teachers"), ("name", "fio")),
                "audience_labels": text_values(item.get("audience")),
                "search_terms": search_terms(
                    " ".join(
                        text_values(
                            {
                                key: item.get(key)
                                for key in (
                                    "title",
                                    "direction",
                                    "description",
                                    "tagline",
                                    "audience",
                                    "results",
                                    "modules",
                                    "teachers",
                                )
                            }
                        )
                    )
                ),
            }
        )
    for position, item in enumerate(sorted(programs, key=lambda row: (row.get("title", "").casefold(), row["slug"]))):
        item["title_order"] = position
        item["search_terms"] = sorted(set(item["search_terms"]))
    choices = {field: filter_values(params, field) for field in FILTER_FIELDS}
    words = search_terms(params.get("q", ""))
    selected = [
        item
        for item in programs
        if all(not values or item.get(field) in values for field, values in choices.items())
        and all(any(term.startswith(word) for term in item["search_terms"]) for word in words)
    ]
    order = params.get("sort", "title")
    selected.sort(
        key=lambda item: (
            (
                item.get("price") is None,
                (item.get("price") or 0) * (-1 if order == "price-desc" else 1),
                item["title_order"],
            )
            if order in ("price", "price-desc")
            else (not item["start_day"], item["start_day"], item["title_order"])
            if order == "start"
            else item["title_order"]
        )
    )
    upcoming = sorted(
        (item for item in programs if item["start_day"] >= today.isoformat() and item.get("enrollment") == "actual"),
        key=lambda item: (item["start_day"], item["title_order"]),
    )
    months = {}
    for item in upcoming:
        month = item["start_day"][:7]
        months.setdefault(
            month, {"key": month, "label": MONTH_NAMES[int(month[5:]) - 1] + " " + month[:4], "items": []}
        )["items"].append(item)
    public_fields = (
        "id",
        "slug",
        "title",
        "direction",
        "format_label",
        "duration",
        "document",
        "start_label",
        "price_label",
        "enrollment",
        "format",
        "price",
        "start_day",
        "module_labels",
        "teacher_labels",
        "audience_labels",
        "search_terms",
        "title_order",
    )
    labels = {"actual": "Набор открыт", "nonactual": "Набор закрыт", **FORMAT_LABELS}
    chips = [
        {"name": name, "value": value, "label": labels.get(value, value), "href": catalog_link(params, name, value)}
        for name, values in choices.items()
        for value in values
    ]
    if params.get("q"):
        chips.append(
            {"name": "q", "value": params["q"], "label": "Поиск: " + params["q"], "href": catalog_link(params, "q")}
        )
    return {
        "items": selected,
        "filters": {field: sorted({str(item.get(field) or "") for item in programs} - {""}) for field in FILTER_FIELDS},
        "catalog_selected": choices,
        "catalog_chips": chips,
        "catalog_reset": catalog_link(
            {key: value for key, value in params.items() if key not in (*FILTER_FIELDS, "q", "sort")}
        ),
        "catalog_total": len(programs),
        "catalog_search_endings": SEARCH_ENDINGS,
        "upcoming": upcoming[:UPCOMING_LIMIT],
        "upcoming_limit": UPCOMING_LIMIT,
        "start_months": list(months.values()),
        "program_data": [{key: item.get(key, "") for key in public_fields} for item in programs],
    }
