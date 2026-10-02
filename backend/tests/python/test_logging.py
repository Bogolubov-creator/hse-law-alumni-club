import json
import logging
from types import SimpleNamespace

from club_api.jobs.runner import Jobs
from club_api.observability.logging import JsonFormatter


def test_structured_logs_preserve_monitor_contract_without_exception_payload():
    record = logging.LogRecord("club.api", logging.ERROR, "source.py", 1, "Ошибка запроса", (), None)
    record.created = 123.456
    record.exc_info = (RuntimeError, RuntimeError("synthetic-private-detail"), None)
    record.password = "synthetic-private-detail"
    encoded = JsonFormatter().format(record)
    assert json.loads(encoded) == {"time": 123456, "level": 50, "logger": "club.api", "msg": "Ошибка запроса"}
    assert "synthetic-private-detail" not in encoded


async def test_completed_and_failed_jobs_are_visible_to_monitor(caplog):
    caplog.set_level(logging.INFO, logger="club.jobs")
    jobs = Jobs(SimpleNamespace())

    async def successful():
        return None

    async def failed():
        raise RuntimeError("synthetic-private-detail")

    await jobs.run("retention", successful)
    await jobs.run("mail-outbox", failed)
    events = [json.loads(JsonFormatter().format(record)) for record in caplog.records if record.name == "club.jobs"]
    assert [(event["job"], event["status"], event["level"]) for event in events] == [
        ("retention", "ok", 30),
        ("mail-outbox", "failed", 50),
    ]
    assert events[0]["duration_ms"] >= 0
    assert all(isinstance(event["time"], int) for event in events)
    assert "synthetic-private-detail" not in json.dumps(events)
