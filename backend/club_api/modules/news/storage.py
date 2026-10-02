from django.db import transaction

from club_api.db.models import NewsInbox
from club_api.modules.checkout.store import digest


def merge_candidate(source, item):
    with transaction.atomic():
        candidate, _ = NewsInbox.objects.get_or_create(
            source_url=item["source_url"],
            defaults={
                "id": digest(item["source_url"]),
                "sources": [source],
                "title": item["title"],
                "published_at": item["published_at"],
            },
        )
        candidate = NewsInbox.objects.select_for_update().get(pk=candidate.pk)
        candidate.sources = sorted(set(candidate.sources or []) | {source})
        candidate.published_at = candidate.published_at or item["published_at"]
        candidate.save(update_fields=("sources", "published_at"))
