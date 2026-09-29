import { argon2id, hash, verify } from "argon2";

/** Только сервер: PHC-строка хранит соль и параметры, пароль нигде не сохраняется. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, version: 0x13, memoryCost: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 });
}

/** Старые Directus Argon2-хеши проверяются по своим параметрам без перезаписи. */
export async function verifyPassword(encodedHash: string | null, password: string): Promise<boolean> {
  if (!encodedHash || !/^\$argon2(?:id|i|d)\$/.test(encodedHash)) return false;
  try { return await verify(encodedHash, password); }
  catch { return false; }
}
