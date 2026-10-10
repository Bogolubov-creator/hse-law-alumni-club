import asyncio

import httpx
from test_community_integration import account, png

from club_api.modules.members.service import anonymize


async def test_parallel_avatar_replacements_leave_only_current_file(database_app, monkeypatch):
    app = database_app
    alumni_id, headers = await account(app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        first = await client.post("/me/avatar", headers=headers, files={"file": ("first.png", png(), "image/png")})
        assert first.status_code == 200
        old_id = first.json()["avatar"]
        save = app.state.media.save
        saved, released = [], asyncio.Event()

        async def concurrent_save(*args, **kwargs):
            file = await save(*args, **kwargs)
            saved.append(file["id"])
            if len(saved) == 2:
                released.set()
            await asyncio.wait_for(released.wait(), 10)
            return file

        monkeypatch.setattr(app.state.media, "save", concurrent_save)
        responses = await asyncio.gather(
            *[
                client.post("/me/avatar", headers=headers, files={"file": ("next.png", png(), "image/png")})
                for _ in range(2)
            ]
        )
        assert [response.status_code for response in responses] == [200, 200]
        current = (await app.state.store.one("alumni", alumni_id))["avatar"]
        files = await app.state.database.rows("SELECT id,filename_disk FROM directus_files")
        assert len(files) == 1 and str(files[0]["id"]) == current and current in saved
        assert current != old_id
        assert sorted(path.name for path in app.state.settings.UPLOADS_PATH.iterdir()) == [files[0]["filename_disk"]]


async def test_anonymize_during_upload_rejects_late_avatar_and_cleans_file(database_app, monkeypatch):
    app = database_app
    alumni_id, headers = await account(app)
    save = app.state.media.save
    saved, release = asyncio.Event(), asyncio.Event()

    async def paused_save(*args, **kwargs):
        file = await save(*args, **kwargs)
        saved.set()
        await asyncio.wait_for(release.wait(), 10)
        return file

    monkeypatch.setattr(app.state.media, "save", paused_save)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        request = asyncio.create_task(
            client.post("/me/avatar", headers=headers, files={"file": ("late.png", png(), "image/png")})
        )
        try:
            await asyncio.wait_for(saved.wait(), 10)
            assert await anonymize(app.state, alumni_id)
        finally:
            release.set()
        assert (await request).status_code == 409
        row = await app.state.store.one("alumni", alumni_id)
        assert row["avatar"] is None and row["user_id"] is None
        assert not await app.state.database.rows("SELECT id FROM directus_files")
        assert not list(app.state.settings.UPLOADS_PATH.iterdir())
