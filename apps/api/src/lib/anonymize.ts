import { readItems, updateItem, deleteItem, deleteUser, deleteFile } from "@directus/sdk";
import { directus } from "./directus.js";

const di = directus;

/**
 * Обезличивание участника (152-ФЗ, право на стирание / отзыв согласия).
 * Вычищаем персональные данные из профиля, заявок и файла аватара, удаляем
 * аккаунт входа и связи (друзья, push-подписки), поднимаем token_version, чтобы
 * убить выданные сессии. Учётные строки (заявки, леджер баллов, посещения)
 * остаются для целостности, но без ПДн. Необратимо и идемпотентно.
 */
export async function anonymizeAlumni(alumniId: string): Promise<boolean> {
  const rows = (await di.request((readItems as any)("alumni", {
    filter: { id: { _eq: alumniId } }, limit: 1,
    fields: ["id", "user_id", "avatar", "token_version"],
  }))) as { id: string; user_id: string | null; avatar: string | null; token_version: number | null }[];
  const a = rows[0];
  if (!a) return false;

  // Файл аватара в Directus Files.
  if (a.avatar) await di.request((deleteFile as any)(a.avatar)).catch(() => undefined);

  // Профиль: снять ПДн, пометить ушедшим, убить сессии (token_version+1).
  await di.request((updateItem as any)("alumni", alumniId, {
    fio: "Удалённый участник",
    contacts_json: null,
    telegram_id: null,
    avatar: null,
    interests_json: null,
    edu_program: null,
    status: "alumni_left",
    user_id: null,
    token_version: (a.token_version ?? 0) + 1,
  }));

  // Заявки: обезличить контактные ПДн (номера/суммы оставляем для учёта).
  const orders = (await di.request((readItems as any)("orders", {
    filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const o of orders) {
    await di.request((updateItem as any)("orders", o.id, {
      contact_fio: "удалено", contact_phone: "удалено", contact_email: "удалено", address: null, comment: null,
    })).catch(() => undefined);
  }

  // Связи и подписки: убрать полностью.
  const friends = (await di.request((readItems as any)("alumni_friends", {
    filter: { _or: [{ alumni_id: { _eq: alumniId } }, { friend_id: { _eq: alumniId } }] }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const f of friends) await di.request((deleteItem as any)("alumni_friends", f.id)).catch(() => undefined);

  const subs = (await di.request((readItems as any)("push_subs", {
    filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["id"],
  }))) as { id: string }[];
  for (const sub of subs) await di.request((deleteItem as any)("push_subs", sub.id)).catch(() => undefined);

  // Аккаунт входа — удалить (после этого войти нельзя).
  if (a.user_id) await di.request((deleteUser as any)(a.user_id)).catch(() => undefined);

  return true;
}
