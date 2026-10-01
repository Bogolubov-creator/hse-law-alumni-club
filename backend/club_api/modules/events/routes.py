import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import Response
from pydantic import Field, field_validator

from club_api.core.errors import ApiError
from club_api.core.models import count, group_count, guid, parse_date, partial, query_page
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin
from club_api.modules.events.notifications import announce
from club_api.modules.gamification.routes import verified_alumni
from club_api.observability.audit import audit

router = APIRouter()
ROUTE_LIMITS = {("POST", "/events/{id}/rsvp"): 20}
EVENT_FIELDS = ("id", "title", "description", "starts_at", "location", "cover", "reg_url", "format", "points", "status")


class EventBody(Body):
    title: str = Field(min_length=3)
    description: str | None = None
    starts_at: str = Field(min_length=4)
    location: str | None = None
    cover: str | None = Field(default=None, max_length=500)
    reg_url: str | None = Field(default=None, max_length=500)
    format: Literal["offline", "online"] = "offline"
    points: int = Field(default=60, ge=0, le=500)
    status: Literal["draft", "published", "done", "canceled"] = "published"

    @field_validator("reg_url")
    @classmethod
    def valid_url(cls, value):
        if not value:
            return None
        url = urlsplit(value)
        if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
            raise ValueError("Некорректная ссылка")
        return value

    @field_validator("starts_at")
    @classmethod
    def valid_date(cls, value):
        parse_date(value)
        return value


EventPatch = partial(EventBody)


async def roster(store, event_id=None):
    rows = await store.read(
        "event_rsvps",
        filters={"event_id": {"_eq": event_id}} if event_id else None,
        fields=("id", "event_id", "alumni_id", "attended"),
        limit=-1,
    )
    names = (
        {
            row["id"]: row["fio"] or "–"
            for row in await store.read(
                "alumni",
                filters={"id": {"_in": list({row["alumni_id"] for row in rows})}},
                fields=("id", "fio"),
                limit=-1,
            )
        }
        if rows
        else {}
    )
    return [{**row, "fio": names.get(row["alumni_id"], "–")} for row in rows]


@router.get("/stats")
async def stats(request: Request):
    state = request.app.state
    cached = getattr(state, "public_stats", None)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    data = {
        "alumni": await count(state.store, "alumni", {"verification_status": {"_eq": "verified"}}),
        "events": await count(state.store, "events", {"status": {"_in": ["published", "done"]}}),
        "programs": await count(state.store, "programs", {"status": {"_eq": "published"}}),
    }
    state.public_stats = (time.monotonic(), data)
    return data


@router.get("/events")
async def events(request: Request):
    state = request.app.state
    alumni = await state.auth.resolve_alumni(request)
    rows = await state.store.read(
        "events", filters={"status": {"_in": ["published", "done"]}}, sort=("starts_at",), fields=EVENT_FIELDS, limit=50
    )
    ids = [row["id"] for row in rows]
    groups = await group_count(state.store, "event_rsvps", ("event_id",), {"event_id": {"_in": ids}}) if ids else []
    counts = {row["event_id"]: row["count"] for row in groups}
    mine = (
        await state.store.read(
            "event_rsvps",
            filters={"event_id": {"_in": ids}, "alumni_id": {"_eq": alumni["id"]}},
            fields=("event_id", "attended"),
            limit=-1,
        )
        if ids and alumni
        else []
    )
    attended = {row["event_id"]: row["attended"] for row in mine}
    return [
        {
            **row,
            "going": counts.get(row["id"], 0),
            "my_rsvp": row["id"] in attended,
            "my_attended": attended.get(row["id"], False),
        }
        for row in rows
    ]


def ics_escape(value):
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\n")
    )


