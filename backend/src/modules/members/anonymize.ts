import { checkoutPool } from "../../db/checkout-store.js";
import { env } from "../../config/env.js";
import { readItems, updateItem, deleteItem, deleteUser, updateUser } from "../../db/data-commands.js";
import { deleteStoredFile } from "../media/media-store.js";
import { data } from "../../db/data.js";

const di = data;
const warn = (where: string, e: unknown) => console.error(`[anonymize] ${where}:`, (e as Error)?.message ?? e);

// Учётные строки остаются без персональных данных; выданные сессии отзываются.
export async function anonymizeAlumni(alumniId: string): Promise<boolean> {
  const rows = (await di.request((readItems as any)("alumni", {
    filter: { id: { _eq: alumniId } }, limit: 1,
    fields: ["id", "user_id", "avatar", "token_version"],
  }))) as { id: string; user_id: string | null; avatar: string | null; token_version: number | null }[];
  const a = rows[0];
  if (!a) return false;

  if (env.CHECKOUT_DATABASE_URL) {
    await checkoutPool().query("DELETE FROM club_social_reactions WHERE alumni_id=$1", [alumniId]);
    await checkoutPool().query("DELETE FROM club_social_membership WHERE alumni_id=$1", [alumniId]);
  }

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

  if (a.avatar) await deleteStoredFile(a.avatar).catch((e) => warn("avatar", e));

  // Сентинел «-» исключает повторную отправку уведомлений обезличенному адресу.
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

  // При сбое удаления аккаунт обезличивается и блокируется.
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
