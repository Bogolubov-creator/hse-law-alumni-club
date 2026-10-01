import logging

from club_api.core.security import client_ip

logger = logging.getLogger("club.audit")


async def audit(request, event, *, actor="system", subject=None, detail=None):
    try:
        await request.services.store.create(
            "audit_log",
            {"event": event, "actor": actor, "subject": subject, "detail": detail, "ip": client_ip(request)},
        )
    except Exception:
        logger.error("Не удалось сохранить запись аудита")
