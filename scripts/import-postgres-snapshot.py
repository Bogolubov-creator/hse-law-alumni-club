import argparse
import os
import sys

import django
from club_ops.database_transfer import import_snapshot


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "club_api.django_settings")
    django.setup()
    parser = argparse.ArgumentParser(description="Перенос проверенного снимка PostgreSQL в пустую MariaDB")
    parser.add_argument("snapshot")
    args = parser.parse_args()
    try:
        result = import_snapshot(args.snapshot)
    except Exception:
        print(
            "Перенос остановлен. Проверьте схему, доступ и целостность снимка; исходная база не изменена.",
            file=sys.stderr,
        )
        return 1
    print(
        f"Перенос проверен: таблиц {len(result['tables'])}, записей {sum(t['rows'] for t in result['tables'].values())}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
