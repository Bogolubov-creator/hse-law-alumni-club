import argparse
import asyncio
import logging
import os
import sys
from urllib.parse import urlsplit

import httpx
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from club_ops.bootstrap import BootstrapConfig, OperatorError, bootstrap
from club_ops.office import Office
from club_ops.podcasts import import_podcasts
from club_ops.staff import manage_staff


async def database_command(command, values):
    if command == "manage-staff" and not values.get("STAFF_PASSWORD") and not sys.stdin.isatty():
        values["STAFF_PASSWORD"] = sys.stdin.read(102).removesuffix("\n").removesuffix("\r")
    async with await AsyncConnection.connect(
        values.get("DATABASE_URL", ""), row_factory=dict_row, connect_timeout=10
    ) as connection:
        if command == "bootstrap":
            result = await bootstrap(connection, BootstrapConfig.from_env(values))
            print(
                f"Bootstrap завершён: аккаунтов {result['createdUsers']}, записей {result['createdRows']}, главная создана: {result['createdHome']}"
            )
        else:
            result = await manage_staff(
                connection,
                action=values.get("STAFF_ACTION", "create"),
                address=values.get("STAFF_EMAIL", ""),
                role=values.get("STAFF_ROLE", "editor"),
                password=values.get("STAFF_PASSWORD", ""),
            )
            print(
                "Аккаунт сотрудника создан"
                if result == "created"
                else "Пароль сотрудника обновлён; прежние сессии отозваны"
            )


async def setup_webhook(values):
    token, secret = values.get("TELEGRAM_BOT_TOKEN"), values.get("TELEGRAM_WEBHOOK_SECRET")
    public = values.get("PUBLIC_URL", "").rstrip("/")
    url = urlsplit(public)
    if (
        not token
        or not secret
        or url.scheme != "https"
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path not in ("", "/")
    ):
        raise OperatorError("Нужны TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и корневой PUBLIC_URL с HTTPS")
    async with httpx.AsyncClient(timeout=30, trust_env=False, follow_redirects=False) as client:
        response = await client.post(
            "https://api.telegram.org/bot" + token + "/setWebhook",
            json={
                "url": public + "/api/telegram/webhook",
                "secret_token": secret,
                "allowed_updates": ["message", "message_reaction"],
            },
        )
        if not response.is_success or response.json().get("ok") is not True:
            raise OperatorError("Telegram не подтвердил установку вебхука")
    print("Вебхук Telegram установлен")


async def main(args):
    values = dict(os.environ)
    if args.command in ("bootstrap", "manage-staff"):
        await database_command(args.command, values)
    elif args.command == "setup-telegram-webhook":
        await setup_webhook(values)
    elif args.command in ("import-dpo", "refresh-dpo-enrollment"):
        from club_ops.catalog import import_catalog, refresh_enrollment

        await (import_catalog if args.command == "import-dpo" else refresh_enrollment)(values)
    else:
        office = Office(values)
        try:
            if args.command == "import-podcasts":
                await import_podcasts(office, args.manifest)
            else:
                result = await office.request("dpo-sync", "POST")
                print(
                    f"Каталог обновлён: создано {result['created']}, обновлено {result['updated']}, архивировано {result['archived']}"
                )
        finally:
            await office.close()


def run():
    parser = argparse.ArgumentParser(description="Команды оператора Клуба выпускников")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in (
        "bootstrap",
        "manage-staff",
        "sync-dpo",
        "setup-telegram-webhook",
        "import-dpo",
        "refresh-dpo-enrollment",
    ):
        sub.add_parser(name)
    sub.add_parser("import-podcasts").add_argument("manifest")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    try:
        asyncio.run(main(args))
    except OperatorError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Команда не завершена. Проверьте параметры, доступ и журнал сервера\n")


if __name__ == "__main__":
    run()
