import argparse
import os
import sys

import django
from club_ops.database_transfer import export_snapshot


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "club_api.django_settings")
    os.environ["CHECKOUT_DATABASE_URL"] = ""
    django.setup()
    parser = argparse.ArgumentParser(description="Согласованный снимок PostgreSQL для переноса в MariaDB")
    parser.add_argument("snapshot")
    args = parser.parse_args()
    try:
        tables = export_snapshot(args.snapshot, os.environ.get("SOURCE_DATABASE_URL", ""))
    except Exception:
        print("Снимок не создан. Проверьте доступ к исходной базе и права на каталог назначения.", file=sys.stderr)
        return 1
    print(f"Снимок создан: таблиц {len(tables)}, записей {sum(t['rows'] for t in tables.values())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
