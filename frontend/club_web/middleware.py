from asgiref.sync import markcoroutinefunction

CSP = "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src https://rutube.ru https://www.rutube.ru; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org 'self'"


class HeadersMiddleware:
    sync_capable = False
    async_capable = True

    def __init__(self, get_response):
        self.get_response = get_response
        markcoroutinefunction(self)

    async def __call__(self, request):
        response = await self.get_response(request)
        response.headers.setdefault("Content-Security-Policy", CSP)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        if response.headers.get("X-Club-Offline") == "public":
            response.headers["Cache-Control"] = "no-cache"
        elif request.path == "/sw.js" or request.path.endswith((".js", ".css")):
            response.headers["Cache-Control"] = "no-cache"
        elif request.path.startswith(("/assets/", "/fonts/")):
            response.headers["Cache-Control"] = "public, max-age=300"
        else:
            response.headers["Cache-Control"] = "no-store"
        return response
