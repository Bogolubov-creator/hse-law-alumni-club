import asyncio
import json
import math
import os
import re
import signal
import ssl
import sys
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx

ROUTES = {
    "ready": "/api/ready",
    "home": "/api/pages/home",
    "programs": "/api/programs",
    "products": "/api/products",
    "events": "/api/events",
    "podcasts": "/api/podcasts",
    "news": "/api/news?limit=20",
}
MAX_RESPONSE_BYTES = 8 * 1024 * 1024


def number(env, name, default, minimum, maximum, integer=True):
    raw = env.get(name, str(default))
    if not re.fullmatch(r"\d+(?:\.\d+)?", raw):
        raise ValueError(name + ": некорректное число")
    value = float(raw)
    if not math.isfinite(value) or integer and not value.is_integer() or not minimum <= value <= maximum:
        raise ValueError(f"{name}: допустимо от {minimum} до {maximum}")
    return int(value) if integer else value


def load_config(env=None):
    env = os.environ if env is None else env
    if env.get("LOAD_SYNTHETIC") != "true":
        raise ValueError("Требуется LOAD_SYNTHETIC=true для одноразового синтетического стенда")
    if env.get("NODE_TLS_REJECT_UNAUTHORIZED") == "0" or env.get("PYTHONHTTPSVERIFY") == "0":
        raise ValueError("Отключение проверки TLS запрещено")
    url = urlsplit(env.get("LOAD_BASE_URL", ""))
    if (
        url.scheme not in ("http", "https")
        or url.hostname not in ("localhost", "127.0.0.1", "::1")
        or url.username
        or url.password
        or url.path not in ("", "/")
        or url.query
        or url.fragment
    ):
        raise ValueError("LOAD_BASE_URL должен быть loopback origin без пути, credentials, query и fragment")
    _ = url.port
    endpoints = env.get("LOAD_ENDPOINTS", ",".join(ROUTES)).split(",")
    if len(endpoints) != len(set(endpoints)) or any(key not in ROUTES for key in endpoints):
        raise ValueError("LOAD_ENDPOINTS: неизвестные или повторяющиеся маршруты")
    return {
        "origin": f"{url.scheme}://{url.netloc}",
        "endpoints": endpoints,
        "caFile": env.get("HTTPS_CA_FILE"),
        "durationSeconds": number(env, "LOAD_DURATION_SECONDS", 30, 1, 300),
        "concurrency": number(env, "LOAD_CONCURRENCY", 2, 1, 8),
        "requestsPerSecond": number(env, "LOAD_REQUESTS_PER_SECOND", 5, 1, 10, False),
        "maxRequests": number(env, "LOAD_MAX_REQUESTS", 150, len(endpoints) + 1, 3000),
        "timeoutMs": number(env, "LOAD_TIMEOUT_MS", 5000, 100, 10000),
    }


def latency(values):
    values = sorted(values)
    if not values:
        return dict(samples=0, minMs=None, p50Ms=None, p95Ms=None, p99Ms=None, maxMs=None)

    def percentile(value):
        return round(values[math.ceil(value * len(values)) - 1], 3)

    return dict(
        samples=len(values),
        minMs=round(values[0], 3),
        p50Ms=percentile(0.5),
        p95Ms=percentile(0.95),
        p99Ms=percentile(0.99),
        maxMs=round(values[-1], 3),
    )


def summarize(samples):
    codes = {}
    for sample in samples:
        codes[sample["code"]] = codes.get(sample["code"], 0) + 1
    successful = [sample for sample in samples if sample["ok"]]
    return dict(
        completed=len(samples),
        successful=len(successful),
        failed=len(samples) - len(successful),
        responseBytes=sum(sample["bytes"] for sample in samples),
        codes=codes,
        latency=latency([sample["ms"] for sample in samples]),
        successfulLatency=latency([sample["ms"] for sample in successful]),
    )


