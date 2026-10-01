from asgiref.sync import markcoroutinefunction
from django.http import HttpResponse


class CorsMiddleware:
    sync_capable = False
    async_capable = True

    def __init__(self, get_response):
        self.get_response = get_response
        markcoroutinefunction(self)

    async def __call__(self, request):
        origin = request.headers.get("origin")
        allowed = {
            "https://web.telegram.org",
            "https://oauth.telegram.org",
            *[value.strip() for value in request.services.settings.CORS_ORIGINS.split(",") if value.strip()],
        }
        if request.method == "OPTIONS" and "access-control-request-method" in request.headers:
            valid = origin in allowed and request.headers["access-control-request-method"] in {
                "GET",
                "POST",
                "PATCH",
                "DELETE",
            }
            response = HttpResponse(status=200 if valid else 400)
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE"
            response.headers["Access-Control-Max-Age"] = "600"
            if headers := request.headers.get("access-control-request-headers"):
                response.headers["Access-Control-Allow-Headers"] = headers
        else:
            response = await self.get_response(request)
        if origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response
