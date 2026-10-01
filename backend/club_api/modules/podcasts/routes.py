import hashlib
import hmac
import logging
import math
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import Field, field_validator

from club_api.core.errors import ApiError
from club_api.core.models import guid, parse_date, sub_active
from club_api.domain import DOMAIN
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin
from club_api.modules.checkout.cart import locked_cart
from club_api.modules.checkout.payments import secure_payment_url
from club_api.modules.content.admin import content_crud
from club_api.modules.gamification.routes import verified_alumni
from club_api.modules.media.service import media_id
from club_api.observability.audit import audit

router = APIRouter()
logger = logging.getLogger("club.podcasts")
PODCAST_SUB_PRICE_KOP = DOMAIN["limits"]["podcast_year_price"]
ROUTE_LIMITS = {("GET", "/podcasts/{id}/audio"): 120, ("POST", "/podcasts/subscribe"): 5}


def audio_signature(state, id, holder, expires):
    return hmac.new(
        state.settings.secret("AUTH_SECRET").encode(), f"{id}.{holder}.{expires}".encode(), hashlib.sha256
    ).hexdigest()


def signed_audio(state, id, holder):
    expires = int(time.time()) + 7200
    return f"/api/podcasts/{id}/audio?h={quote(holder)}&exp={expires}&sig={audio_signature(state, id, holder, expires)}"


def rutube_embed(value):
    match = (
        re.fullmatch(
            r"https://(?:[a-z0-9-]+\.)*rutube\.ru/(video/private|video|play/embed)/([0-9a-f]{32})/?(?:\?([^#]*))?(?:#.*)?",
            value.strip(),
            re.I,
        )
        if value
        else None
    )
    if not match:
        return None
    token = None
    for pair in (match[3] or "").split("&"):
        if pair.startswith("p="):
            if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", pair[2:]):
                token = pair[2:]
            break
    return "https://rutube.ru/play/embed/" + match[2].lower() + ("?p=" + token if token else "")


async def record_play(state, id, holder):
    try:
        async with state.database.transaction() as connection:
            await connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("play:" + id + ":" + holder,)
            )
            alumni_id = None if holder == "free" else guid(holder)
            cursor = await connection.execute(
                "SELECT id FROM podcast_plays WHERE podcast_id=%s AND alumni_id IS NOT DISTINCT FROM %s::uuid AND created_at>now()-interval '6 hours' LIMIT 1",
                (id, alumni_id),
            )
            if not await cursor.fetchone():
                await state.store.create(
                    "podcast_plays", {"podcast_id": id, "alumni_id": alumni_id}, connection=connection
                )
    except Exception:
        logger.warning("Не удалось записать прослушивание")


@router.get("/podcasts")
async def podcasts(request: Request):
    state = request.app.state
    alumni = await state.auth.resolve_alumni(request)
    until = alumni.get("podcast_sub_until") if alumni else None
    subscribed = sub_active(until)
    rows = await state.store.read(
        "podcasts",
        filters={"status": {"_eq": "published"}},
        sort=("sort",),
        limit=-1,
        fields=("id", "title", "description", "cover", "duration", "is_free", "audio_url", "video_url"),
    )
    return {
        "items": [
            {key: value for key, value in row.items() if key not in ("audio_url", "video_url")}
            | {
                "is_free": bool(row["is_free"]),
                "audio_url": signed_audio(state, row["id"], "free" if row["is_free"] else alumni["id"])
                if row["audio_url"] and (row["is_free"] or subscribed)
                else None,
                "video_url": rutube_embed(row["video_url"]) if row["is_free"] or subscribed else None,
            }
            for row in rows
        ],
        "subscribed": subscribed,
        "sub_until": until if subscribed else None,
        "price": PODCAST_SUB_PRICE_KOP,
    }


