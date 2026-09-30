from datetime import UTC, datetime
from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from club_api.core.errors import ApiError
from club_api.core.models import guid, partial, unique_slug
from club_api.modules.auth.routes import Body
from club_api.modules.auth.service import require_admin
from club_api.observability.audit import audit

router = APIRouter()


class NewsBody(Body):
    title: str = Field(min_length=3)
    excerpt: str | None = None
    body: str | None = None
    status: Literal["draft", "published"] = "published"


class TimelineBody(Body):
    year: str = Field(min_length=4, max_length=4)
    title: str = Field(min_length=2)
    text: str | None = None
    metric: str | None = None
    sort: int = None
    status: Literal["draft", "published"] = "published"


class ProgramBody(Body):
    title: str = Field(min_length=3)
    direction: str = Field(min_length=2)
    format: Literal["online", "offline", "blended"]
    duration: str = Field(min_length=1)
    price: int = Field(ge=0, le=9007199254740991)
    description: str | None = None
    cover: str | None = None
    start: str | None = None
    document: str | None = None
    status: Literal["draft", "published", "archived"] = "published"


class Variant(Body):
    sku: str = Field(min_length=1)
    size: str = None
    color: str = None
    stock: int = Field(ge=0)


class ProductBody(Body):
    title: str = Field(min_length=3)
    category: str = Field(min_length=2)
    price: int = Field(ge=0, le=9007199254740991)
    stock: int = Field(default=0, ge=0)
    description: str | None = None
    variants_json: list[Variant] | None = None
    images: list[str] | None = None
    status: Literal["draft", "published", "archived"] = "published"


async def write_content(state, table, data, *, id=None):
    data = dict(data)
    if table == "programs" and "start" in data:
        start = data.pop("start")
        data["dates"] = {"start": start} if start else None
    if table == "products" and data.get("variants_json"):
        skus = [row["sku"] for row in data["variants_json"]]
        if len(skus) != len(set(skus)):
            raise ApiError(400, "Артикулы вариантов должны различаться")
    if id is not None:
        if table == "products" and any(key in data for key in ("stock", "variants_json")):
            async with state.database.transaction() as connection:
                await product_reservations(connection, id)
                return await state.store.update(table, data, id=id, connection=connection)
        return await state.store.update(table, data, id=id)
    if table in ("programs", "products", "news"):
        data["slug"] = await unique_slug(state.store, table, data["title"])
    if table == "news":
        data["published_at"] = datetime.now(UTC)
    if table in ("timeline_items", "podcasts") and data.get("sort") is None:
        rows = await state.store.read(table, fields=("sort",), limit=-1)
        data["sort"] = max((row["sort"] or 0 for row in rows), default=0) + 1
    return await state.store.create(table, data)


async def product_reservations(connection, id):
    row = await (await connection.execute("SELECT id FROM products WHERE id=%s FOR UPDATE", (id,))).fetchone()
    if not row:
        raise ApiError(404, "Товар не найден")
    active = await (
        await connection.execute(
            "SELECT c.order_id FROM club_checkout_commits c JOIN orders o ON o.id=c.order_id WHERE c.released=false AND o.status NOT IN ('done','canceled','expired') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.reservations::jsonb) r WHERE r->>'id'=%s) LIMIT 1",
            (id,),
        )
    ).fetchone()
    if active:
        raise ApiError(409, "У товара есть резерв в незавершённой заявке. Сначала завершите или отмените её")


