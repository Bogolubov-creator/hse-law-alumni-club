import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import Field

from club_api.modules.auth.routes import Body

router = APIRouter()
logger = logging.getLogger("club.analytics")
ROUTE_LIMITS = {("POST", "/analytics/pageview"): 60}
ALLOWED = [
    r"/",
    r"/(?:dpo|merch|news|events)(?:/[\w.-]+)?",
    r"/(?:podcasts|cart|join|forgot|reset|confirm|privacy|confidential|requisites)",
    r"/lk(?:/profile)?",
    r"/support(?:/consent)?",
]


def normalize_page_path(value):
    if not isinstance(value, str):
        return None
    path = re.split(r"[?#]", value.strip())[0]
    if not path.startswith("/") or len(path) > 120:
        return None
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    for prefix in ("/legacy", "/v2"):
        if path.startswith(prefix):
            path = path[len(prefix) :] or "/"
    return path if any(re.fullmatch(pattern, path, re.ASCII) for pattern in ALLOWED) else None


class PageViewBody(Body):
    path: str = Field(min_length=1, max_length=200)


@router.post("/analytics/pageview")
async def pageview(request: Request, body: PageViewBody):
    state, path = request.app.state, normalize_page_path(body.path)
    if path and state.database.pool:
        try:
            await state.database.execute(
                "INSERT INTO club_page_views(day,path,hits) VALUES(%s,%s,1) ON CONFLICT(day,path) DO UPDATE SET hits=club_page_views.hits+1",
                (datetime.now(UTC).date(), path),
            )
        except Exception:
            logger.warning("Не удалось записать счётчик страницы")
    return {"ok": True}


async def pageview_stats(state, since):
    result = {"hits": None, "by_day": [], "paths_top": []}
    if not state.database.pool:
        return result
    day = since.date()
    try:
        rows = await state.database.rows(
            "SELECT COALESCE(sum(hits),0)::int AS hits FROM club_page_views WHERE day>=%s", (day,)
        )
        result["hits"] = rows[0]["hits"]
        result["by_day"] = await state.database.rows(
            "SELECT day::text AS day,sum(hits)::int AS count FROM club_page_views WHERE day>=%s GROUP BY day ORDER BY day",
            (day,),
        )
        result["paths_top"] = await state.database.rows(
            "SELECT path,sum(hits)::int AS count FROM club_page_views WHERE day>=%s GROUP BY path ORDER BY count DESC LIMIT 12",
            (day,),
        )
    except Exception:
        logger.warning("Не удалось получить счётчики страниц")
    return result
