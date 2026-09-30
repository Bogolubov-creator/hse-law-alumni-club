import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from club_api.modules.notifications.push import EndpointBody, PublicResolver, PushSession


@pytest.mark.parametrize(
    "value",
    [
        "https://127.0.0.1/push",
        "https://[::1]/push",
        "https://10.0.0.2/push",
        "https://metadata.internal/push",
        "http://push.example.test",
        "https://user:pass@push.example.test",
    ],
)
def test_private_push_endpoint_rejected(value):
    with pytest.raises(ValueError):
        EndpointBody.endpoint_valid(value)


async def test_dns_answers_pinned_and_private_or_mixed_blocked():
    resolver = PublicResolver()
    public = {
        "hostname": "push.example.test",
        "host": "8.8.8.8",
        "port": 443,
        "family": socket.AF_INET,
        "proto": 0,
        "flags": 0,
    }
    resolver.resolver = SimpleNamespace(resolve=AsyncMock(return_value=[public]), close=AsyncMock())
    assert await resolver.resolve("push.example.test", 443) == [public]
    resolver.resolver.resolve.return_value = [public, {**public, "host": "127.0.0.1"}]
    with pytest.raises(OSError):
        await resolver.resolve("push.example.test", 443)
    await resolver.close()


async def test_push_redirects_not_followed():
    session = SimpleNamespace(post=AsyncMock(return_value=SimpleNamespace(status=302)))
    assert (
        await PushSession(session).post("https://push.example.test", timeout=10, data=b"encrypted", headers={})
    ).status == 302
    assert session.post.call_args.kwargs["allow_redirects"] is False
