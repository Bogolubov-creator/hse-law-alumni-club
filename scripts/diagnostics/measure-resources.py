#!/usr/bin/env python3
import json
import os
import re
import signal
import subprocess
import time
from datetime import datetime, timezone


def setting(name, default, minimum, maximum):
    value = os.environ.get(name, str(default))
    if not value.isdecimal() or not minimum <= int(value) <= maximum:
        raise SystemExit(f"{name}: допустимо целое число от {minimum} до {maximum}")
    return int(value)


def docker(*args):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=5, check=True)
    return result.stdout


def cpu_ticks():
    with open("/proc/stat", encoding="ascii") as source:
        values = [int(value) for value in source.readline().split()[1:9]]
    return sum(values), values[3] + values[4]


def memory():
    with open("/proc/meminfo", encoding="ascii") as source:
        values = {line.split(":")[0]: int(line.split()[1]) * 1024 for line in source}
    return {"totalBytes": values["MemTotal"], "availableBytes": values["MemAvailable"], "swapUsedBytes": values["SwapTotal"] - values["SwapFree"]}


def memory_bytes(text):
    match = re.fullmatch(r"([\d.]+)(B|KiB|MiB|GiB|TiB|kB|MB|GB)", text.strip())
    if not match:
        return None
    scales = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4, "kB": 1000, "MB": 1000**2, "GB": 1000**3}
    return round(float(match[1]) * scales[match[2]])


def main():
    duration = setting("RESOURCE_DURATION_SECONDS", 40, 1, 360)
    interval = setting("RESOURCE_INTERVAL_SECONDS", 2, 1, 10)
    project = os.environ.get("LOAD_COMPOSE_PROJECT", "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", project):
        raise SystemExit("Требуется LOAD_COMPOSE_PROJECT выбранного синтетического стенда")
    if os.environ.get("LOAD_SYNTHETIC") != "true":
        raise SystemExit("Требуется LOAD_SYNTHETIC=true")
    ids = docker("ps", "-q", "--filter", f"label=com.docker.compose.project={project}").split()
    if not ids:
        raise SystemExit("У выбранного Compose-проекта нет работающих контейнеров")
    stopped = False

    def stop(_signal, _frame):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    started = time.monotonic()
    previous = cpu_ticks()
    summary = {"kind": "summary", "samples": 0, "dockerSampleErrors": 0, "cpuPeakPercent": 0, "load1Peak": 0, "memoryAvailableMinBytes": None, "diskAvailableMinBytes": None, "containers": {}}
    while not stopped and time.monotonic() - started < duration:
        cycle = time.monotonic()
        current = cpu_ticks()
        elapsed_ticks = current[0] - previous[0]
        cpu = 100 * (1 - (current[1] - previous[1]) / elapsed_ticks) if elapsed_ticks > 0 and summary["samples"] else None
        previous = current
        mem = memory()
        disk = os.statvfs("/")
        sample = {"kind": "sample", "at": datetime.now(timezone.utc).isoformat(), "elapsedSeconds": round(cycle - started, 3), "cpuPercent": None if cpu is None else round(cpu, 3), "cpuCount": os.cpu_count(), "load": os.getloadavg(), "memory": mem, "diskAvailableBytes": disk.f_bavail * disk.f_frsize, "containers": []}
        try:
            for line in docker("stats", "--no-stream", "--format", "{{json .}}", *ids).splitlines():
                row = json.loads(line)
                item = {"name": row["Name"], "cpuPercent": float(row["CPUPerc"].rstrip("%")), "memoryBytes": memory_bytes(row["MemUsage"].split("/")[0]), "pids": int(row["PIDs"]), "networkIO": row["NetIO"], "blockIO": row["BlockIO"]}
                sample["containers"].append(item)
                peaks = summary["containers"].setdefault(item["name"], {"cpuPeakPercent": 0, "memoryPeakBytes": 0, "pidsPeak": 0})
                for peak, key in [("cpuPeakPercent", "cpuPercent"), ("memoryPeakBytes", "memoryBytes"), ("pidsPeak", "pids")]:
                    peaks[peak] = max(peaks[peak], item[key] or 0)
        except (subprocess.SubprocessError, ValueError, KeyError):
            sample["dockerSampleError"] = True
            summary["dockerSampleErrors"] += 1
        summary["samples"] += 1
        summary["cpuPeakPercent"] = max(summary["cpuPeakPercent"], cpu or 0)
        summary["load1Peak"] = max(summary["load1Peak"], sample["load"][0])
        for target, value in [("memoryAvailableMinBytes", mem["availableBytes"]), ("diskAvailableMinBytes", sample["diskAvailableBytes"])]:
            summary[target] = value if summary[target] is None else min(summary[target], value)
        print(json.dumps(sample, ensure_ascii=False), flush=True)
        remaining = min(interval - (time.monotonic() - cycle), duration - (time.monotonic() - started))
        if remaining > 0 and not stopped:
            time.sleep(remaining)
    summary["elapsedSeconds"] = round(time.monotonic() - started, 3)
    summary["cpuPeakPercent"] = round(summary["cpuPeakPercent"], 3)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
