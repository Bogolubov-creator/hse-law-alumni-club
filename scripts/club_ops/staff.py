import re
from uuid import uuid4

from club_api.modules.auth.passwords import hash_password
from club_ops.bootstrap import OperatorError, email


def validate_input(action, address, role, password):
    if action not in ("create", "reset-password"):
        raise OperatorError("STAFF_ACTION должен быть create или reset-password")
    if role not in ("admin", "editor"):
        raise OperatorError("STAFF_ROLE должен быть admin или editor")
    address = email(address, "STAFF_EMAIL")
    if not password or not 12 <= len(password) <= 100 or re.search(r"[\r\n]", password):
        raise OperatorError("Пароль сотрудника должен содержать 12–100 символов без переноса строки")
    return action, address, role, password


async def manage_staff(connection, *, action, address, role, password):
    action, address, role, password = validate_input(action, address, role, password)
    async with connection.transaction():
        owner = await (
            await connection.execute(
                "SELECT pg_has_role(current_user,relowner,'USAGE') AS allowed FROM pg_class WHERE oid='public.directus_users'::regclass"
            )
        ).fetchone()
        if not owner or not owner["allowed"]:
            raise OperatorError("Команда доступна только владельцу базы данных")
        await connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("auth-email:" + address,))
        rows = await (
            await connection.execute(
                "SELECT u.id,r.name AS role,u.status,u.provider,u.tfa_secret FROM directus_users u LEFT JOIN directus_roles r ON r.id=u.role WHERE lower(u.email)=%s LIMIT 2 FOR UPDATE OF u",
                (address,),
            )
        ).fetchall()
        if len(rows) > 1:
            raise OperatorError("Адрес неоднозначен; исправьте дубликаты перед операцией")
        if action == "create":
            if rows:
                raise OperatorError("Аккаунт уже существует; создание не меняет пароль или роль")
            roles = await (
                await connection.execute(
                    "SELECT id FROM directus_roles WHERE name=ANY(%s::text[]) LIMIT 2",
                    (["admin", "Administrator"] if role == "admin" else ["editor"],),
                )
            ).fetchall()
            if len(roles) != 1:
                raise OperatorError("Нужная роль отсутствует или неоднозначна; выполните bootstrap")
            await connection.execute(
                "INSERT INTO directus_users(id,email,password,role,status,provider,first_name,last_name) VALUES(%s,%s,%s,%s,'active','default','Сотрудник','')",
                (str(uuid4()), address, await hash_password(password), roles[0]["id"]),
            )
        else:
            user = rows[0] if rows else None
            if not user or user["role"] not in (("admin", "Administrator") if role == "admin" else ("editor",)):
                raise OperatorError("Существующий аккаунт должен иметь указанную роль сотрудника; повышения прав нет")
            if user["status"] != "active" or user["provider"] not in (None, "", "default") or user["tfa_secret"]:
                raise OperatorError(
                    "Сброс доступен активному локальному аккаунту без MFA; статус и способ входа не меняются"
                )
            await connection.execute(
                "UPDATE directus_users SET password=%s WHERE id=%s", (await hash_password(password), user["id"])
            )
            await connection.execute(
                "INSERT INTO club_staff_sessions(user_id,token_version) VALUES(%s,1) ON CONFLICT(user_id) DO UPDATE SET token_version=club_staff_sessions.token_version+1",
                (user["id"],),
            )
    return "created" if action == "create" else "password-reset"
