import { describe,it,expect } from "vitest";
import { parseNewsSource, parseRussianDate } from "./news-sources.js";
import { canonicalNewsUrl, achievementProgress } from "@club/shared";
import { subscribedStatus } from "./social-progress.js";
describe("источники и социальный прогресс",()=>{
 it("принимает только канонические ссылки доверенных источников",()=>{
   expect(canonicalNewsUrl("https://pravo.hse.ru/news/123.html?utm_source=tg")).toBe("https://pravo.hse.ru/news/123.html");
   expect(canonicalNewsUrl("https://t.me/s/alumnilawhse/25?single")).toBe("https://t.me/AlumniLawHSE/25");
   for(const url of ["javascript:alert(1)","https://pravo.hse.ru.evil.test/news/123.html","https://evil@pravo.hse.ru/news/123.html","http://pravo.hse.ru/news/123.html","https://t.me/other/25"]) expect(canonicalNewsUrl(url)).toBeNull();
 });
 it("извлекает новости из секции и не угадывает год",()=>{
   const html='<a href="https://pravo.hse.ru/news/999.html">Навигация</a><div class="plate_news__title"><a href="https://pravo.hse.ru/news/123.html">Новость &amp; встреча</a></div>';
   expect(parseNewsSource(html,"alumni")).toEqual([{source_url:"https://pravo.hse.ru/news/123.html",title:"Новость & встреча",published_at:null}]);
 });
 it("объединяет репост со ссылкой ВШЭ и игнорирует начальный emoji",()=>{
   const html='<div class="tgme_widget_message" data-post="AlumniLawHSE/12"><div class="tgme_widget_message_text"><b>♥</b><b>Встреча выпускников</b><a href="https://pravo.hse.ru/news/123.html?utm_source=tg">Подробнее</a></div><time datetime="2026-09-14T12:00:00Z"></time></div>';
   expect(parseNewsSource(html,"telegram")[0]).toEqual({source_url:"https://pravo.hse.ru/news/123.html",title:"♥Встреча выпускниковПодробнее",published_at:"2026-09-14T12:00:00.000Z"});
 });
 it("демонстрационные счётчики не выдаются за заработанные",()=>{
   const data=achievementProgress({}); expect(data.find(a=>a.key==="on_radar")?.earned).toBe(false);
   expect(data.find(a=>a.key==="on_wave")?.current).toBe(0);
   expect(achievementProgress({telegram_subscribed:1,telegram_reactions:10}).filter(a=>["on_radar","on_wave"].includes(a.key)).every(a=>a.earned)).toBe(true);
 });
 it("извлекает полную дату ВШЭ, не подставляет год для сокращённой",()=>{
   expect(parseRussianDate("2 марта 2026 г.")).toBe("2026-03-02T12:00:00.000Z");
   expect(parseRussianDate("2 марта")).toBeNull(); expect(parseRussianDate("31 февраля 2026 г.")).toBeNull();
 });
 it("различает подписку, выход и restricted",()=>{
   for(const status of ["member","administrator","creator"]) expect(subscribedStatus({status})).toBe(true);
   for(const status of ["left","kicked","restricted","unknown"]) expect(subscribedStatus({status})).toBe(false);
   expect(subscribedStatus({status:"restricted",is_member:true})).toBe(true);
 });
});