@router.get("/podcasts/{id}/audio")
async def audio(request: Request, id: str):
    state, id = request.app.state, guid(id)
    holder, signature = request.query_params.get("h", ""), request.query_params.get("sig", "")
    raw_expires = request.query_params.get("exp", "")
    if (
        not re.fullmatch(r"[0-9]{1,12}", raw_expires)
        or not 1 <= len(holder) <= 64
        or not re.fullmatch(r"[a-f0-9]{64}", signature)
    ):
        raise ApiError(403, "Ссылка недействительна или истекла")
    expires = int(raw_expires)
    if expires < time.time() or not hmac.compare_digest(audio_signature(state, id, holder, expires), signature):
        raise ApiError(403, "Ссылка недействительна или истекла")
    rows = await state.store.read(
        "podcasts",
        filters={"id": {"_eq": id}, "status": {"_eq": "published"}},
        fields=("audio_url", "is_free"),
        limit=1,
    )
    if not rows or not rows[0]["audio_url"]:
        raise ApiError(404, "Выпуск не найден")
    podcast = rows[0]
    if not podcast["is_free"]:
        if holder == "free":
            raise ApiError(403, "Подписка неактивна")
        profiles = await state.store.read(
            "alumni", filters={"id": {"_eq": guid(holder)}}, fields=("podcast_sub_until",), limit=1
        )
        if not profiles or not sub_active(profiles[0]["podcast_sub_until"]):
            raise ApiError(403, "Подписка неактивна")
    if not request.headers.get("range") or request.headers["range"].startswith("bytes=0-"):
        await record_play(state, id, holder)
    file_id = media_id(podcast["audio_url"])
    if file_id:
        if await state.media.is_avatar(file_id):
            raise ApiError(404, "Выпуск не найден")
        return await state.media.stream(
            file_id, kind="audio", range=request.headers.get("range"), cache="private, max-age=3600"
        )
    target = urlsplit(podcast["audio_url"])
    if target.scheme not in ("http", "https") or not target.hostname or target.username or target.password:
        raise ApiError(404, "Выпуск не найден")
    return RedirectResponse(podcast["audio_url"], status_code=302)


@router.post("/podcasts/subscribe")
async def subscribe(request: Request, alumni: Annotated[dict, Depends(verified_alumni)]):
    state = request.app.state
    if sub_active(alumni.get("podcast_sub_until")):
        raise ApiError(400, "Подписка уже активна")
    async with locked_cart(state, "podcast:" + alumni["id"]) as connection:
        previous = await state.store.read(
            "orders",
            filters={
                "alumni_id": {"_eq": alumni["id"]},
                "type": {"_eq": "podcast"},
                "status": {"_in": ["new", "in_progress"]},
                "_or": [{"payment_status": {"_null": True}}, {"payment_status": {"_nin": ["succeeded", "canceled"]}}],
            },
            fields=("number", "payment_id"),
            sort=("-created_at",),
            limit=1,
            connection=connection,
        )
        if previous:
            order = previous[0]
        else:
            await connection.execute("SELECT pg_advisory_xact_lock(81920260908)")
            year = datetime.now(ZoneInfo("Europe/Moscow")).year
            cursor = await connection.execute(
                "SELECT COALESCE(MAX(CAST(split_part(number,'-',3) AS integer)),0)+1 AS seq FROM orders WHERE number ~ %s",
                (f"^ALU-{year}-[0-9]+$",),
            )
            number = f"ALU-{year}-{(await cursor.fetchone())['seq']:06d}"
            contacts = alumni.get("contacts_json") or {}
            order = await state.store.create(
                "orders",
                {
                    "number": number,
                    "alumni_id": alumni["id"],
                    "type": "podcast",
                    "items_json": [
                        {
                            "type": "podcast",
                            "ref_id": "podcast-sub-year",
                            "qty": 1,
                            "price": PODCAST_SUB_PRICE_KOP,
                            "title": "Подписка на подкасты клуба · 1 год",
                        }
                    ],
                    "subtotal": PODCAST_SUB_PRICE_KOP,
                    "member_discount": 0,
                    "total_estimate": PODCAST_SUB_PRICE_KOP,
                    "contact_fio": alumni["fio"] or "Выпускник",
                    "contact_phone": contacts.get("phone") or "-",
                    "contact_email": contacts.get("email") or "-",
                    "fulfillment": "pickup",
                    "consent_pdn": True,
                    "status": "new",
                    "payment_status": "pending" if state.payments.enabled else None,
                },
                connection=connection,
            )
    payment_url = None
    if previous:
        if state.payments.enabled and order["payment_id"]:
            try:
                payment = await state.payments.fetch(order["payment_id"])
                if payment["status"] == "pending":
                    payment_url = secure_payment_url(payment.get("confirmation", {}).get("confirmation_url"))
            except ApiError:
                logger.warning("Не удалось получить ссылку оплаты подписки")
        return {"number": order["number"], **({"payment_url": payment_url} if payment_url else {}), "already": True}
    await state.notifications.order_notice(
        order["number"], "Подписка на подкасты клуба · 1 год", PODCAST_SUB_PRICE_KOP, 0
    )
    if state.payments.enabled:
        try:
            payment = await state.payments.create(
                order["number"],
                PODCAST_SUB_PRICE_KOP,
                "Подписка на подкасты · заявка " + order["number"],
                (alumni.get("contacts_json") or {}).get("email"),
            )
            await state.payments.record(order["number"], payment)
            payment_url = secure_payment_url(payment.get("confirmation", {}).get("confirmation_url"))
        except ApiError:
            logger.warning("Не удалось создать платёж подписки")
    await audit(
        request,
        "podcast.sub.request",
        actor="alumni:" + alumni["id"],
        subject="order:" + order["number"],
        detail={"payment": bool(payment_url)},
    )
    return {"number": order["number"], **({"payment_url": payment_url} if payment_url else {})}


