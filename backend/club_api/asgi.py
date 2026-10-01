import logging
import os

import django
from django.conf import settings as django_settings
from django.core.handlers.asgi import ASGIHandler

logger = logging.getLogger("club.api")


def initialize_django():
    if not django_settings.configured:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "club_api.django_settings")
        django.setup()


class RequestHandler(ASGIHandler):
    def create_request(self, scope, body_file):
        request, error = super().create_request(scope, body_file)
        if request:
            request.services = scope["club.services"]
            request.background_tasks = scope["club.background_tasks"]
        return request, error


class Application:
    def __init__(self, state, lifespan):
        initialize_django()
        self.state, self.lifespan = state, lifespan
        self.handler = RequestHandler()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.serve_lifespan(receive, send)
        tasks = []
        scope = {**scope, "club.services": self.state, "club.background_tasks": tasks}
        await self.handler(scope, receive, send)
        for function, args, kwargs in tasks:
            try:
                await function(*args, **kwargs)
            except Exception:
                logger.error("Не удалось выполнить отложенное действие")

    async def serve_lifespan(self, receive, send):
        await receive()
        started = False
        try:
            async with self.lifespan(self):
                await send({"type": "lifespan.startup.complete"})
                started = True
                await receive()
        except Exception:
            logger.error("Ошибка жизненного цикла приложения")
            phase = "shutdown" if started else "startup"
            await send({"type": f"lifespan.{phase}.failed", "message": "Ошибка жизненного цикла приложения"})
            raise
        await send({"type": "lifespan.shutdown.complete"})
