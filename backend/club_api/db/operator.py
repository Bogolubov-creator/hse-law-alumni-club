from django.db import DatabaseError


async def is_operator(connection):
    if getattr(connection, "vendor", None) == "mysql":
        try:
            await connection.execute("SELECT `key` FROM club_settings LIMIT 0")
            return True
        except DatabaseError:
            return False
    row = await (
        await connection.execute(
            "SELECT pg_has_role(current_user,relowner,'USAGE') AS allowed FROM pg_class WHERE oid='public.directus_users'::regclass"
        )
    ).fetchone()
    return bool(row and row["allowed"])
