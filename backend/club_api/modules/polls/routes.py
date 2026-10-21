from datetime import UTC, datetime
from uuid import uuid4

from django.http import HttpRequest
from pydantic import Field, field_validator

from club_api.core.errors import ApiError
from club_api.core.models import count, group_count, guid, query_page
from club_api.core.views import api_view, parse_body
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_alumni, require_full_admin
from club_api.observability.audit import audit

MAX_OPTIONS = 10
MAX_QUESTION_LENGTH = 240
MAX_OPTION_LENGTH = 160
ROUTE_LIMITS = {("POST", "/me/polls/{id}/vote"): 20, ("POST", "/admin/polls"): 20}
POLL_FIELDS = ("id", "question", "options_json", "status", "created_at", "opened_at", "closed_at")


class PollBody(Body):
    question: str = Field(min_length=3, max_length=MAX_QUESTION_LENGTH)
    options: list[str] = Field(min_length=2, max_length=MAX_OPTIONS)

    @field_validator("question")
    @classmethod
    def question_text(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Введите вопрос")
        return value

    @field_validator("options")
    @classmethod
    def option_texts(cls, values):
        labels = [value.strip() for value in values]
        if any(not label or len(label) > MAX_OPTION_LENGTH for label in labels):
            raise ValueError("Варианты должны содержать от 1 до 160 символов")
        if len({label.casefold().replace("ё", "е") for label in labels}) != len(labels):
            raise ValueError("Варианты должны различаться")
        return labels


class VoteBody(Body):
    option_id: str

    @field_validator("option_id")
    @classmethod
    def option_uuid(cls, value):
        return guid(value)


def public_poll(row):
    return {**{key: row[key] for key in POLL_FIELDS if key != "options_json"}, "options": row["options_json"]}


async def locked_poll(state, connection, identifier):
    row = await (await connection.execute("SELECT id FROM club_polls WHERE id=%s FOR UPDATE", (identifier,))).fetchone()
    if not row:
        raise ApiError(404, "Опрос не найден")
    return await state.store.one("club_polls", identifier, fields=POLL_FIELDS, connection=connection)


@api_view(permission=require_full_admin)
async def admin_polls(request: HttpRequest):
    await require_full_admin(request)
    store = request.services.store
    page, limit = query_page(request, default_limit=20)
    rows = await store.read("club_polls", fields=POLL_FIELDS, sort=("-created_at", "id"), limit=limit, page=page)
    groups = (
        await group_count(
            store, "club_poll_votes", ("poll_id", "option_id"), {"poll_id": {"_in": [row["id"] for row in rows]}}
        )
        if rows
        else []
    )
    counts = {(row["poll_id"], row["option_id"]): row["count"] for row in groups}
    result = []
    for row in rows:
        total = sum(counts.get((row["id"], option["id"]), 0) for option in row["options_json"])
        options = []
        for option in row["options_json"]:
            votes = counts.get((row["id"], option["id"]), 0)
            options.append({**option, "count": votes, "percent": round(100 * votes / total, 1) if total else 0.0})
        result.append({**public_poll(row), "options": options, "total_votes": total})
    return {"items": result, "total": await count(store, "club_polls"), "page": page, "limit": limit}


@api_view(body=PollBody, permission=require_full_admin)
async def create_poll(request: HttpRequest):
    admin = await require_full_admin(request)
    body = parse_body(request, PollBody)
    row = await request.services.store.create(
        "club_polls",
        {
            "question": body.question,
            "options_json": [{"id": str(uuid4()), "label": label} for label in body.options],
            "status": "draft",
        },
    )
    await audit(request, "poll.create", actor="admin:" + admin["userId"], subject="poll:" + row["id"])
    return public_poll(row)


async def transition(request, identifier, expected, target):
    admin = await require_full_admin(request)
    state, identifier = request.services, guid(identifier)
    async with state.database.transaction() as connection:
        poll = await locked_poll(state, connection, identifier)
        if poll["status"] == target:
            return {"ok": True}
        if poll["status"] != expected:
            raise ApiError(409, "Запустить можно только черновик, закрыть – только действующий опрос")
        await state.store.update(
            "club_polls",
            {"status": target, "opened_at" if target == "active" else "closed_at": datetime.now(UTC)},
            id=identifier,
            connection=connection,
        )
    await audit(request, "poll." + target, actor="admin:" + admin["userId"], subject="poll:" + identifier)
    return {"ok": True}


@api_view(permission=require_full_admin)
async def launch_poll(request: HttpRequest, id: str):
    return await transition(request, id, "draft", "active")


@api_view(permission=require_full_admin)
async def close_poll(request: HttpRequest, id: str):
    return await transition(request, id, "active", "closed")


@api_view(permission=require_alumni)
async def member_polls(request: HttpRequest):
    alumni = await require_alumni(request)
    store = request.services.store
    page, limit = query_page(request, default_limit=20)
    filters = {"status": {"_in": ["active", "closed"]}}
    rows = await store.read(
        "club_polls", fields=POLL_FIELDS, filters=filters, sort=("status", "-opened_at", "id"), page=page, limit=limit
    )
    votes = (
        await store.read(
            "club_poll_votes",
            fields=("poll_id", "option_id"),
            filters={"alumni_id": {"_eq": alumni["id"]}, "poll_id": {"_in": [row["id"] for row in rows]}},
            limit=limit,
        )
        if rows
        else []
    )
    own = {vote["poll_id"]: vote["option_id"] for vote in votes}
    return {
        "items": [{**public_poll(row), "my_option_id": own.get(row["id"])} for row in rows],
        "total": await count(store, "club_polls", filters),
        "page": page,
        "limit": limit,
    }


@api_view(body=VoteBody, permission=require_alumni)
async def vote(request: HttpRequest, id: str):
    alumni = await require_alumni(request)
    body = parse_body(request, VoteBody)
    state, identifier = request.services, guid(id)
    async with state.database.transaction() as connection:
        current = await (
            await connection.execute("SELECT user_id FROM alumni WHERE id=%s FOR UPDATE", (alumni["id"],))
        ).fetchone()
        if not current or not current["user_id"]:
            raise ApiError(401, "Войдите в кабинет")
        poll = await locked_poll(state, connection, identifier)
        if poll["status"] != "active":
            raise ApiError(409, "Голосование сейчас закрыто")
        if body.option_id not in {option["id"] for option in poll["options_json"]}:
            raise ApiError(400, "Выберите вариант этого опроса")
        previous = await state.store.read(
            "club_poll_votes",
            fields=("option_id",),
            filters={"poll_id": {"_eq": identifier}, "alumni_id": {"_eq": alumni["id"]}},
            limit=1,
            connection=connection,
        )
        if previous:
            if previous[0]["option_id"] != body.option_id:
                raise ApiError(409, "Вы уже проголосовали. Изменить ответ нельзя")
        else:
            await state.store.create(
                "club_poll_votes",
                {"poll_id": identifier, "alumni_id": alumni["id"], "option_id": body.option_id},
                connection=connection,
            )
    return {"ok": True, "option_id": body.option_id}
