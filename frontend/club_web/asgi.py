import os

import django
from django.conf import settings
from django.core.handlers.asgi import ASGIHandler
from django.http import JsonResponse


class BodyTooLarge(Exception):
    pass


def initialize_django():
    if not settings.configured:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "club_web.django_settings")
        django.setup()


class RequestHandler(ASGIHandler):
    def create_request(self, scope, body_file):
        request, error = super().create_request(scope, body_file)
        if request:
            request.services = scope["club.services"]
        return request, error


class Application:
    def __init__(self, state, lifespan):
        initialize_django()
        self.state, self.lifespan = state, lifespan
        self.handler = RequestHandler()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.serve_lifespan(receive, send)
        scope = {**scope, "club.services": self.state}
        path = scope["path"]
        maximum = (
            129 * 1024 * 1024
            if path == "/api/admin/media"
            else 4 * 1024 * 1024
            if path == "/api/me/avatar"
            else 256 * 1024
        )
        size = 0

        async def bounded_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > maximum:
                raise BodyTooLarge
            return message

        try:
            await self.handler(scope, bounded_receive, send)
        except BodyTooLarge:
            response = JsonResponse({"error": "Запрос превышает допустимый размер"}, status=413)
            await send(
                {
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [(key.lower().encode(), value.encode()) for key, value in response.headers.items()],
                }
            )
            await send({"type": "http.response.body", "body": response.content})

    async def serve_lifespan(self, receive, send):
        await receive()
        async with self.lifespan(self):
            await send({"type": "lifespan.startup.complete"})
            await receive()
        await send({"type": "lifespan.shutdown.complete"})
