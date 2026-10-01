from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import Field

from club_api.core.errors import ApiError
from club_api.core.models import count, query_choice
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin, require_full_admin
from club_api.modules.checkout.admin import csv_response
from club_api.modules.office.analytics import analytics, analytics_rows, overview
from club_api.observability.audit import audit
from club_api.observability.health import build_health

router = APIRouter()
ROUTE_LIMITS = {"/admin/system-health": 12, ("POST", "/admin/push/broadcast"): 5}


class BroadcastBody(Body):
    title: str = Field(min_length=3, max_length=80)
    body: str = Field(min_length=3, max_length=200)
    url: str = Field(default="/", max_length=200, pattern=r"^/[a-zA-Z0-9/-]*$")


@router.get("/admin/system-health")
async def health(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    return await build_health(request.app.state)


@router.get("/admin/overview")
async def summary(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    return await overview(request.app.state)


@router.get("/admin/analytics")
async def report(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    return await analytics(request.app.state, query_choice(request, "range", ("7d", "30d", "90d")) or "30d")


@router.get("/admin/analytics/export.csv")
async def export(request: Request, admin: Annotated[dict, Depends(require_admin)]):
    range = query_choice(request, "range", ("7d", "30d", "90d")) or "30d"
    data = await analytics(request.app.state, range)
    await audit(request, "analytics.export", actor="admin:" + admin["userId"], detail={"range": range})
    return csv_response(analytics_rows(data), "analytics-" + range)


@router.post("/admin/push/broadcast")
async def broadcast(
    request: Request, body: BroadcastBody, tasks: BackgroundTasks, admin: Annotated[dict, Depends(require_full_admin)]
):
    subscribers = await count(request.app.state.store, "push_subs")
    tasks.add_task(request.app.state.push.to_all, body.model_dump())
    await audit(
        request, "push.broadcast", actor="admin:" + admin["userId"], detail={"title": body.title, "subs": subscribers}
    )
    return {"ok": True, "subscribers": subscribers}


@router.get("/admin/audit")
async def audit_rows(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    try:
        limit = int(request.query_params.get("limit", "300"))
        if not 1 <= limit <= 500:
            raise ValueError
    except ValueError:
        raise ApiError(400, "Некорректный размер списка") from None
    return await request.app.state.store.read(
        "audit_log",
        sort=("-created_at",),
        fields=("id", "event", "actor", "subject", "detail", "ip", "created_at"),
        limit=limit,
    )
