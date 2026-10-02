from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from club_api.modules.support import storage


class TicketQuery:
    def __init__(self, ticket):
        self.ticket = ticket

    def filter(self, **kwargs):
        return self

    def exclude(self, **kwargs):
        return self

    def select_for_update(self):
        return self

    def first(self):
        return self.ticket


class StorageDatabase:
    @asynccontextmanager
    async def transaction(self):
        yield self

    async def lock(self, key):
        return True

    async def run(self, function):
        return function()


@pytest.mark.parametrize(
    ("count", "messages", "status", "allowed"),
    [
        (49, [{"text": "Последнее сообщение"}], "answered", True),
        (50, [{"text": "Лишнее сообщение"}], "answered", False),
        (50, [], "closed", True),
    ],
)
async def test_full_support_conversation_can_close_without_adding_messages(
    monkeypatch, count, messages, status, allowed
):
    ticket = SimpleNamespace(messages=[{"text": "Сообщение"}] * count, status="open", save=Mock())
    monkeypatch.setattr(storage, "SupportTickets", SimpleNamespace(objects=TicketQuery(ticket)))
    result = await storage.change_ticket(StorageDatabase(), "ticket", messages=messages, status=status)
    assert bool(result) is allowed
    assert len(ticket.messages) == (count + len(messages) if allowed else count)
    if allowed:
        assert ticket.status == status
        ticket.save.assert_called_once()
    else:
        ticket.save.assert_not_called()
