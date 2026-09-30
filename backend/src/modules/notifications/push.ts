import webpush from "web-push";
import { readItems, deleteItem } from "../../db/data-commands.js";
import { env } from "../../config/env.js";
import { data } from "../../db/data.js";


const enabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (enabled) {
  webpush.setVapidDetails(`mailto:${env.SMTP_FROM || "club@pravo.hse.ru"}`, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export const pushEnabled = () => enabled;

export interface PushPayload { title: string; body: string; url?: string }

async function sendToSubs(subs: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[], payload: PushPayload): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 3600 });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await data.request((deleteItem as any)("push_subs", s.id)).catch(() => undefined);
      } else {
        console.error("[push] send failed:", e?.statusCode ?? e?.message);
      }
    }
  }));
}

export function pushToAlumni(alumniId: string, payload: PushPayload): void {
  if (!enabled) return;
  void (async () => {
    const subs = (await data.request((readItems as any)("push_subs", {
      filter: { alumni_id: { _eq: alumniId } }, limit: -1, fields: ["id", "endpoint", "keys"],
    }))) as any[];
    if (subs.length) await sendToSubs(subs, payload);
  })().catch((e) => console.error("[push] alumni failed:", (e as Error).message));
}

export async function pushToAlumniMany(alumniIds: string[], payload: PushPayload): Promise<number> {
  if (!enabled || !alumniIds.length) return 0;
  const uniq = [...new Set(alumniIds)];
  const subs = (await data.request((readItems as any)("push_subs", {
    filter: { alumni_id: { _in: uniq } }, limit: -1, fields: ["id", "endpoint", "keys"],
  }))) as any[];
  if (subs.length) await sendToSubs(subs, payload);
  return subs.length;
}

export function pushToAll(payload: PushPayload): void {
  if (!enabled) return;
  void (async () => {
    const subs = (await data.request((readItems as any)("push_subs", { limit: -1, fields: ["id", "endpoint", "keys"] }))) as any[];
    if (subs.length) await sendToSubs(subs, payload);
  })().catch((e) => console.error("[push] broadcast failed:", (e as Error).message));
}
