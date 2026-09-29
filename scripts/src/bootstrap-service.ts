import { randomBytes } from "node:crypto";

type ServiceUser = { id: string; role: string | null; token: string | null; status: string };
type ServiceStore = {
  find: () => Promise<ServiceUser | undefined>;
  create: (credentials: { password: string; role: string; token: string }) => Promise<{ id: string }>;
  updatePassword: (id: string, password: string) => Promise<void>;
  legacyPasswordWorks: () => Promise<boolean>;
  passwordChecked: (id: string) => Promise<boolean>;
  markPasswordChecked: (id: string) => Promise<void>;
};

/** Секреты существующего аккаунта меняет только узкая миграция старого password=token. */
export async function ensureServiceCredentials(store: ServiceStore, role: string, token: string) {
  const existing = await store.find();
  if (!existing) {
    const created = await store.create({ password: randomBytes(32).toString("hex"), role, token });
    await store.markPasswordChecked(created.id);
    return "created";
  }
  if (existing.role !== role || existing.status !== "active") {
    throw new Error("Сервисный аккаунт имеет другую роль или отключён. Проверьте его в Directus; bootstrap не меняет существующие права.");
  }
  if (existing.token !== token) {
    throw new Error("DIRECTUS_SERVICE_TOKEN не совпадает с токеном существующего сервисного аккаунта. Выполните согласованную ротацию; bootstrap не заменяет секреты.");
  }
  if (await store.passwordChecked(existing.id)) return "unchanged";
  if (await store.legacyPasswordWorks()) {
    await store.updatePassword(existing.id, randomBytes(32).toString("hex"));
    await store.markPasswordChecked(existing.id);
    return "legacy-password-rotated";
  }
  await store.markPasswordChecked(existing.id);
  return "unchanged";
}
