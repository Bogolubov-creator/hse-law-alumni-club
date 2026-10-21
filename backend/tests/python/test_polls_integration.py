import asyncio

import httpx
from test_community_integration import account


async def draft(client, headers):
    response = await client.post(
        "/admin/polls",
        headers=headers,
        json={
            "question": "Какая тема вам интереснее?",
            "options": ["Трудовое право", "Гражданское право", "Уголовное право"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_poll_lifecycle_and_private_results(database_app):
    app = database_app
    _, admin = await account(app, "admin")
    _, member = await account(app, verified=False)
    _, other = await account(app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        poll = await draft(client, admin)
        identifier = poll["id"]
        option = poll["options"][0]["id"]
        assert (await client.get("/me/polls", headers=member)).json()["items"] == []
        assert (
            await client.post(f"/me/polls/{identifier}/vote", headers=member, json={"option_id": option})
        ).status_code == 409
        assert (await client.post(f"/admin/polls/{identifier}/launch", headers=admin)).status_code == 200
        listing = (await client.get("/me/polls", headers=member)).json()["items"]
        assert listing[0]["my_option_id"] is None
        assert "total_votes" not in listing[0] and "count" not in listing[0]["options"][0]
        assert (
            await client.post(f"/me/polls/{identifier}/vote", headers=member, json={"option_id": option})
        ).status_code == 200
        assert (await client.get("/me/polls", headers=other)).json()["items"][0]["my_option_id"] is None
        own = (await client.get("/me/polls", headers=member)).json()["items"][0]
        assert own["my_option_id"] == option
        results = (await client.get("/admin/polls", headers=admin)).json()["items"][0]
        assert results["total_votes"] == 1
        assert [(row["count"], row["percent"]) for row in results["options"]] == [(1, 100.0), (0, 0.0), (0, 0.0)]
        assert not any(key in str(results) for key in ("alumni_id", "user_id", "fio", "voters"))
        assert (await client.post(f"/admin/polls/{identifier}/close", headers=admin)).status_code == 200
        assert (
            await client.post(f"/me/polls/{identifier}/vote", headers=other, json={"option_id": option})
        ).status_code == 409
        assert (await client.post(f"/admin/polls/{identifier}/launch", headers=admin)).status_code == 409
        assert (await client.post(f"/admin/polls/{identifier}/close", headers=admin)).status_code == 200


async def test_poll_roles_and_input_validation(database_app):
    app = database_app
    _, admin = await account(app, "admin")
    _, editor = await account(app, "editor")
    _, member = await account(app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        poll = await draft(client, admin)
        for headers, expected in (({}, 401), (member, 401), (editor, 403)):
            assert (await client.get("/admin/polls", headers=headers)).status_code == expected
            assert (
                await client.post("/admin/polls", headers=headers, json={"question": "Вопрос?", "options": ["А", "Б"]})
            ).status_code == expected
            for action in ("launch", "close"):
                assert (
                    await client.post(f"/admin/polls/{poll['id']}/{action}", headers=headers)
                ).status_code == expected
        assert (await client.get("/me/polls")).status_code == 401
        assert (
            await client.post(f"/me/polls/{poll['id']}/vote", json={"option_id": poll["options"][0]["id"]})
        ).status_code == 401
        for options in (["Один"], ["Право", " право "], [" ", "Два"], [str(i) for i in range(11)]):
            assert (
                await client.post("/admin/polls", headers=admin, json={"question": "Вопрос?", "options": options})
            ).status_code == 400
        assert (
            await client.post("/admin/polls", headers=admin, json={"question": "   ", "options": ["А", "Б"]})
        ).status_code == 400
        await client.post(f"/admin/polls/{poll['id']}/launch", headers=admin)
        foreign = await draft(client, admin)
        assert (
            await client.post(
                f"/me/polls/{poll['id']}/vote", headers=member, json={"option_id": foreign["options"][0]["id"]}
            )
        ).status_code == 400


async def test_poll_repeated_and_concurrent_votes(database_app):
    app = database_app
    _, admin = await account(app, "admin")
    _, member = await account(app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        poll = await draft(client, admin)
        await client.post(f"/admin/polls/{poll['id']}/launch", headers=admin)

        async def vote(option):
            return await client.post(f"/me/polls/{poll['id']}/vote", headers=member, json={"option_id": option["id"]})

        replies = await asyncio.gather(*(vote(poll["options"][0]) for _ in range(3)))
        assert [reply.status_code for reply in replies] == [200, 200, 200]
        assert (await vote(poll["options"][1])).status_code == 409
        assert (await client.get("/admin/polls", headers=admin)).json()["items"][0]["total_votes"] == 1
        assert (
            await client.patch(f"/admin/polls/{poll['id']}", headers=admin, json={"question": "Другой вопрос"})
        ).status_code in (404, 405)


async def test_poll_close_race_and_member_erasure(database_app):
    app = database_app
    alumni_id, member = await account(app)
    _, admin = await account(app, "admin")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        poll = await draft(client, admin)
        await client.post(f"/admin/polls/{poll['id']}/launch", headers=admin)
        replies = await asyncio.gather(
            client.post(f"/me/polls/{poll['id']}/vote", headers=member, json={"option_id": poll["options"][0]["id"]}),
            client.post(f"/admin/polls/{poll['id']}/close", headers=admin),
        )
        assert replies[0].status_code in (200, 409) and replies[1].status_code == 200
        results = (await client.get("/admin/polls", headers=admin)).json()["items"][0]
        assert results["status"] == "closed" and results["total_votes"] == int(replies[0].status_code == 200)
        other = await draft(client, admin)
        await client.post(f"/admin/polls/{other['id']}/launch", headers=admin)
        await client.post(
            f"/me/polls/{other['id']}/vote", headers=member, json={"option_id": other["options"][1]["id"]}
        )
        exported = (await client.get("/me/export", headers=member)).json()
        assert any(vote["poll_id"] == other["id"] for vote in exported["poll_votes"])
        from club_api.modules.members.service import anonymize

        assert await anonymize(app.state, alumni_id)
        assert await app.state.database.rows("SELECT id FROM club_poll_votes WHERE alumni_id=%s", (alumni_id,)) == []
        assert (await client.get("/me/polls", headers=member)).status_code == 401
