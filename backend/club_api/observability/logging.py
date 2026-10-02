import json
import logging


class JsonFormatter(logging.Formatter):
    def format(self, record):
        event = {
            "time": int(record.created * 1000),
            "level": record.levelno + 10,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for name in ("job", "status", "duration_ms"):
            if hasattr(record, name):
                event[name] = getattr(record, name)
        return json.dumps(event, ensure_ascii=False, separators=(",", ":"))