@router.get("/events/{id}.ics")
async def calendar(request: Request, id: str):
    rows = await request.app.state.store.read(
        "events",
        filters={"id": {"_eq": guid(id)}, "status": {"_in": ["published", "done"]}},
        fields=EVENT_FIELDS,
        limit=1,
    )
    if not rows:
        raise ApiError(404, "Событие не найдено")
    event = rows[0]
    start = parse_date(event["starts_at"])

    def stamp(value):
        return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Клуб выпускников факультета права Вышки//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:event-{id}@club-pravo-hse",
        "DTSTAMP:" + stamp(datetime.now(UTC)),
        "DTSTART:" + stamp(start),
        "DTEND:" + stamp(start + timedelta(hours=2)),
        "SUMMARY:" + ics_escape(event["title"]),
    ]
    if event["description"]:
        description = event["description"] + ("\nРегистрация: " + event["reg_url"] if event["reg_url"] else "")
        lines.append("DESCRIPTION:" + ics_escape(description))
    if event["location"] and event["format"] != "online":
        lines.append("LOCATION:" + ics_escape(event["location"]))
    lines.extend(
        [
            "URL:" + request.app.state.settings.PUBLIC_URL + "/events",
            "BEGIN:VALARM",
            "TRIGGER:-PT2H",
            "ACTION:DISPLAY",
            "DESCRIPTION:" + ics_escape(event["title"]) + " – через 2 часа",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    return Response(
        "\r\n".join(lines),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="club-event.ics"'},
    )


@router.post("/events/{id}/rsvp")
async def rsvp(request: Request, id: str, alumni: Annotated[dict, Depends(verified_alumni)]):
    state, id = request.app.state, guid(id)
    async with state.database.transaction() as connection:
        await connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("rsvp:" + id + ":" + alumni["id"],)
        )
        rows = await state.store.read(
            "events",
            filters={"id": {"_eq": id}, "status": {"_eq": "published"}},
            fields=("id",),
            limit=1,
            connection=connection,
        )
        if not rows:
            raise ApiError(404, "Событие не найдено")
        existing = await state.store.read(
            "event_rsvps",
            filters={"event_id": {"_eq": id}, "alumni_id": {"_eq": alumni["id"]}},
            fields=("id", "attended"),
            limit=1,
            connection=connection,
        )
        if existing:
            if existing[0]["attended"]:
                raise ApiError(400, "Посещение уже отмечено – отменить нельзя")
            await state.store.delete("event_rsvps", id=existing[0]["id"], connection=connection)
            return {"going": False}
        await state.store.create(
            "event_rsvps", {"event_id": id, "alumni_id": alumni["id"], "attended": False}, connection=connection
        )
    await audit(request, "event.rsvp", actor="alumni:" + alumni["id"], subject="event:" + id)
    return {"going": True}


@router.get("/admin/events")
async def admin_events(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    store = request.app.state.store
    if "page" in request.query_params or "limit" in request.query_params:
        page, limit = query_page(request, default_limit=20)
        rows = await store.read(
            "events", sort=("-starts_at", "id"), fields=EVENT_FIELDS, limit=limit, offset=(page - 1) * limit
        )
        counts = (
            {
                row["event_id"]: row["count"]
                for row in await group_count(
                    store, "event_rsvps", ("event_id",), {"event_id": {"_in": [row["id"] for row in rows]}}
                )
            }
            if rows
            else {}
        )
        return {
            "items": [{**row, "rsvp_count": counts.get(row["id"], 0)} for row in rows],
            "total": await count(store, "events"),
            "page": page,
            "limit": limit,
        }
    rows = await store.read("events", sort=("-starts_at",), fields=EVENT_FIELDS, limit=-1)
    rsvps = await roster(store)
    return [
        {
            **row,
            "rsvps": [
                {key: value for key, value in rsvp.items() if key != "event_id"}
                for rsvp in rsvps
                if rsvp["event_id"] == row["id"]
            ],
        }
        for row in rows
    ]


@router.get("/admin/events/{id}/rsvps")
async def admin_roster(request: Request, id: str, _admin: Annotated[dict, Depends(require_admin)]):
    await request.app.state.store.one("events", guid(id), fields=("id",))
    return [
        {key: value for key, value in row.items() if key != "event_id"}
        for row in await roster(request.app.state.store, id)
    ]


@router.post("/admin/events")
async def create_event(
    request: Request, body: EventBody, tasks: BackgroundTasks, admin: Annotated[dict, Depends(require_admin)]
):
    row = await request.app.state.store.create("events", body.model_dump())
    await audit(
        request,
        "event.create",
        actor="admin:" + admin["userId"],
        subject="event:" + row["id"],
        detail={"title": body.title},
    )
    if body.status == "published":
        tasks.add_task(announce, request.app.state, row)
    return {"ok": True, "id": row["id"]}


@router.patch("/admin/events/{id}")
async def patch_event(request: Request, id: str, body: EventPatch, admin: Annotated[dict, Depends(require_admin)]):
    data = body.model_dump(exclude_unset=True)
    await request.app.state.store.update("events", data, id=guid(id))
    await audit(request, "event.patch", actor="admin:" + admin["userId"], subject="event:" + id, detail=data)
    return {"ok": True}


@router.delete("/admin/events/{id}")
async def delete_event(request: Request, id: str, admin: Annotated[dict, Depends(require_admin)]):
    await request.app.state.store.delete("events", id=guid(id))
    await audit(request, "event.delete", actor="admin:" + admin["userId"], subject="event:" + id)
    return {"ok": True}


@router.post("/admin/events/rsvp/{rsvpId}/attend")
async def attend(request: Request, rsvpId: str, admin: Annotated[dict, Depends(require_admin)]):
    state = request.app.state
    row = await state.store.one("event_rsvps", guid(rsvpId))
    if not row:
        raise ApiError(404, "RSVP не найден")
    if row["attended"]:
        return {"ok": True, "already": True}
    event = await state.store.one("events", row["event_id"])
    await state.gamification.add(
        row["alumni_id"],
        reason="event",
        delta=event.get("points", 60) if event else 60,
        ref=row["event_id"],
        comment="Участие: " + (event["title"] if event else "событие клуба"),
        idempotency_key=f"event-{row['event_id']}-{row['alumni_id']}",
    )
    await state.store.update("event_rsvps", {"attended": True}, id=row["id"])
    await audit(
        request,
        "event.attended",
        actor="admin:" + admin["userId"],
        subject="alumni:" + row["alumni_id"],
        detail={"event": row["event_id"]},
    )
    return {"ok": True}
