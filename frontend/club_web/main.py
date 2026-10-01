import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.background import BackgroundTask

from club_web.client import Api, forwarded_headers
from club_web.formatting import FORMAT_LABELS, date, media, page_items, payment_url, rub, safe_url
from club_web.pages import context

ROOT = Path(__file__).parent
PUBLIC = ROOT / "public" if (ROOT / "public").exists() else ROOT.parent / "public"
CSP = "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src https://rutube.ru https://www.rutube.ru; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org 'self'"


def templates():
    renderer = Jinja2Templates(directory=ROOT / "templates")
    renderer.env.filters.update(
        rub=rub, date=date, safe_url=safe_url, payment_url=payment_url, media=media, page_items=page_items
    )
    renderer.env.globals.update(format_labels=FORMAT_LABELS)
    return renderer


def create_app(client=None):
    @asynccontextmanager
    async def lifespan(app):
        if client:
            app.state.client = client
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

    app = FastAPI(
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        redirect_slashes=False,
        telemetry={
            "tracing": False,
            "metrics": False,
            "logs": False,
            "operation_spans": False,
            "auto_configure": False,
        },
    )
    if client:
        app.state.client = client
    renderer = templates()

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("content-security-policy", CSP)
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("referrer-policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        if request.url.path == "/sw.js" or request.url.path.endswith((".js", ".css")):
            response.headers["cache-control"] = "no-cache"
        elif request.url.path.startswith(("/assets/", "/fonts/")):
            response.headers["cache-control"] = "public, max-age=300"
        else:
            response.headers["cache-control"] = "no-store"
        return response

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "club-web"}

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
    async def api_proxy(request: Request, path: str):
        try:
            size = int(request.headers.get("content-length", "0"))
            if size < 0:
                raise ValueError
        except ValueError:
            return JSONResponse({"error": "Некорректный размер запроса"}, status_code=400)
        maximum = 129 * 1024 * 1024 if path == "admin/media" else 4 * 1024 * 1024 if path == "me/avatar" else 256 * 1024
        if size > maximum:
            return JSONResponse({"error": "Запрос превышает допустимый размер"}, status_code=413)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > maximum:
                return JSONResponse({"error": "Запрос превышает допустимый размер"}, status_code=413)
        outgoing = {
            key: value
            for key, value in request.headers.items()
            if key.lower()
            in (
                "authorization",
                "accept",
                "content-type",
                "x-cart-session",
                "idempotency-key",
                "x-support-token",
                "x-support-access",
                "x-support-key",
                "range",
            )
        }
        try:
            outgoing_request = app.state.client.build_request(
                request.method,
                "/" + path.lstrip("/"),
                params=request.query_params,
                headers=outgoing,
                content=bytes(body),
            )
            response = await app.state.client.send(outgoing_request, stream=True)
        except httpx.HTTPError:
            return JSONResponse({"error": "Сервис временно недоступен. Попробуйте позже."}, status_code=503)
        response_headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower()
            in (
                "content-type",
                "content-disposition",
                "cache-control",
                "content-security-policy",
                "etag",
                "last-modified",
                "content-range",
                "accept-ranges",
                "location",
            )
        }
        return StreamingResponse(
            response.aiter_bytes(),
            status_code=response.status_code,
            headers=response_headers,
            background=BackgroundTask(response.aclose),
        )

    @app.get("/views/{path:path}")
    async def fragment(request: Request, path: str):
        page_path = "/" + path
        supplied = forwarded_headers(request)
        data = await context(
            Api(app.state.client, supplied), page_path, dict(request.query_params), "authorization" in supplied
        )
        if data.get("access_error") == 401:
            return JSONResponse({"error": "Сессия завершилась. Войдите снова."}, status_code=401)
        data.update(request=request, fragment=True, base="/", mirror=False)
        return renderer.TemplateResponse(
            request=request, name=data["template"], context=data, status_code=data["status"]
        )

    app.mount("/assets", StaticFiles(directory=PUBLIC / "assets"), name="assets")
    app.mount("/fonts", StaticFiles(directory=PUBLIC / "fonts"), name="fonts")

    @app.get("/{path:path}")
    async def page(request: Request, path: str):
        if path.endswith("/") and path:
            return RedirectResponse(
                "/" + path.rstrip("/") + ("?" + request.url.query if request.url.query else ""), status_code=308
            )
        if path.startswith(("v2/", "legacy/")) or path in ("v2", "legacy"):
            next_path = "/" + path.partition("/")[2]
            return RedirectResponse(next_path + ("?" + request.url.query if request.url.query else ""), status_code=308)
        static_files = {
            "sw.js",
            "manifest.webmanifest",
            "offline.html",
            "favicon.ico",
            "icon-192.png",
            "icon-512.png",
            "icon-maskable-512.png",
            "icon-180.png",
            "icon-152.png",
            "icon-167.png",
        }
        if path in static_files and (PUBLIC / path).is_file():
            from starlette.responses import FileResponse

            return FileResponse(PUBLIC / path)
        supplied = forwarded_headers(request)
        data = await context(
            Api(app.state.client, supplied), "/" + path, dict(request.query_params), "authorization" in supplied
        )
        data.update(request=request, fragment=False, base="/", mirror=False)
        return renderer.TemplateResponse(
            request=request, name=data["template"], context=data, status_code=data["status"]
        )

    return app


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
