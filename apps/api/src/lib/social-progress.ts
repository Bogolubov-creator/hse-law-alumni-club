import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";
export function subscribedStatus(member: {status?: string; is_member?: boolean}): boolean {
  return ["creator","administrator","member"].includes(member.status || "") || (member.status === "restricted" && member.is_member === true);
}
async function readSocialProgress(alumniId: string, telegramId?: string | null) {
  const stats = { telegram_subscribed: 0, telegram_reactions: 0, subscription: (!telegramId ? "not_linked" : "unavailable") as "not_linked" | "unavailable" | "subscribed" | "not_subscribed", reactions_available: !!env.TELEGRAM_REACTIONS_CHAT_ID };
  if (!telegramId || !env.TELEGRAM_BOT_TOKEN || !env.CHECKOUT_DATABASE_URL) return stats;
  const db = checkoutPool();
  const cached = (await db.query("SELECT * FROM club_social_membership WHERE alumni_id=$1 AND telegram_id=$2 AND checked_at > now() - interval '5 minutes'",[alumniId,telegramId])).rows[0];
  let checked = !!cached;
  if (cached) stats.telegram_subscribed = Number(cached.subscribed);
  else {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:"@AlumniLawHSE",user_id:Number(telegramId)}),signal:AbortSignal.timeout(5000),
      });
      const data = await r.json() as {ok:boolean;result?:{status:string;is_member?:boolean}};
      if (r.ok && data.ok && data.result) {
        checked = true;
        stats.telegram_subscribed = Number(subscribedStatus(data.result));
        await db.query(`INSERT INTO club_social_membership (alumni_id,telegram_id,subscribed) VALUES ($1,$2,$3)
          ON CONFLICT (alumni_id) DO UPDATE SET telegram_id=$2,subscribed=$3,checked_at=now()`,[alumniId,telegramId,!!stats.telegram_subscribed]);
      }
    } catch { /* Недоступность API не подтверждает подписку. */ }
  }
  if (env.TELEGRAM_REACTIONS_CHAT_ID) {
    const result = await db.query("SELECT count(*)::int AS count FROM club_social_reactions WHERE alumni_id=$1 AND chat_id=$2 AND active=true",[alumniId,env.TELEGRAM_REACTIONS_CHAT_ID]);
    stats.telegram_reactions = result.rows[0]?.count || 0;
  }
  if (checked) stats.subscription = stats.telegram_subscribed ? "subscribed" : "not_subscribed";
  return stats;
}
export type ReactionUpdate = { chat:{id:number}; message_id:number; user?:{id:number;is_bot?:boolean}; date:number; new_reaction:unknown[] };
export async function recordReaction(update: ReactionUpdate, updateId = 0) {
  if (!env.TELEGRAM_REACTIONS_CHAT_ID || String(update.chat.id) !== env.TELEGRAM_REACTIONS_CHAT_ID || !update.user?.id || update.user.is_bot) return;
  // Одна реакция на одно сообщение; снятие и повторная доставка не увеличивают счётчик.
  await checkoutPool().query(`INSERT INTO club_social_reactions (alumni_id,chat_id,message_id,active,event_at,update_id)
    SELECT id,$2,$3,$4,$5,$6 FROM alumni WHERE telegram_id=$1 AND verification_status='verified'
    ON CONFLICT (alumni_id,chat_id,message_id) DO UPDATE SET active=EXCLUDED.active,event_at=EXCLUDED.event_at,update_id=EXCLUDED.update_id
    WHERE (club_social_reactions.event_at,club_social_reactions.update_id) < (EXCLUDED.event_at,EXCLUDED.update_id)`,
    [String(update.user.id),String(update.chat.id),update.message_id,update.new_reaction.length>0,update.date,updateId]);
}

export async function socialProgress(alumniId: string, telegramId?: string | null) {
  try { return await readSocialProgress(alumniId, telegramId); }
  catch { return {telegram_subscribed:0,telegram_reactions:0,subscription:"unavailable" as const,reactions_available:false}; }
}
