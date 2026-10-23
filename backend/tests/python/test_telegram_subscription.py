from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from test_community_integration import account

from club_api.domain import ACHIEVEMENTS
from club_api.modules.gamification.social import social_progress


@pytest.mark.parametrize(
    "member,expected",
    [
        ({"status": "creator"}, "subscribed"),
        ({"status": "administrator"}, "subscribed"),
        ({"status": "member"}, "subscribed"),
        ({"status": "restricted", "is_member": True}, "subscribed"),
        ({"status": "restricted", "is_member": False}, "not_subscribed"),
        ({"status": "left"}, "not_subscribed"),
        ({"status": "kicked"}, "not_subscribed"),
    ],
)
async def test_subscription_status_comes_from_telegram(member, expected):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True, "result": member}))
    ) as client:
        state = SimpleNamespace(
            client=client,
            database=SimpleNamespace(pool=True, rows=AsyncMock(return_value=[]), execute=AsyncMock()),
            settings=SimpleNamespace(secret=lambda name: "synthetic-token", TELEGRAM_REACTIONS_CHAT_ID=""),
        )
        result = await social_progress(state, "owner", "12345")
        assert result["subscription"] == expected
        assert result["telegram_subscribed"] == int(expected == "subscribed")
        assert state.database.execute.await_args.args[1] == ("owner", "12345", expected == "subscribed")


@pytest.mark.parametrize("cached", [True, False])
async def test_unavailable_telegram_does_not_grant_or_cache_subscription(cached):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(400, json={"ok": False}))
    ) as client:
        state = SimpleNamespace(
            client=client,
            database=SimpleNamespace(
                pool=True, rows=AsyncMock(return_value=[{"subscribed": cached}]), execute=AsyncMock()
            ),
            settings=SimpleNamespace(secret=lambda name: "synthetic-token", TELEGRAM_REACTIONS_CHAT_ID=""),
        )
        result = await social_progress(state, "owner", "12345", refresh=True)
        assert result["subscription"] == "unavailable" and result["telegram_subscribed"] == 0
        state.database.execute.assert_not_awaited()


async def test_subscription_check_saves_one_achievement_and_uses_linked_identity(database_app):
    app = database_app
    state = app.state
    alumni_id, headers = await account(app)
    await state.database.execute("UPDATE alumni SET telegram_id='12345' WHERE id=%s", (alumni_id,))
    achievement = await state.store.create(
        "achievements", next(item for item in ACHIEVEMENTS if item["key"] == "on_radar")
    )
    state.settings.TELEGRAM_BOT_TOKEN = SecretStr("synthetic-token")
    replies = iter(("left", "member", "member"))
    calls = []

    def telegram(request):
        import json

        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True, "result": {"status": next(replies)}})

    previous = state.client
    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(telegram)) as telegram_client,
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client,
    ):
        state.client = telegram_client
        try:
            profile = (await client.get("/me", headers=headers)).json()
            assert profile["social"]["subscription"] == "not_subscribed"
            for _ in range(2):
                checked = await client.post("/me/telegram-subscription", headers=headers, json={"user_id": "99999"})
                assert checked.status_code == 200 and checked.json() == {"subscription": "subscribed"}
            profile = (await client.get("/me", headers=headers)).json()
            assert next(item for item in profile["achievements"] if item["key"] == "on_radar")["earned"]
        finally:
            state.client = previous
    assert calls == [{"chat_id": "@AlumniLawHSE", "user_id": 12345}] * 3
    awards = await state.store.read("alumni_achievements", filters={"alumni_id": {"_eq": alumni_id}})
    assert len(awards) == 1 and awards[0]["achievement_id"] == achievement["id"]
    assert not await state.store.read("points_ledger", filters={"alumni_id": {"_eq": alumni_id}})


async def test_subscription_check_requires_verified_linked_account(database_app):
    app = database_app
    _, pending = await account(app, verified=False)
    _, member = await account(app)
    _, editor = await account(app, "editor")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        for headers, status in (({}, 401), (pending, 403), (editor, 401), (member, 503)):
            assert (await client.post("/me/telegram-subscription", headers=headers)).status_code == status
        app.state.settings.TELEGRAM_BOT_TOKEN = SecretStr("synthetic-token")
        assert (await client.post("/me/telegram-subscription", headers=member)).status_code == 400


@pytest.mark.parametrize(
    "membership_id,minutes,earned", [("12345", 1, True), ("12345", 10, False), ("67890", 1, False)]
)
async def test_stale_or_other_telegram_membership_does_not_grant_achievement(
    database_app, membership_id, minutes, earned
):
    from datetime import UTC, datetime, timedelta

    state = database_app.state
    alumni_id, _ = await account(database_app)
    state.settings.TELEGRAM_BOT_TOKEN = SecretStr("synthetic-token")
    await state.database.execute("UPDATE alumni SET telegram_id='12345' WHERE id=%s", (alumni_id,))
    await state.store.create("achievements", next(item for item in ACHIEVEMENTS if item["key"] == "on_radar"))
    await state.database.execute(
        "INSERT INTO club_social_membership(alumni_id,telegram_id,subscribed,checked_at) VALUES(%s,%s,true,%s)",
        (alumni_id, membership_id, datetime.now(UTC) - timedelta(minutes=minutes)),
    )
    await state.gamification.refresh_achievements(alumni_id)
    assert bool(await state.store.read("alumni_achievements", filters={"alumni_id": {"_eq": alumni_id}})) is earned


async def test_configured_reactions_grant_one_social_achievement(database_app):
    state = database_app.state
    alumni_id, _ = await account(database_app)
    await state.database.execute("UPDATE alumni SET telegram_id='12345' WHERE id=%s", (alumni_id,))
    state.settings.TELEGRAM_BOT_TOKEN = SecretStr("synthetic-token")
    state.settings.TELEGRAM_REACTIONS_CHAT_ID = "-10012345"
    definition = await state.store.create(
        "achievements", next(item for item in ACHIEVEMENTS if item["key"] == "on_wave")
    )
    for message_id in range(10):
        await state.database.execute(
            "INSERT INTO club_social_reactions(alumni_id,chat_id,message_id,active,event_at) VALUES(%s,%s,%s,true,1)",
            (alumni_id, "-10012345", message_id),
        )
    for _ in range(2):
        await state.gamification.refresh_achievements(alumni_id)
    awards = await state.store.read("alumni_achievements", filters={"alumni_id": {"_eq": alumni_id}})
    assert len(awards) == 1 and awards[0]["achievement_id"] == definition["id"]
