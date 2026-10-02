import logging

from club_api.db.queries import Query

logger = logging.getLogger("club.members")


async def alumni_email(state, id):
    rows = await state.database.rows(
        Query(
            "SELECT u.email,a.contacts_json->>'email' AS contact_email FROM alumni a LEFT JOIN directus_users u ON u.id=a.user_id WHERE a.id=%s",
            "SELECT u.email,JSON_UNQUOTE(JSON_EXTRACT(a.contacts_json,'$.email')) AS contact_email FROM alumni a LEFT JOIN directus_users u ON u.id=a.user_id WHERE a.id=%s",
        ),
        (id,),
    )
    return (rows[0]["email"] or rows[0]["contact_email"]) if rows else None


async def anonymize(state, alumni_id):
    async with state.database.transaction() as connection:
        cursor = await connection.execute("SELECT id,user_id,avatar FROM alumni WHERE id=%s FOR UPDATE", (alumni_id,))
        alumni = await cursor.fetchone()
        if not alumni:
            return False
        await connection.execute("DELETE FROM club_social_reactions WHERE alumni_id=%s", (alumni_id,))
        await connection.execute("DELETE FROM club_social_membership WHERE alumni_id=%s", (alumni_id,))
        await connection.execute(
            "UPDATE alumni SET fio='Удалённый участник',contacts_json=NULL,telegram_id=NULL,avatar=NULL,interests_json=NULL,edu_program=NULL,edu_level=NULL,cohort=NULL,verification_status='rejected',points_cached=0,status='alumni_left',user_id=NULL,token_version=COALESCE(token_version,0)+1 WHERE id=%s",
            (alumni_id,),
        )
        await connection.execute(
            "UPDATE orders SET contact_fio='Удалённый участник',contact_phone='-',contact_email='-',address=NULL,comment=NULL WHERE alumni_id=%s",
            (alumni_id,),
        )
        await connection.execute(
            "DELETE FROM alumni_friends WHERE alumni_id=%s OR friend_id=%s", (alumni_id, alumni_id)
        )
        await connection.execute("DELETE FROM push_subs WHERE alumni_id=%s", (alumni_id,))
        if alumni["user_id"]:
            await connection.execute(
                "UPDATE directus_users SET email=%s,first_name='Удалён',last_name='-',status='suspended' WHERE id=%s AND role IN (SELECT id FROM directus_roles WHERE name='alumni')",
                (f"deleted-{alumni['user_id']}@invalid.local", alumni["user_id"]),
            )
            await connection.execute(
                "DELETE FROM directus_users WHERE id=%s AND role IN (SELECT id FROM directus_roles WHERE name='alumni')",
                (alumni["user_id"],),
            )
    if alumni["avatar"]:
        try:
            await state.media.delete(str(alumni["avatar"]))
        except Exception:
            logger.error("Не удалось удалить прежний файл профиля")
    return True
