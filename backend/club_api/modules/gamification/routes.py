from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from club_api.core.errors import ApiError
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_alumni
from club_api.observability.audit import audit

router = APIRouter()


class PointsBody(Body):
    alumni_id: str
    reason: Literal["program", "event", "referral", "mentorship", "order", "decay", "manual", "achievement"]
    delta: int | None = None
    ref: str | None = None
    comment: str | None = None
    idempotency_key: str | None = None


async def verified_alumni(request: Request):
    alumni = await require_alumni(request)
    if alumni["verification_status"] != "verified":
        raise ApiError(403, "Доступно после верификации")
    return alumni


@router.post("/points")
async def points(request: Request, body: PointsBody):
    state = request.app.state
    if not state.auth.service_token(request):
        raise ApiError(401, "Требуется сервисный токен")
    try:
        UUID(body.alumni_id)
    except ValueError as error:
        raise ApiError(400, "Некорректный участник") from error
    result = await state.gamification.add(**body.model_dump())
    await audit(
        request,
        "points.service",
        actor="service",
        subject="alumni:" + body.alumni_id,
        detail={"reason": body.reason, "delta": body.delta},
    )
    return {"ok": True, **result}


@router.post("/decay/run")
async def decay(request: Request):
    if not request.app.state.auth.service_token(request):
        raise ApiError(401, "Требуется сервисный токен")
    return await request.app.state.gamification.decay()


@router.get("/me/ledger")
async def ledger(request: Request, alumni: Annotated[dict, Depends(verified_alumni)]):
    return await request.app.state.store.read(
        "points_ledger",
        filters={"alumni_id": {"_eq": alumni["id"]}},
        fields=("id", "delta", "reason", "ref", "comment", "created_at"),
        sort=("-created_at",),
        limit=50,
    )
