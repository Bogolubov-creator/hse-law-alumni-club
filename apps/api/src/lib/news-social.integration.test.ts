import {describe,it,expect,afterAll,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {checkoutPool,digest} from "./checkout-store.js";
import {importNewsCandidate,refreshNewsSource} from "./news-sources.js";
import {recordReaction,socialProgress} from "./social-progress.js";
import {env} from "../env.js";
const enabled=process.env.RUN_TELEGRAM_INTEGRATION==="true";
if(enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname!=="/alumni_staged") throw new Error("Only alumni_staged is allowed");
const pool=enabled?checkoutPool():null;
afterAll(async()=>{vi.unstubAllGlobals();if(pool) await pool.end();});
describe.skipIf(!enabled)("новости и реакции: реальные транзакции",()=>{
 it("конкурентный импорт создаёт один черновик и сохраняет дату оригинала",async()=>{
   const url="https://pravo.hse.ru/news/987654.html",id=digest(url);
   await pool!.query("INSERT INTO club_news_inbox(id,source_url,sources,title,published_at) VALUES($1,$2,ARRAY['alumni','career'],'Встреча','2026-03-02')",[id,url]);
   const results=await Promise.all([importNewsCandidate(id,"Встреча","Наш обзор"),importNewsCandidate(id,"Встреча","Наш обзор")]);
   expect(results[0]!.id).toBe(results[1]!.id);
   const {rows}=await pool!.query("SELECT * FROM news WHERE source_url=$1",[url]);
   expect(rows).toHaveLength(1);expect(rows[0].status).toBe("draft");expect(rows[0].published_at.toISOString()).toBe("2026-03-02T00:00:00.000Z");
 });
 it("персональная реакция идемпотентна, анонимная не учитывается, снятие обнуляет",async()=>{
   env.TELEGRAM_REACTIONS_CHAT_ID="-123";const id=randomUUID();
   await pool!.query("INSERT INTO alumni(id,verification_status,telegram_id) VALUES($1,'verified','456')",[id]);
   const base={chat:{id:-123},message_id:99,user:{id:456},date:100,new_reaction:[{type:"emoji"}]};
   await recordReaction(base);await recordReaction(base);await recordReaction({...base,user:undefined,message_id:100});
   expect((await pool!.query("SELECT * FROM club_social_reactions WHERE alumni_id=$1 AND active",[id])).rows).toHaveLength(1);
   await recordReaction({...base,date:102,new_reaction:[]});await recordReaction({...base,date:101});
   expect((await pool!.query("SELECT * FROM club_social_reactions WHERE alumni_id=$1 AND active",[id])).rows).toHaveLength(0);
   await recordReaction({...base,date:103},50);
   await recordReaction({...base,date:103,new_reaction:[]},51);
   await recordReaction({...base,date:103},50);
   await recordReaction({...base,chat:{id:-999},message_id:102,date:104},52);
   expect((await pool!.query("SELECT * FROM club_social_reactions WHERE alumni_id=$1 AND active",[id])).rows).toHaveLength(0);
   await pool!.query("DELETE FROM alumni WHERE id=$1",[id]);
 });
 it("сбой источника сохраняет очередь и записывает ошибку проверки",async()=>{
   const before=(await pool!.query("SELECT count(*)::int AS count FROM club_news_inbox")).rows[0].count;
   vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,headers:new Headers()})));
   await expect(refreshNewsSource("career")).rejects.toThrow("Не удалось обновить источник");
   expect((await pool!.query("SELECT count(*)::int AS count FROM club_news_inbox")).rows[0].count).toBe(before);
   expect((await pool!.query("SELECT error FROM club_news_source_runs WHERE source='career'")).rows[0].error).toBeTruthy();
 });
 it("подписка проверяется сервером, ответ кэшируется, ошибка не выдаёт достижение",async()=>{
   env.TELEGRAM_BOT_TOKEN="test-token";const id=randomUUID();
   await pool!.query("INSERT INTO alumni(id,verification_status,telegram_id) VALUES($1,'verified','789')",[id]);
   const request=vi.fn(async()=>({ok:true,json:async()=>({ok:true,result:{status:"member"}})}));vi.stubGlobal("fetch",request);
   expect((await socialProgress(id,"789")).telegram_subscribed).toBe(1);
   expect((await socialProgress(id,"789")).telegram_subscribed).toBe(1);expect(request).toHaveBeenCalledTimes(1);
   await pool!.query("DELETE FROM club_social_membership WHERE alumni_id=$1",[id]);
   request.mockRejectedValueOnce(new Error("offline"));
   expect((await socialProgress(id,"789")).telegram_subscribed).toBe(0);
   await pool!.query("DELETE FROM alumni WHERE id=$1",[id]);
 });
});
