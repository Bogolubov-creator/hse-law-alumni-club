import asyncio
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from club_api.jobs.tasks import scheduled

logger = logging.getLogger("club.jobs")


class Jobs:
    def __init__(self, state):
        self.state, self.running, self.scheduler = state, {}, None
        self.stopped = False
        self.last_minute = None

    def run(self, id, operation):
        if self.stopped or id in self.running:
            return None

        async def execute():
            started = time.monotonic()
            try:
                await operation()
                duration = round((time.monotonic() - started) * 1000)
                logger.info(
                    "Задание %s выполнено за %d мс",
                    id,
                    duration,
                    extra={"job": id, "status": "ok", "duration_ms": duration},
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                from club_api.observability.errors import capture

                capture("job_failed")
                logger.error("Задание %s завершилось с ошибкой", id, extra={"job": id, "status": "failed"})
            finally:
                self.running.pop(id, None)

        task = asyncio.create_task(execute(), name="club-job-" + id)
        self.running[id] = task
        return task

    def tick(self, now):
        key = (now.year, now.month, now.day, now.hour, now.minute)
        if self.last_minute == key:
            return
        self.last_minute = key
        for id, due, operation in scheduled(self.state):
            if due(now):
                self.run(id, operation)

    async def loop(self):
        while True:
            self.tick(datetime.now(ZoneInfo("Europe/Moscow")))
            await asyncio.sleep(5)

    async def start(self):
        if self.state.settings.JOBS_ENABLED == "false" or not self.state.database.pool:
            return
        task = self.run(
            "support-startup-retention",
            lambda: self.state.database.execute("DELETE FROM club_support_tickets WHERE expires_at<=now()"),
        )
        await task
        self.scheduler = asyncio.create_task(self.loop(), name="club-scheduler")
        if self.state.settings.secret("TELEGRAM_BOT_TOKEN"):
            self.run("telegram-commands", self.state.telegram.commands)
            if self.state.settings.TELEGRAM_POLLING == "true":
                self.state.telegram.polling = asyncio.create_task(
                    self.state.telegram.poll(), name="club-telegram-polling"
                )

    async def stop(self):
        self.stopped = True
        if self.scheduler:
            self.scheduler.cancel()
            await asyncio.gather(self.scheduler, return_exceptions=True)
        await self.state.telegram.stop()
        if self.running:
            tasks = list(self.running.values())
            _, pending = await asyncio.wait(tasks, timeout=20)
            if pending:
                logger.warning("Время остановки фоновых заданий истекло")
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
