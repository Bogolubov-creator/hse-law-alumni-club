import os
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx

from club_web.asgi import Application


def create_app(client=None):
    @asynccontextmanager
    async def lifespan(app):
        if client:
            yield
        else:
            async with httpx.AsyncClient(
                base_url=os.environ.get("API_INTERNAL_URL", "http://127.0.0.1:3000"),
                timeout=15,
                follow_redirects=False,
                trust_env=False,
            ) as upstream:
                app.state.client = upstream
                yield

    return Application(SimpleNamespace(client=client), lifespan)


def run():
    import uvicorn

    uvicorn.run(
        create_app(),
        host=os.environ.get("WEB_HOST", "127.0.0.1"),
        port=int(os.environ.get("WEB_PORT", "5173")),
        proxy_headers=False,
        access_log=False,
    )


if __name__ == "__main__":
    run()
