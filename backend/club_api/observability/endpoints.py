from datetime import UTC, datetime

from django.http import JsonResponse

from club_api.core.views import api_view
from club_api.observability.health import build_health


@api_view
async def health(request):
    return {"status": "ok", "service": "club-api", "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z")}


@api_view
async def ready(request):
    report = await build_health(request.services)
    ready = all(check["status"] == "ok" for check in report["checks"] if check["id"] in ("storage", "database"))
    return JsonResponse({"status": "ok" if ready else "degraded"}, status=200 if ready else 503)