async def request(client, endpoint, timeout_ms):
    started, size, code, ok = time.monotonic(), 0, "NETWORK_ERROR", False
    try:
        async with (
            asyncio.timeout(timeout_ms / 1000),
            client.stream(
                "GET", ROUTES[endpoint], headers={"accept": "application/json", "user-agent": "club-synthetic-load/1"}
            ) as response,
        ):
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES:
                    code = "RESPONSE_TOO_LARGE"
                    break
            else:
                is_json = response.headers.get("content-type", "").split(";")[0].lower() == "application/json"
                code = "NON_JSON_200" if response.status_code == 200 and not is_json else str(response.status_code)
                ok = response.status_code == 200 and is_json
    except TimeoutError, httpx.TimeoutException:
        code = "TIMEOUT"
    except httpx.HTTPError:
        code = "NETWORK_ERROR"
    return dict(endpoint=endpoint, code=code, ok=ok, bytes=size, ms=(time.monotonic() - started) * 1000)


async def measure(config, stopped=None):
    stopped = stopped or asyncio.Event()
    context = ssl.create_default_context(cafile=config.get("caFile"))
    tls = config["origin"].startswith("https:")
    started_at = datetime.now(UTC).isoformat()
    warmup, samples, running = [], [], set()
    reason, sent, failures = "duration", 0, 0
    async with httpx.AsyncClient(
        base_url=config["origin"],
        verify=context,
        trust_env=False,
        follow_redirects=False,
        limits=httpx.Limits(max_connections=config["concurrency"]),
    ) as client:
        for endpoint in config["endpoints"]:
            if stopped.is_set():
                reason = "interrupted"
                break
            sample = await request(client, endpoint, config["timeoutMs"])
            warmup.append(sample)
            if not sample["ok"]:
                reason = "warmup_failed"
                break
        started = time.monotonic()
        deadline, next_at = started + config["durationSeconds"], started

        async def work(endpoint):
            nonlocal reason, failures
            sample = await request(client, endpoint, config["timeoutMs"])
            samples.append(sample)
            failures = 0 if sample["ok"] else failures + 1
            if sample["code"] == "429":
                reason = "rate_limited"
            elif failures >= 3 and reason != "rate_limited":
                reason = "consecutive_errors"

        while (
            reason == "duration"
            and not stopped.is_set()
            and sent + len(warmup) < config["maxRequests"]
            and time.monotonic() < deadline
        ):
            running = {task for task in running if not task.done()}
            if len(running) >= config["concurrency"]:
                await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
                continue
            delay = min(next_at, deadline) - time.monotonic()
            if delay > 0:
                try:
                    await asyncio.wait_for(stopped.wait(), timeout=delay)
                except TimeoutError:
                    pass
            if stopped.is_set() or reason != "duration" or time.monotonic() >= deadline:
                break
            task = asyncio.create_task(work(config["endpoints"][sent % len(config["endpoints"])]))
            running.add(task)
            sent += 1
            next_at = time.monotonic() + 1 / config["requestsPerSecond"]
        if stopped.is_set():
            reason = "interrupted"
        elif sent + len(warmup) >= config["maxRequests"] and reason == "duration":
            reason = "max_requests"
        if running:
            await asyncio.gather(*running)
        elapsed = time.monotonic() - started
    return {
        "schema": 1,
        "mode": "synthetic-local-read-only",
        "startedAt": started_at,
        "origin": config["origin"],
        "tlsVerification": ("provided-ca" if config.get("caFile") else "system-ca") if tls else "http-loopback",
        "config": {
            key: config[key]
            for key in ("durationSeconds", "concurrency", "requestsPerSecond", "maxRequests", "timeoutMs")
        },
        "stopReason": reason,
        "sent": sent,
        "totalRequests": sent + len(warmup),
        "elapsedSeconds": round(elapsed, 3),
        "throughputPerSecond": round(len(samples) / elapsed, 3) if elapsed else 0,
        "warmup": [
            {**{key: sample[key] for key in ("code", "ok", "ms")}, "endpoint": ROUTES[sample["endpoint"]]}
            for sample in warmup
        ],
        **summarize(samples),
        "endpoints": {
            ROUTES[key]: summarize([sample for sample in samples if sample["endpoint"] == key])
            for key in config["endpoints"]
        },
        "interpretation": "Это ограниченный замер на синтетических данных; малое число наблюдений не даёт устойчивый p99.",
    }


async def main():
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(name, stopped.set)
    try:
        report = await measure(load_config(), stopped)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return int(bool(report["failed"] or report["stopReason"] in ("warmup_failed", "interrupted")))
    except ValueError, OSError:
        print("Не удалось подготовить замер: проверьте параметры и доверенный CA.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