class PodcastBody(Body):
    title: str = Field(min_length=3)
    description: str | None = None
    cover: str | None = Field(default=None, max_length=500)
    audio_url: str | None = Field(default=None, max_length=500)
    video_url: str | None = Field(default=None, max_length=500)
    duration: str | None = None
    is_free: bool = False
    sort: int = None
    status: Literal["draft", "published"] = "published"

    @field_validator("cover", "audio_url", "video_url")
    @classmethod
    def references(cls, value, info):
        if not value:
            return None
        if info.field_name == "audio_url" and media_id(value) == value.lower():
            return value
        from urllib.parse import urlsplit

        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            raise ValueError("Укажите ссылку http:// или https://")
        return value


content_crud(
    router,
    "/admin/podcasts",
    "podcasts",
    PodcastBody,
    sort=("sort",),
    fields=("id", "title", "description", "cover", "audio_url", "video_url", "duration", "is_free", "sort", "status"),
    subject="podcast",
    notify="Новый подкаст 🎧",
)


@router.get("/admin/podcast-subs")
async def subscribers(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    store = request.app.state.store
    now = datetime.now(UTC)
    subs = await store.read(
        "alumni",
        filters={"podcast_sub_until": {"_nnull": True}},
        fields=("id", "fio", "cohort", "podcast_sub_until", "podcast_reminder_sent", "contacts_json"),
        sort=("podcast_sub_until",),
        limit=-1,
    )
    active = [row for row in subs if parse_date(row["podcast_sub_until"]) > now]
    plays = await store.read("podcast_plays", fields=("podcast_id", "alumni_id", "created_at"), limit=-1)
    episodes = await store.read("podcasts", fields=("id", "title", "is_free"), sort=("sort",), limit=-1)
    items = [
        {
            "id": row["id"],
            "fio": row["fio"],
            "cohort": row["cohort"],
            "until": row["podcast_sub_until"],
            "days_left": math.ceil((parse_date(row["podcast_sub_until"]) - now).total_seconds() / 86400),
            "reminded": bool(row["podcast_reminder_sent"]),
            "email": (row["contacts_json"] or {}).get("email"),
        }
        for row in active
    ]
    stats = []
    for episode in episodes:
        mine = [play for play in plays if play["podcast_id"] == episode["id"]]
        stats.append(
            {
                **episode,
                "is_free": bool(episode["is_free"]),
                "plays": len(mine),
                "listeners": len({play["alumni_id"] for play in mine}),
                "plays_30d": sum(parse_date(play["created_at"]) >= now - timedelta(days=30) for play in mine),
            }
        )
    return {
        "active": len(items),
        "expiring_30d": sum(parse_date(row["podcast_sub_until"]) <= now + timedelta(days=30) for row in active),
        "expired": len(subs) - len(active),
        "items": items,
        "plays_total": len(plays),
        "by_podcast": sorted(stats, key=lambda row: -row["plays"]),
    }
