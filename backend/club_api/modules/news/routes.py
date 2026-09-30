import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field, field_validator

from club_api.core.errors import ApiError
from club_api.db.store import normalize
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin
from club_api.modules.news.sources import SOURCES, import_candidate, refresh_source
from club_api.observability.audit import audit

router = APIRouter()
ROUTE_LIMITS = {("POST", "/admin/news-sources/{source}/refresh"): 6}


class ImportBody(Body):
    title: str = Field(min_length=3, max_length=240)
    excerpt: str = Field(default="", max_length=2000)

    @field_validator("title", "excerpt", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


class StateBody(Body):
    state: Literal["new", "dismissed"]


def candidate_id(value):
    if not re.fullmatch(r"[a-f0-9]{64}", value):
        raise ApiError(400, "Некорректный идентификатор")
    return value


@router.get("/admin/news-sources")
async def sources(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    state = request.app.state
    runs = await state.database.rows("SELECT * FROM club_news_source_runs")
    by_source = {row["source"]: row for row in runs}
    items = await state.database.rows(
        "SELECT * FROM club_news_inbox ORDER BY published_at DESC NULLS LAST,discovered_at DESC LIMIT 200"
    )
    return normalize(
        {
            "automatic": state.settings.NEWS_SYNC_ENABLED == "true",
            "sources": [{**source, **by_source.get(source["id"], {})} for source in SOURCES],
            "items": items,
        }
    )


@router.post("/admin/news-sources/{source}/refresh")
async def refresh(request: Request, source: str, admin: Annotated[dict, Depends(require_admin)]):
    result = await refresh_source(request.app.state, source)
    await audit(request, "news.source.refresh", actor="admin:" + admin["userId"], subject=source, detail=result)
    return result


@router.post("/admin/news-sources/{id}/import")
async def import_news(request: Request, id: str, body: ImportBody, admin: Annotated[dict, Depends(require_admin)]):
    result = await import_candidate(request.app.state, candidate_id(id), body.title, body.excerpt)
    await audit(request, "news.source.import", actor="admin:" + admin["userId"], subject="news:" + result["id"])
    return result


@router.patch("/admin/news-sources/{id}")
async def patch(request: Request, id: str, body: StateBody, _admin: Annotated[dict, Depends(require_admin)]):
    await request.app.state.database.execute(
        "UPDATE club_news_inbox SET state=%s WHERE id=%s AND state<>'imported'", (body.state, candidate_id(id))
    )
    return {"ok": True}
