import re
import secrets

from club_api.db.queries import Query, acquire_lock
from club_api.modules.checkout.store import digest


async def make_link(database, alumni_id):
    code = "l" + secrets.token_urlsafe(24)
    await database.execute("DELETE FROM club_telegram_links WHERE expires_at <= now()")
    await database.execute(
        Query(
            "INSERT INTO club_telegram_links(alumni_id,token_hash,expires_at) VALUES(%s,%s,now()+interval '10 minutes') ON CONFLICT(alumni_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at",
            "INSERT INTO club_telegram_links(alumni_id,token_hash,expires_at) VALUES(%s,%s,now()+INTERVAL 10 MINUTE) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)",
        ),
        (alumni_id, digest(code)),
    )
    return code


async def consume_link(database, code, telegram_id):
    if (
        not re.fullmatch(r"l[A-Za-z0-9_-]{32}", code)
        or not re.fullmatch(r"[1-9][0-9]{0,15}", telegram_id)
        or int(telegram_id) > 9007199254740991
    ):
        return None
    async with database.transaction() as connection:
        await acquire_lock(connection, "telegram-link")
        cursor = await connection.execute(
            Query(
                "SELECT a.id,a.fio,a.telegram_id FROM club_telegram_links l JOIN alumni a ON a.id=l.alumni_id WHERE l.token_hash=%s AND l.expires_at > now() AND a.verification_status='verified' FOR UPDATE OF l,a",
                "SELECT a.id,a.fio,a.telegram_id FROM club_telegram_links l JOIN alumni a ON a.id=l.alumni_id WHERE l.token_hash=%s AND l.expires_at > now() AND a.verification_status='verified' FOR UPDATE",
            ),
            (digest(code),),
        )
        owner = await cursor.fetchone()
        if not owner or (owner["telegram_id"] and owner["telegram_id"] != telegram_id):
            return None
        cursor = await connection.execute(
            "SELECT id FROM alumni WHERE telegram_id=%s AND id<>%s", (telegram_id, owner["id"])
        )
        if await cursor.fetchone():
            return None
        await connection.execute("UPDATE alumni SET telegram_id=%s WHERE id=%s", (telegram_id, owner["id"]))
        await connection.execute("DELETE FROM club_telegram_links WHERE alumni_id=%s", (owner["id"],))
        return {"fio": owner["fio"] or "выпускника"}
