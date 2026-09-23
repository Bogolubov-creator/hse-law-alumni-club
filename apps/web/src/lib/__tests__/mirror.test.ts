import { setMirrorPodcastDemo } from "../mirror-podcast-demo.js";
// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cartSummarySchema, meSchema } from "@club/shared";
vi.mock("../public-url.js", () => ({ isMirror: true }));
import { installMirrorFetch } from "../mirror.js";
const original = window.fetch;
const request = async (path: string, method = "GET", body?: unknown) => {
  const response = await window.fetch(`/api${path}`, { method, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.fetch = original; installMirrorFetch(); });
afterEach(() => { window.fetch = original; });
describe("демо-витрина", () => {
  it("не выдаёт подписку и платные аудиоссылки даже демо-кабинету", async () => {
    for (const session of [null, "mirror-alumni"]) {
      if (session) localStorage.setItem("club_token", session); else localStorage.removeItem("club_token");
      const { data } = await request('/podcasts');
      expect(data.items).toHaveLength(7);
      expect(data.subscribed).toBe(false); expect(data.sub_until).toBeNull();
      const free = data.items.filter((item: any) => item.is_free);
      expect(free).toHaveLength(1); expect(free[0].audio_url).toMatch(/danyukov\.mp3$/);
      for (const item of data.items.filter((item: any) => !item.is_free)) {
        expect(item.audio_url).toBeNull(); expect(item.video_url).toBeNull();
      }
    }
  });
  it("сохраняет товар, количество и итог между запросами и повторной установкой перехвата", async () => {
    const { data: products } = await request('/products');
    const p = products.find((p: any) => p.variants_json?.some((v: any) => v.stock > 2));
    const v = p.variants_json.find((v: any) => v.stock > 2);
    const item = { type: 'merch', ref_id: p.id, variant_sku: v.sku, qty: 1 };
    expect((await request('/cart', 'POST', item)).status).toBe(200);
    window.fetch = original; installMirrorFetch();
    expect(cartSummarySchema.parse((await request('/cart')).data).count).toBe(1);
    const changed = await request('/cart', 'PATCH', { ...item, qty: 2 });
    expect(changed.data.subtotal).toBe(p.price * 2);
    expect((await request('/cart', 'PATCH', { ...item, qty: 99 })).status).toBe(409);
    expect((await request('/cart', 'PATCH', { ...item, qty: 0 })).data.count).toBe(0);
  });
  it("не сообщает об успешной отправке реального заказа или сохранении профиля", async () => {
    expect((await request('/orders', 'POST', {})).status).toBe(503);
    expect((await request('/me/profile', 'PATCH', {})).status).toBe(503);
  });
  it("фильтрует участников и заявки, включая абсолютный URL", async () => {
    const members = await window.fetch('https://example.test/api/admin/members?status=pending');
    expect((await members.json()).items.map((m: any) => m.verification_status)).toEqual(['pending']);
    expect((await request('/admin/orders?status=new')).data.total).toBe(1);
    expect((await request('/admin/members?q=Несуществующий')).data.total).toBe(0);
  });
  it("возвращает полный срез подписок и валидный кабинет без битого аватара", async () => {
    const subs = (await request('/admin/podcast-subs')).data;
    expect(subs.by_podcast).toHaveLength(7);
    expect(subs.items).toHaveLength(subs.active);
    expect(meSchema.parse((await request('/me')).data).alumni.avatar).toBeNull();
  });
});

it("админка зеркала делит события на страницы и отдаёт roster отдельно", async () => {
  const legacy = await request("/admin/events");
  const first = await request("/admin/events?page=1&limit=1");
  expect(first.data.total).toBe(legacy.data.length);
  expect(first.data.items).toHaveLength(1);
  expect(first.data.items[0].rsvps).toBeUndefined();
  expect(first.data.items[0].rsvp_count).toBe(legacy.data[0].rsvps.length);
  const roster = await request(`/admin/events/${first.data.items[0].id}/rsvps`);
  expect(roster.data).toEqual(legacy.data[0].rsvps);
  expect((await request("/admin/events/missing/rsvps")).status).toBe(404);
});

it("открывает все семь записей только при явном включении деморежима и закрывает обратно", async () => {
  setMirrorPodcastDemo(true);
  const { data } = await request("/podcasts");
  expect(data.subscribed).toBe(true); expect(data.sub_until).toBeNull();
  expect(data.items.every((p: any) => p.audio_url?.endsWith(".mp3"))).toBe(true);
  setMirrorPodcastDemo(false);
  const guest = (await request("/podcasts")).data;
  expect(guest.subscribed).toBe(false);
  expect(guest.items.filter((p: any) => p.audio_url)).toHaveLength(1);
});
