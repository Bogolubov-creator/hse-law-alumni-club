import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from club_api.core.errors import ApiError
from club_api.core.models import guid, query_page
from club_api.modules.auth.service import require_admin, require_alumni
from club_api.modules.media.service import MAX_AUDIO_BYTES
from club_api.observability.audit import audit

router = APIRouter()
logger = logging.getLogger("club.media")
ROUTE_LIMITS = {("POST", "/admin/media"): 8, ("POST", "/me/avatar"): 10}


async def upload_form(request):
    try:
        form = await request.form(max_files=1, max_fields=0, max_part_size=MAX_AUDIO_BYTES)
    except Exception:
        raise ApiError(400, "Прикрепите один файл") from None
    uploads = list(form.values())
    if len(uploads) != 1 or not hasattr(uploads[0], "read"):
        await form.close()
        raise ApiError(400, "Выберите файл")
    return form, uploads[0]


@router.get("/media/{fileId}")
async def public_media(request: Request, fileId: str):
    media, id = request.app.state.media, guid(fileId)
    if not await media.is_published_image(id):
        raise ApiError(404, "Файл не найден")
    return await media.stream(id, kind="image", range=request.headers.get("range"), cache="public, max-age=300")


@router.get("/admin/media")
async def media_list(request: Request, _admin: Annotated[dict, Depends(require_admin)]):
    page, limit = query_page(request, default_limit=20)
    search = request.query_params.get("q", "")
    if len(search) > 120 or page > 100000:
        raise ApiError(400, "Некорректные параметры")
    return await request.app.state.media.list(page, limit, search)


@router.post("/admin/media")
async def upload_office(request: Request, admin: Annotated[dict, Depends(require_admin)]):
    form, upload = await upload_form(request)
    try:
        file = await request.app.state.media.save(
            upload, filename=upload.filename or "file", uploaded_by=admin["userId"]
        )
    finally:
        await form.close()
    await audit(
        request,
        "media.upload",
        actor="admin:" + admin["userId"],
        subject="file:" + file["id"],
        detail={"size": int(file["filesize"]), "type": file["type"]},
    )
    return JSONResponse(
        {"id": file["id"], "filename": file["filename_download"], "type": file["type"], "size": int(file["filesize"])},
        status_code=201,
    )


async def office_file(media, id):
    file = await media.get(id)
    if not file or (file["metadata"] or {}).get("club_upload_kind") == "avatar" or await media.is_avatar(id):
        raise ApiError(404, "Файл не найден")
    return file


@router.get("/admin/media/{fileId}/content")
async def office_content(request: Request, fileId: str, _admin: Annotated[dict, Depends(require_admin)]):
    media, id = request.app.state.media, guid(fileId)
    file = await office_file(media, id)
    return await media.stream(
        id, kind="image" if file["type"].startswith("image/") else "audio", range=request.headers.get("range")
    )


@router.delete("/admin/media/{fileId}")
async def delete_media(request: Request, fileId: str, admin: Annotated[dict, Depends(require_admin)]):
    media, id = request.app.state.media, guid(fileId)
    await office_file(media, id)
    await media.delete(id)
    await audit(request, "media.delete", actor="admin:" + admin["userId"], subject="file:" + id)
    return {"ok": True}


@router.post("/me/avatar")
async def upload_avatar(request: Request, alumni: Annotated[dict, Depends(require_alumni)]):
    if alumni["verification_status"] == "rejected":
        raise ApiError(403, "Заявка отклонена – загрузка фото недоступна")
    if alumni["verification_status"] not in ("pending", "verified"):
        raise ApiError(403, "Доступно после подачи заявки")
    form, upload = await upload_form(request)
    state = request.app.state
    try:
        if upload.content_type not in ("image/jpeg", "image/png", "image/webp"):
            raise ApiError(400, "Поддерживаются JPEG, PNG или WebP")
        try:
            file = await state.media.save(
                upload, filename="avatar-" + alumni["id"], kind="avatar", max_bytes=3 * 1024 * 1024
            )
        except ApiError as error:
            if error.status in (413, 415):
                await audit(
                    request, "avatar.reject", actor="alumni:" + alumni["id"], detail={"declared": upload.content_type}
                )
                raise ApiError(
                    400, "Файл больше 3 МБ" if error.status == 413 else "Это не изображение JPEG, PNG или WebP"
                ) from None
            raise
    finally:
        await form.close()
    try:
        await state.store.update("alumni", {"avatar": file["id"]}, id=alumni["id"])
    except BaseException:
        await state.media.delete(file["id"])
        raise
    if alumni.get("avatar") and alumni["avatar"] != file["id"]:
        try:
            await state.media.delete(alumni["avatar"])
        except Exception:
            logger.warning("Не удалось удалить прежний аватар")
    await audit(
        request,
        "avatar.upload",
        actor="alumni:" + alumni["id"],
        detail={"fileId": file["id"], "size": int(file["filesize"])},
    )
    return {"ok": True, "avatar": file["id"]}


@router.get("/avatars/{fileId}")
async def avatar(request: Request, fileId: str):
    media, id = request.app.state.media, guid(fileId)
    if not await media.is_avatar(id):
        raise ApiError(404, "Не найдено")
    return await media.avatar(id)