def content_crud(router, path, table, model, *, sort, fields, subject, notify=None):
    patch_model = partial(model)

    async def listing(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
        return await request.app.state.store.read(table, sort=sort, fields=fields, limit=-1)

    async def create(request: Request, body: model, admin: Annotated[dict, Depends(require_admin)]):
        data = body.model_dump(exclude_unset=False)
        # Необязательные флаги оставляют значения по умолчанию в PostgreSQL.
        data = {
            key: value
            for key, value in data.items()
            if value is not None
            or key in body.model_fields_set
            or type(None) in get_args(model.model_fields[key].annotation)
        }
        row = await write_content(request.app.state, table, data)
        await audit(
            request,
            subject + ".create",
            actor="admin:" + admin["userId"],
            subject=subject + ":" + row["id"],
            detail={
                key: value
                for key, value in data.items()
                if key in ("title", "year", "price", "stock", "status", "is_free")
            },
        )
        if notify and data.get("status") == "published":
            await request.app.state.push.to_all(
                {"title": notify, "body": data["title"], "url": path.replace("/admin", "")}
            )
        return {"ok": True, "id": row["id"], **({"slug": row["slug"]} if table in ("programs", "products") else {})}

    async def patch(request: Request, id: str, body: patch_model, admin: Annotated[dict, Depends(require_admin)]):
        data = body.model_dump(exclude_unset=True)
        await write_content(request.app.state, table, data, id=guid(id))
        await audit(
            request, subject + ".patch", actor="admin:" + admin["userId"], subject=subject + ":" + id, detail=data
        )
        return {"ok": True}

    async def delete(request: Request, id: str, admin: Annotated[dict, Depends(require_admin)]):
        state, id = request.app.state, guid(id)
        if table == "products":
            async with state.database.transaction() as connection:
                await product_reservations(connection, id)
                await state.store.delete(table, id=id, connection=connection)
        else:
            await state.store.delete(table, id=id)
        await audit(request, subject + ".delete", actor="admin:" + admin["userId"], subject=subject + ":" + id)
        return {"ok": True}

    for method, endpoint, suffix in (
        ("GET", listing, ""),
        ("POST", create, ""),
        ("PATCH", patch, "/{id}"),
        ("DELETE", delete, "/{id}"),
    ):
        router.add_api_route(path + suffix, endpoint, methods=[method], name=table + "_" + method.lower())


content_crud(
    router,
    "/admin/news",
    "news",
    NewsBody,
    sort=("-published_at",),
    fields=("id", "slug", "title", "excerpt", "body", "published_at", "status", "source_url"),
    subject="news",
)
content_crud(
    router,
    "/admin/timeline",
    "timeline_items",
    TimelineBody,
    sort=("sort",),
    fields=("id", "year", "title", "text", "metric", "sort", "status"),
    subject="timeline",
)
content_crud(
    router,
    "/admin/programs",
    "programs",
    ProgramBody,
    sort=("title",),
    fields=(
        "id",
        "slug",
        "title",
        "direction",
        "format",
        "duration",
        "price",
        "status",
        "enrollment",
        "source_url",
        "dates",
        "document",
        "description",
        "cover",
    ),
    subject="program",
)
content_crud(
    router,
    "/admin/products",
    "products",
    ProductBody,
    sort=("title",),
    fields=("id", "slug", "title", "category", "price", "stock", "status", "variants_json", "description"),
    subject="product",
)


class HeroBody(Body):
    badge: str = None
    title_pre: str = None
    title_accent: str = None
    subtitle: str = None
    cta_primary: str = None
    cta_secondary: str = None
    history_eyebrow: str = Field(default=None, max_length=80)
    history_title: str = Field(default=None, max_length=200)
    history_hint: str = Field(default=None, max_length=200)
    marquee: list[Annotated[str, Field(max_length=60)]] = Field(default=None, max_length=20)


class CtaBody(Body):
    title: str = None
    text: str = None
    button: str = None


class PageBody(Body):
    hero: HeroBody = None
    cta: CtaBody = None


async def page(store, slug, *, connection=None):
    rows = await store.read(
        "pages",
        filters={"slug": {"_eq": slug}},
        fields=("id", "slug", "title", "blocks.collection", "blocks.item:block_hero.*", "blocks.item:block_cta.*"),
        limit=1,
        connection=connection,
    )
    if not rows:
        raise ApiError(404, "Страница не найдена")
    return rows[0]


@router.get("/admin/pages/{slug}")
async def admin_page(request: Request, slug: str, _admin: Annotated[dict, Depends(require_admin)]):
    row = await page(request.app.state.store, slug)
    return {
        "slug": row["slug"],
        "title": row["title"],
        "blocks": {
            block["collection"].removeprefix("block_"): block["item"]
            for block in row["blocks"]
            if block["collection"] and block["item"]
        },
    }


@router.patch("/admin/pages/{slug}")
async def patch_page(request: Request, slug: str, body: PageBody, admin: Annotated[dict, Depends(require_admin)]):
    state = request.app.state
    async with state.database.transaction() as connection:
        row = await page(state.store, slug, connection=connection)
        for block in row["blocks"]:
            data = (
                body.hero
                if block["collection"] == "block_hero"
                else body.cta
                if block["collection"] == "block_cta"
                else None
            )
            if data is not None and block["item"]:
                await state.store.update(
                    block["collection"],
                    data.model_dump(exclude_unset=True),
                    id=block["item"]["id"],
                    connection=connection,
                )
    await audit(
        request,
        "page.patch",
        actor="admin:" + admin["userId"],
        subject="page:" + slug,
        detail={"hero": body.hero is not None, "cta": body.cta is not None},
    )
    return {"ok": True}
