import { readItems, updateItem, deleteItem, deleteUser, updateUser, deleteFile } from "@directus/sdk";
import { directus } from "./directus.js";

const di = directus;
const warn = (where: string, e: unknown) => console.error(`[anonymize] ${where}:`, (e as Error)?.message ?? e);

/**
 * Обезличивание участника (152-ФЗ, право на стирание / отзыв согласия).
 * Вычищаем персональные данные из профиля, заявок и файла аватара, удаляем
 * аккаунт входа и связи (друзья, push-подписки), поднимаем token_version, чтобы
 * убить выданные сессии. Учётные строки (заявки, леджер) остаются для целостности,
 * но без ПДн. Обезличенный участник помечается rejected + alumni_left, чтобы не
 * попадать в «Сообщество» и не считаться активным verified. Идемпотентно.
 */
export async function anonymizeAlumni(alumniId: string): Promise<boolean> {
  const rows = (await di.request((readItems as any)("alumni", {
    filter: { id: { _eq: alumniId } }, limit: 1,
    fields: ["id", "user_id", "avatar", "token_version"],
  }))) as { id: string; user_id: string | null; avatar: string | null; token_version: number | null }[];
  const a = rows[0];
  if (!a) return false;

  // Файл аватара в Directus Files.
  if (a.avatar) await di.request((deleteFile as any)(a.avatar)).catch((e) => warn("avatar", e));

  // Профиль: снять ПДн (включая сведения об образовании), исключить из выборок
  // (rejected + alumni_left), обнулить баллы, убить сессии (token_version+1).
  await di.request((updateItem as any)("alumni", alumniId, {
    fio: "Удалённый участник",
    contacts_json: null,
    telegram_id: null,
    avatar: null,
    interests_json: null,
    edu_program: null,
    edu_level: null,
    cohort: null,
    verification_status: "rejected",
    points_cached: 0,
    status: "alumni_left",
    user_id: null,
    token_version: (a.token_version ?? 0) + 1,
  }));

  // Заявки: обезличить контактные ПДн. contact_email = "-" (сентинел «нет адреса»),
  // иначе значение прошло бы гард уведомлений (contact_email && !== "-") → письмо в никуда.
  const orders = (await di.request((readItems as any)("orders", {
    filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const o of orders) {
    await di.request((updateItem as any)("orders", o.id, {
      contact_fio: "Удалённый участник", contact_phone: "-", contact_email: "-", address: null, comment: null,
    })).catch((e) => warn(`order ${o.id}`, e));
  }

  // Связи и подписки: убрать полностью.
  const friends = (await di.request((readItems as any)("alumni_friends", {
    filter: { _or: [{ alumni_id: { _eq: alumniId } }, { friend_id: { _eq: alumniId } }] }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const f of friends) await di.request((deleteItem as any)("alumni_friends", f.id)).catch((e) => warn("friend", e));

  const subs = (await di.request((readItems as any)("push_subs", {
    filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const sub of subs) await di.request((deleteItem as any)("push_subs", sub.id)).catch((e) => warn("push_sub", e));

  // Аккаунт входа – удалить. Если удаление не прошло (email – ПДн!), не молчим:
  // логируем и как fallback затираем email/имя и блокируем вход, чтобы ПДн не осталось.
  if (a.user_id) {
    try {
      await di.request((deleteUser as any)(a.user_id));
    } catch (e) {
      warn("deleteUser (fallback: затираю email)", e);
      await di.request((updateUser as any)(a.user_id, {
        email: `deleted-${a.user_id}@invalid.local`, first_name: "Удалён", last_name: "-", status: "suspended",
      })).catch((e2) => warn("deleteUser fallback scrub", e2));
    }
  }

  return true;
}
