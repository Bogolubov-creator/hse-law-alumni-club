import asyncio
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import Argon2Error

HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, hash_len=32, salt_len=16, type=Type.ID)


def password_slots():
    loop = asyncio.get_running_loop()
    if not hasattr(loop, "_club_password_slots"):
        loop._club_password_slots = asyncio.Semaphore(2)
    return loop._club_password_slots


async def hash_password(password):
    async with password_slots():
        return await password_work(HASHER.hash, password, salt=secrets.token_bytes(16))


async def password_work(function, *args, **kwargs):
    task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await task
        raise


async def verify_password(encoded, password):
    if not isinstance(encoded, str) or not encoded.startswith(("$argon2id$", "$argon2i$", "$argon2d$")):
        return False
    try:
        parts = encoded.split("$")
        index = 3 if len(parts) > 3 and parts[2].startswith("v=") else 2
        items = parts[index].split(",")
        parameters = dict(item.split("=", 1) for item in items)
        if (
            len(items) != 3
            or set(parameters) != {"m", "t", "p"}
            or any(not value.isascii() or not value.isdigit() for value in parameters.values())
        ):
            return False
        parts[index] = ",".join(f"{key}={parameters[key]}" for key in ("m", "t", "p"))
        encoded = "$".join(parts)
        async with password_slots():
            return await password_work(HASHER.verify, encoded, password)
    except Argon2Error, ValueError, IndexError:
        return False
