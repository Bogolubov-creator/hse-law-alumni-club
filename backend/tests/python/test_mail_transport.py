import asyncio
from unittest.mock import AsyncMock

import pytest

from club_api.core.config import Settings
from club_api.modules.notifications.mail import Notifications


async def test_smtp_downgrade_refuses_authentication_and_message():
    commands = []

    async def relay(reader, writer):
        writer.write(b"220 synthetic SMTP\r\n")
        await writer.drain()
        try:
            while line := await reader.readline():
                commands.append(line)
                if line.upper().startswith(b"EHLO"):
                    writer.write(b"250-synthetic\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 100000\r\n")
                elif line.upper().startswith(b"QUIT"):
                    writer.write(b"221 goodbye\r\n")
                    await writer.drain()
                    break
                elif line.upper().startswith(b"AUTH"):
                    writer.write(b"235 authenticated\r\n")
                else:
                    writer.write(b"250 accepted\r\n")
                await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(relay, "127.0.0.1", 0)
    async with server:
        settings = Settings(
            AUTH_SECRET="synthetic-session-secret-for-tests-only",
            SMTP_HOST="127.0.0.1",
            SMTP_PORT=server.sockets[0].getsockname()[1],
            SMTP_USER="synthetic-user@example.test",
            SMTP_PASS="synthetic-password",
            SMTP_FROM="sender@example.test",
        )
        sender = Notifications(settings, None, None)
        assert not await sender.send_email("recipient@example.test", "Тест", "synthetic-recovery-token")
    assert any(command.upper().startswith(b"EHLO") for command in commands)
    assert not any(command.upper().startswith((b"AUTH", b"MAIL", b"RCPT", b"DATA")) for command in commands)


@pytest.mark.parametrize(
    ("host", "port", "user", "password", "public_url", "implicit", "start_tls"),
    [
        ("smtp.example.test", 465, "user", "synthetic", "https://club.example.test", True, False),
        ("smtp.example.test", 587, "user", "synthetic", "https://club.example.test", False, True),
        ("mailpit", 1025, "", "", "https://localhost:9543", False, False),
        ("mailpit", 1025, "user", "synthetic", "https://localhost:9543", False, True),
        ("mailpit", 1025, "", "", "https://club.example.test", False, True),
    ],
)
async def test_mailpit_exception_is_limited_to_local_no_credentials(
    monkeypatch, host, port, user, password, public_url, implicit, start_tls
):
    send = AsyncMock()
    monkeypatch.setattr("club_api.modules.notifications.mail.aiosmtplib.send", send)
    settings = Settings(
        AUTH_SECRET="synthetic-session-secret-for-tests-only",
        SMTP_HOST=host,
        SMTP_PORT=port,
        SMTP_USER=user,
        SMTP_PASS=password,
        SMTP_FROM="sender@example.test",
        PUBLIC_URL=public_url,
    )
    assert await Notifications(settings, None, None).send_email("recipient@example.test", "Тест", "Вымышленное письмо")
    options = send.await_args.kwargs
    assert options["use_tls"] is implicit and options["start_tls"] is start_tls
    assert options["validate_certs"] is True
