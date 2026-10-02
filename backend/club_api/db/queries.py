class Query(str):
    def __new__(cls, postgresql, mariadb):
        value = super().__new__(cls, postgresql)
        value.mariadb = mariadb
        return value

    def __add__(self, other):
        return Query(str(self) + str(other), self.mariadb + getattr(other, "mariadb", other))

    def __radd__(self, other):
        return Query(str(other) + str(self), getattr(other, "mariadb", other) + self.mariadb)


async def acquire_lock(connection, key, *, wait=5):
    if getattr(connection, "vendor", None) == "mysql":
        return await connection.lock(key, wait=wait)
    if wait == 0:
        cursor = await connection.execute(
            "SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS acquired", (str(key),)
        )
        return (await cursor.fetchone())["acquired"]
    await connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (str(key),))
    return True


async def release_lock(connection, key):
    if getattr(connection, "vendor", None) == "mysql":
        return await connection.unlock(key)
    await connection.execute("SELECT pg_advisory_unlock(hashtextextended(%s,0))", (str(key),))
