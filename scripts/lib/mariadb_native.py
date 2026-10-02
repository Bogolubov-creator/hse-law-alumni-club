import argparse
import json
import os
import pathlib
import subprocess
import sys
import time

from mariadb_backup import backup, restore
from mariadb_common import (
    Context,
    output,
    read_env,
    record,
    revision,
    sql,
)
from mariadb_install import install as install
from mariadb_install import prepare_restore


def preflight(context):
    revision()
    configuration = json.loads(context.capture("--profile", "operator", "config", "--format", "json"))
    for name in ("api", "web", "operator"):
        if configuration["services"][name].get("ports"):
            raise ValueError("Порты API, web и оператора не должны публиковаться")
    if context.runtime.get("APP_ENV") != "production" or context.runtime.get("SEED_DEMO") != "false":
        raise ValueError("Нужны APP_ENV=production и SEED_DEMO=false")
    output(["systemctl", "is-active", "mariadb"])
    sql("SELECT 1", context.database)
    print("Preflight: закрытая конфигурация, локальная база и чистый checkout проверены")


def monitor(context):
    context.verify_http()
    for service in ("api", "web", "nginx"):
        container = context.capture("ps", "-q", service)
        if not container or output(["docker", "inspect", "-f", "{{.State.Health.Status}}", container]) != "healthy":
            raise ValueError("Сервис не готов: " + service)
    previous = context.state / "last-backup.json"
    if not previous.exists() or time.time() - json.loads(previous.read_text())["completed_at"] > 36 * 3600:
        raise ValueError("Нет успешной копии за последние 36 часов")
    print("Мониторинг: сайт, API, TLS, контейнеры и свежесть копии проверены")


def deploy(context):
    commit = revision()
    if os.geteuid() != 0:
        raise ValueError("Обслуживание нативной MariaDB выполняется через sudo")
    preflight(context)
    context.execute("--profile", "operator", "build", "--build-arg", "VCS_REF=" + commit, "api", "web", "operator")
    context.execute(
        "run",
        "--rm",
        "-T",
        "--no-deps",
        "api",
        "python",
        "-c",
        "from club_api.core.config import load_settings; s=load_settings(); e=s.production_errors(); "
        'e += [] if s.APP_ENV == "production" else ["Нужен production"]; '
        'assert not e, "\\n".join(e)',
    )
    running = bool(context.capture("ps", "--status", "running", "-q", "api"))
    if running:
        backup(context)
    context.stop_writers()
    try:
        context.operator_command("migrate")
        context.operator_command("configure-mariadb-role")
        context.operator_command("bootstrap")
        if context.values.get("COMPOSE_PROFILES") == "local":
            context.execute("up", "-d", "mailpit")
        context.execute("up", "-d", "--wait", "api", "web")
        context.execute("up", "-d", "--wait", "--force-recreate", "nginx")
        context.verify_http()
        operator_image = output(["docker", "image", "inspect", "-f", "{{.Id}}", context.values["CLUB_OPERATOR_IMAGE"]])
        record(
            context,
            "last-deploy",
            {"commit": commit, "operator_image": operator_image, "finished_at": int(time.time()), "status": "ok"},
        )
    except BaseException:
        record(context, "last-deploy-attempt", {"commit": commit, "finished_at": int(time.time()), "status": "failed"})
        context.stop_writers()
        raise
    print("Обновление проверено: TLS, сайт и /api/ready; ревизия " + commit)


def main():
    parser = argparse.ArgumentParser(description="Обслуживание MariaDB/nginx")
    parser.add_argument(
        "command", choices=("detect", "preflight", "monitor", "deploy", "backup", "prepare-restore", "restore")
    )
    parser.add_argument("--snapshot", type=pathlib.Path)
    parser.add_argument("--target-env", type=pathlib.Path)
    parser.add_argument("--config-dir", type=pathlib.Path)
    parser.add_argument("--port", type=int, default=9543)
    parser.add_argument("--mail-port", type=int, default=8125)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        path = os.environ.get("ENV_FILE", "")
        if args.command == "detect":
            return 0 if path and read_env(path).get("CLUB_STACK") == "mariadb" else 1
        if os.geteuid() != 0:
            raise ValueError("Запустите обслуживание через sudo")
        context = Context(path)
        with context.lock():
            if args.command == "deploy":
                deploy(context)
            elif args.command == "preflight":
                preflight(context)
            elif args.command == "monitor":
                monitor(context)
            elif args.command == "backup":
                backup(context)
            elif args.command == "prepare-restore":
                if args.config_dir is None:
                    raise ValueError("Укажите --config-dir вне checkout")
                prepare_restore(context, args.config_dir, args.port, args.mail_port)
            else:
                restore(context, args.snapshot, args.target_env)
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError):
        print(
            "Операция не завершена; проверьте закрытую конфигурацию, права и журнал предыдущего этапа", file=sys.stderr
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
