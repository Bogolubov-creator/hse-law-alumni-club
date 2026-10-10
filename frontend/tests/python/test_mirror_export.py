from pathlib import Path

import pytest

from club_web import mirror

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.asyncio
async def test_export_rejects_page_with_missing_api_data(tmp_path, monkeypatch):
    original = mirror.snapshot

    def incomplete(data):
        result = original(data)
        del result["/admin/bot-status"]
        return result

    monkeypatch.setattr(mirror, "snapshot", incomplete)
    data = mirror.fixtures(ROOT)
    with pytest.raises(ValueError, match="/admin/support"):
        await mirror.export(tmp_path, "/", data)
