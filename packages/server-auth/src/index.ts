import { argon2id, hash, verify } from "argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, version: 0x13, memoryCost: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 });
}

// Существующие Argon2-хеши проверяются по сохранённым параметрам без перезаписи.
export async function verifyPassword(encodedHash: string | null, password: string): Promise<boolean> {
  if (!encodedHash || !/^\$argon2(?:id|i|d)\$/.test(encodedHash)) return false;
  try { return await verify(encodedHash, password); }
  catch { return false; }
}
