import hashlib
import json
import os
import stat
from contextlib import contextmanager
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import psycopg
from django.apps import apps
from django.db import connection, models, transaction
from django.utils.dateparse import parse_date, parse_datetime
from psycopg import sql
from psycopg.rows import dict_row

FORMAT = "club-database-transfer-v1"
MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024


def model_tables():
    return {model._meta.db_table: model for model in apps.get_app_config("club_data").get_models()}


def normalized(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat(timespec="microseconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, UUID | Decimal):
        return str(value)
    if isinstance(value, list | tuple):
        return [normalized(item) for item in value]
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    return value


def fingerprint(rows):
    records = sorted(
        json.dumps(normalized(row), ensure_ascii=False, sort_keys=True, separators=(",", ":")) for row in rows
    )
    digest = hashlib.sha256()
    for record in records:
        encoded = record.encode()
        digest.update(len(encoded).to_bytes(8, "big"))
        digest.update(encoded)
    return {"rows": len(rows), "sha256": digest.hexdigest()}


def export_snapshot(path, url):
    if not url.startswith(("postgres://", "postgresql://")):
        raise ValueError("Нужен адрес исходной PostgreSQL")
    destination = Path(path)
    snapshot = {"format": FORMAT, "tables": {}}
    with psycopg.connect(url, autocommit=True, row_factory=dict_row, connect_timeout=5) as source:
        with source.transaction():
            source.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            for name, model in model_tables().items():
                fields = [field.column for field in model._meta.local_fields if field.column]
                query = sql.SQL("SELECT {} FROM {}").format(
                    sql.SQL(",").join(map(sql.Identifier, fields)), sql.Identifier(name)
                )
                snapshot["tables"][name] = normalized(source.execute(query).fetchall())
    encoded = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode()
    if len(encoded) > MAX_SNAPSHOT_BYTES:
        raise ValueError("Снимок превышает допустимый размер 256 МиБ")
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        destination.unlink()
        raise
    return {name: fingerprint(rows) for name, rows in snapshot["tables"].items()}


def read_snapshot(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > MAX_SNAPSHOT_BYTES:
            raise ValueError("Снимок должен быть обычным закрытым файлом размером до 256 МиБ")
        encoded = source.read(MAX_SNAPSHOT_BYTES + 1)
        if len(encoded) > MAX_SNAPSHOT_BYTES:
            raise ValueError("Снимок превышает допустимый размер 256 МиБ")
    return json.loads(encoded)


def converted_row(model, row):
    fields = {field.column: field for field in model._meta.local_fields if field.column}
    if not isinstance(row, dict) or set(row) != set(fields):
        raise ValueError("Состав полей снимка отличается от модели")
    result = {}
    for column, field in fields.items():
        value = row[column]
        target = field.target_field if isinstance(field, models.ForeignKey) else field
        if value is None and not field.null:
            raise ValueError("В обязательном поле снимка отсутствует значение")
        if value is not None:
            if isinstance(target, models.DateTimeField):
                value = parse_datetime(value) if isinstance(value, str) else value
                if value is None:
                    raise ValueError("Некорректная дата в снимке")
                if value.tzinfo is None:
                    value = value.replace(tzinfo=UTC)
            elif isinstance(target, models.DateField):
                value = parse_date(value) if isinstance(value, str) else value
                if value is None:
                    raise ValueError("Некорректная дата в снимке")
            elif isinstance(target, models.UUIDField):
                value = UUID(str(value))
            elif isinstance(target, models.DecimalField):
                value = Decimal(str(value))
            elif isinstance(target, models.CharField):
                if not isinstance(value, str) or len(value) > target.max_length:
                    raise ValueError("Значение снимка не помещается в поле модели")
        result[field.attname] = value
    return result


def table_rows(model):
    fields = [field for field in model._meta.local_fields if field.column]
    return [
        {field.column: row[field.attname] for field in fields}
        for row in model.objects.values(*(field.attname for field in fields))
    ]


@contextmanager
def transfer_lock():
    with connection.cursor() as cursor:
        cursor.execute("SELECT GET_LOCK('club:database-transfer', 5)")
        if cursor.fetchone()[0] != 1:
            raise ValueError("Другой перенос уже выполняется")
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT RELEASE_LOCK('club:database-transfer')")


def import_snapshot(path):
    snapshot = read_snapshot(path)
    tables = model_tables()
    if snapshot.get("format") != FORMAT or set(snapshot.get("tables", {})) != set(tables):
        raise ValueError("Снимок имеет неподдерживаемый формат или неполный состав таблиц")
    if connection.vendor != "mysql" or not connection.mysql_is_mariadb:
        raise ValueError("Перенос разрешён только в MariaDB")
    source = {}
    expected = {}
    for name, model in tables.items():
        values = snapshot["tables"][name]
        if not isinstance(values, list):
            raise ValueError("Некорректная таблица в снимке")
        source[name] = [converted_row(model, row) for row in values]
        expected[name] = fingerprint(
            [
                {field.column: row[field.attname] for field in model._meta.local_fields if field.column}
                for row in source[name]
            ]
        )
    imported = set()
    pending = set(tables)
    deferred = []
    with transfer_lock(), transaction.atomic():
        if any(model.objects.exists() for model in tables.values()):
            raise ValueError("Целевая база должна быть пустой; существующие данные не заменяются")
        while pending:
            progress = False
            for name in sorted(pending):
                model = tables[name]
                relations = [field for field in model._meta.local_fields if isinstance(field, models.ForeignKey)]
                required = {
                    field.related_model._meta.db_table for field in relations if field.related_model is not model
                }
                if not required <= imported:
                    continue
                objects = []
                for original in source[name]:
                    row = dict(original)
                    self_refs = {}
                    for field in relations:
                        if field.related_model is model and row[field.attname] is not None:
                            if not field.null:
                                raise ValueError("Неподдерживаемая обязательная ссылка таблицы на себя")
                            self_refs[field.attname] = row[field.attname]
                            row[field.attname] = None
                    obj = model(**row)
                    objects.append(obj)
                    if self_refs:
                        deferred.append((model, obj.pk, self_refs))
                model.objects.bulk_create(objects, batch_size=250)
                imported.add(name)
                pending.remove(name)
                progress = True
            if not progress:
                raise ValueError("Циклическая зависимость между таблицами")
        for model, pk, values in deferred:
            model.objects.filter(pk=pk).update(**values)
        actual = {name: fingerprint(table_rows(model)) for name, model in tables.items()}
        if actual != expected:
            raise ValueError("Проверка перенесённых данных не совпала со снимком")
    return {"format": FORMAT, "tables": actual, "verified": True}
