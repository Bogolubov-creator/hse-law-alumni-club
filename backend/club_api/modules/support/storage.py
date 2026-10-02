from datetime import timedelta

from django.utils import timezone

from club_api.db.models import SupportTickets


async def create_ticket(database, body, config, key_hash, request_hash, messages):
    async with database.transaction() as connection:
        await connection.lock("support:" + body.id)

        def create():
            if SupportTickets.objects.filter(pk=body.id).exists():
                return []
            obj = SupportTickets.objects.create(
                id=body.id,
                key_hash=key_hash,
                request_hash=request_hash,
                topic=body.topic,
                messages=messages,
                consent_version=config["version"],
                consent_text=config["consent"],
                expires_at=timezone.now() + timedelta(days=config["retentionDays"]),
            )
            return [{"id": obj.pk}]

        return await connection.run(create)


async def change_ticket(database, id, *, key_hash=None, messages=None, status=None, days=30, delete=False):
    async with database.transaction() as connection:
        await connection.lock("support:" + str(id))

        def change():
            query = SupportTickets.objects.filter(pk=id)
            if key_hash:
                query = query.filter(key_hash=key_hash)
            if not delete:
                query = query.filter(expires_at__gt=timezone.now())
                if key_hash:
                    query = query.exclude(status="closed")
            obj = query.select_for_update().first()
            if not obj or (not delete and messages and len(obj.messages) >= 50):
                return []
            if delete:
                obj.delete()
            else:
                obj.messages += messages or []
                obj.status = status or "open"
                obj.updated_at = timezone.now()
                obj.expires_at = obj.updated_at + timedelta(days=days)
                obj.save(update_fields=("messages", "status", "updated_at", "expires_at"))
            return [{"id": id}]

        return await connection.run(change)
