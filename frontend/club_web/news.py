from urllib.parse import urlsplit

from club_web.calendar import instant
from club_web.formatting import safe_url


def prepare_news(item, photos):
    source = safe_url(item.get("source_url"))
    host = urlsplit(source).hostname or ""
    source_name = host.removeprefix("www.") or "Источник"
    if host == "pravo.hse.ru":
        source_name = "Факультет права НИУ ВШЭ"
    elif host == "hse.ru" or host.endswith(".hse.ru"):
        source_name = "НИУ ВШЭ"
    published = instant(item.get("published_at"))
    return {
        **item,
        "source_href": source,
        "source_name": source_name,
        "photo": photos.get(source),
        "published_iso": published.isoformat() if published.year > 1 else "",
    }
