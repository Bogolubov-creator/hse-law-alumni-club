import { readItems, readUsers } from "@directus/sdk";
import { directus as di } from "./directus.js";

export async function alumniEmail(alumniId: string): Promise<string | null> {
  const a = (await di.request(readItems("alumni", { filter: { id: { _eq: alumniId } }, limit: 1, fields: ["user_id", "contacts_json"] }))) as any[];
  if (!a[0]) return null;
  if (a[0].user_id) {
    const u = (await di.request((readUsers as any)({ filter: { id: { _eq: a[0].user_id } }, limit: 1, fields: ["email"] }))) as any[];
    if (u[0]?.email) return u[0].email;
  }
  return a[0].contacts_json?.email ?? null;
}
