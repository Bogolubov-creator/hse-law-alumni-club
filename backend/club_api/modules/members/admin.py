from collections import Counter
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import Field

from club_api.core.errors import ApiError
from club_api.core.models import count, group_count, guid, query_choice, query_page, query_search, sub_active
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin, require_full_admin
from club_api.modules.members.service import alumni_email, anonymize
from club_api.observability.audit import audit

router = APIRouter()
MEMBER_FIELDS = (
    "id",
    "user_id",
    "fio",
    "cohort",
    "status",
    "verification_status",
    "points_cached",
    "level_cached",
    "personal_discount",
    "podcast_sub_until",
    "edu_level",
    "edu_program",
    "interests_json",
    "contacts_json",
    "joined_at",
    "avatar",
)


class MemberPatch(Body):
    verification_status: Literal["pending", "verified", "rejected"] = None
    personal_discount: int = Field(default=None, ge=0, le=10)


class PointsBody(Body):
    reason: Literal["program", "event", "referral", "mentorship", "manual"] = "manual"
    delta: int = Field(ge=-2000, le=2000)
    comment: str = None


@router.get("/admin/members")
async def members(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    store = request.app.state.store
    page, limit = query_page(request)
    status = query_choice(request, "status", ("pending", "verified", "rejected"))
    search, filters = query_search(request), []
    if status:
        filters.append({"verification_status": {"_eq": status}})
    if search:
        filters.append({"_or": [{field: {"_icontains": search}} for field in ("fio", "cohort", "edu_program")]})
    where = {"_and": filters} if filters else None
    rows = await store.read(
        "alumni",
        filters=where,
        fields=MEMBER_FIELDS,
        sort=("-points_cached", "id"),
        limit=limit,
        offset=(page - 1) * limit,
    )
    ids = [row["id"] for row in rows]
    fios = list({row["fio"] for row in rows if row["fio"]})
    links = (
        await store.read(
            "alumni_friends",
            filters={"status": {"_eq": "accepted"}, "_or": [{"alumni_id": {"_in": ids}}, {"friend_id": {"_in": ids}}]},
            fields=("alumni_id", "friend_id"),
            limit=-1,
        )
        if ids
        else []
    )
    friends = Counter(member for link in links for member in link.values())
    groups = (
        await group_count(store, "alumni", ("fio", "cohort"), {"fio": {"_in": fios}, "status": {"_neq": "alumni_left"}})
        if fios
        else []
    )

    def duplicate_key(row):
        return ((row["fio"] or "").strip().lower(), row["cohort"] or "")

    duplicates = Counter()
    for row in groups:
        duplicates[duplicate_key(row)] += row["count"]
    users = [row["user_id"] for row in rows if row["user_id"]]
    emails = (
        {
            row["id"]: row["email"]
            for row in await store.read(
                "directus_users", filters={"id": {"_in": users}}, fields=("id", "email"), limit=-1
            )
        }
        if users
        else {}
    )
    return {
        "items": [
            {
                **row,
                "email": emails.get(row["user_id"]) or (row["contacts_json"] or {}).get("email") or None,
                "friends_count": friends[row["id"]],
                "podcast_active": sub_active(row["podcast_sub_until"]),
                "duplicate": duplicates[duplicate_key(row)] > 1,
            }
            for row in rows
        ],
        "total": await count(store, "alumni", where),
        "page": page,
        "page_size": limit,
    }


@router.post("/admin/members/{id}/podcast-sub")
async def grant_subscription(request: Request, id: str, admin: Annotated[dict, Depends(require_full_admin)]):
    until = await request.app.state.payments.extend_subscription(guid(id))
    await audit(
        request, "podcast.sub.grant", actor="admin:" + admin["userId"], subject="alumni:" + id, detail={"until": until}
    )
    return {"ok": True, "until": until}


async def notify_verification(state, id, status):
    email = await alumni_email(state, id)
    if not email:
        return
    if status == "verified":
        subject = "Кабинет выпускника активирован 🎓"
        text = (
            "Учебный офис подтвердил ваш выпуск – личный кабинет клуба активирован.\n\nВойти: "
            + state.settings.PUBLIC_URL
            + "/lk\n\n– Клуб выпускников факультета права Вышки"
        )
    else:
        subject = "По вашей заявке на вступление"
        text = "Учебный офис не смог подтвердить данные вашей заявки. Если считаете это ошибкой – ответьте на письмо или свяжитесь с офисом.\n\n– Клуб выпускников факультета права Вышки"
    await state.notifications.send_email(email, subject, text)


@router.patch("/admin/members/{id}")
async def patch_member(
    request: Request,
    id: str,
    body: MemberPatch,
    tasks: BackgroundTasks,
    admin: Annotated[dict, Depends(require_full_admin)],
):
    state, id = request.app.state, guid(id)
    data = body.model_dump(exclude_unset=True)
    patch = {**data}
    if data.get("verification_status") == "verified":
        patch["verified_at"] = datetime.now(UTC)
    row = await state.store.update("alumni", patch, id=id)
    await audit(request, "member.patch", actor="admin:" + admin["userId"], subject="alumni:" + id, detail=data)
    if data.get("verification_status") in ("verified", "rejected"):
        tasks.add_task(notify_verification, state, id, data["verification_status"])
    if data.get("verification_status") == "verified" and row.get("referred_by"):
        await state.gamification.add(
            row["referred_by"],
            reason="referral",
            ref=id,
            comment="Приглашённый выпускник верифицирован",
            idempotency_key="referral-" + id,
        )
    return {"ok": True}


@router.post("/admin/members/{id}/points")
async def points(request: Request, id: str, body: PointsBody, admin: Annotated[dict, Depends(require_full_admin)]):
    result = await request.app.state.gamification.add(
        guid(id), reason=body.reason, delta=body.delta, comment=body.comment or "Ручное начисление офисом"
    )
    await audit(
        request, "member.points", actor="admin:" + admin["userId"], subject="alumni:" + id, detail=body.model_dump()
    )
    return {"ok": True, **result}


@router.post("/admin/members/{id}/anonymize")
async def erase(request: Request, id: str, admin: Annotated[dict, Depends(require_full_admin)]):
    if not await anonymize(request.app.state, guid(id)):
        raise ApiError(404, "Участник не найден")
    await audit(request, "admin.member.anonymize", actor="admin:" + admin["userId"], subject="alumni:" + id)
    return {"ok": True}
