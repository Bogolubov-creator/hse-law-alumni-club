import { renderMirrorCart } from "./mirror-cart.js";

const base = document.body.dataset.base;
const normalized = value => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е");
const path = document.querySelector("#page").dataset.path;
const query = new URLSearchParams(location.search);
let readPaths = new Set();

function apply() {
  const focus = document.activeElement;
  calendar();
  for (const input of document.querySelectorAll("form[method='get'] [name],form[role='search'] [name]")) if (!input.closest("[data-dpo-filters],[data-dpo-picker]")) input.value = query.get(input.name) || input.tagName === "SELECT" && input.options[0].value || "";
  const cards = [...document.querySelectorAll("#main [data-catalog-row],#main [data-change-row],#main [data-search-row],#main [data-office-row]")].filter(card => !card.hasAttribute("data-program-id"));
  let count = 0;
  for (const card of cards) {
    const record = card.dataset.catalogRow ? JSON.parse(card.dataset.catalogRow) : card.dataset.changeRow ? JSON.parse(card.dataset.changeRow) : card.dataset.officeRow ? JSON.parse(card.dataset.officeRow) : { title: card.dataset.searchText || card.textContent };
    let visible = normalized(query.get("q")).split(/\s+/).every(word => normalized([record.title,record.number,record.summary,record.text].join(" ")).includes(word));
    if (card.dataset.officeRow) {
      visible = normalized([record.title,record.direction,record.category,record.year].join(" ")).includes(normalized(query.get("q")).trim());
      if (query.get("status") && record.status !== query.get("status")) visible = false;
    }
    for (const name of ["direction","format","document","enrollment","category","kind","topic"]) if (query.get(name) && record[name] !== query.get(name)) visible = false;
    if (card.dataset.changeRow) {
      if (document.querySelector("[data-unread-filter]")?.checked && readPaths.has(card.dataset.readingPath)) visible = false;
      const view = query.get("view") || "digest";
      if (view !== "all" && record.entryType !== view) visible = false;
      if (query.get("from") && record.date.slice(0,10) < query.get("from")) visible = false;
      if (query.get("to") && record.date.slice(0,10) > query.get("to")) visible = false;
    }
    if (card.hasAttribute("data-search-row") && normalized(query.get("q")).length < 2) visible = false;
    card.hidden = !visible;
    if (visible) count++;
  }
  if (path === "/search") {
    for (const group of document.querySelectorAll("#main .club-search section,#main[data-search-groups] section,#main [data-search-groups] section")) {
      const visible = [...group.querySelectorAll("[data-search-row]")].filter(row => !row.hidden);
      visible.slice(6).forEach(row => { row.hidden = true; count--; });
    }
  }
  const sort = query.get("sort") || (path.startsWith("/changes") ? "newest" : "");
  if (cards.length && ["title","price","price-desc","oldest","newest"].includes(sort)) {
    const data = card => JSON.parse(card.dataset.catalogRow || card.dataset.changeRow);
    cards.sort((left,right) => sort === "title" ? normalized(data(left).title).localeCompare(normalized(data(right).title), "ru") : sort.startsWith("price") ? (data(left).price-data(right).price)*(sort === "price" ? 1 : -1) : (data(left).date.localeCompare(data(right).date) || String(data(left).id).localeCompare(String(data(right).id), "ru", { numeric: true }))*(sort === "oldest" ? 1 : -1));
    cards.forEach(card => card.parentNode.append(card));
  }
  if (path.startsWith("/changes")) {
    const visible = cards.filter(card => card.hasAttribute("data-change-row") && !card.hidden);
    const page = Math.min(10000, Math.max(1, Number.parseInt(query.get("page"), 10) || 1));
    visible.forEach((card, index) => { card.hidden = index < (page - 1) * 20 || index >= page * 20; });
    document.querySelectorAll("[data-change-open]").forEach(link => {
      const id = link.dataset.changeOpen;
      link.href = base + "changes/" + id + (query.size ? "?" + query : "");
    });
    const navigation = document.querySelector("[data-changes-pagination]");
    if (navigation) {
      navigation.replaceChildren();
      for (const [label, target] of [["← Предыдущая", page - 1], ["Страница " + page, 0], ["Следующая страница →", page + 1]]) {
        if (target && (target < 1 || target > page && visible.length <= page * 20)) continue;
        const node = document.createElement(target ? "a" : "span");
        node.textContent = label;
        if (target) { const next = new URLSearchParams(query); next.set("page", target); node.href = base + "changes?" + next; }
        navigation.append(node);
      }
    }
  }
  const status = document.querySelector("[data-changes-count],#main > p[role='status']:not([data-catalog-count])");
  if (status) status.textContent = "Найдено: " + count;
  const catalogEmpty = document.querySelector("[data-catalog-empty]");
  if (catalogEmpty && path !== "/dpo") catalogEmpty.hidden = count !== 0;
  const officeCount = document.querySelector("[data-office-count]");
  if (officeCount) officeCount.textContent = "Показано: " + count + " из " + cards.length;
  const officeEmpty = document.querySelector("[data-office-empty]");
  if (officeEmpty) officeEmpty.hidden = count !== 0;
  for (const group of document.querySelectorAll(".club-search section")) group.hidden = ![...group.querySelectorAll("[data-search-row]")].some(row => !row.hidden);
  if (focus instanceof HTMLElement && focus.isConnected && focus.getClientRects().length && document.activeElement !== focus) focus.focus({ preventScroll: true });
}

document.addEventListener("submit", event => {
  if (event.target.matches("[data-dpo-filters],[data-dpo-picker]")) return;
  if (!event.target.matches("form[method='get'],form[role='search']") || event.target.closest("#search-dialog")) return;
  event.preventDefault();
  for (const name of [...query.keys()]) query.delete(name);
  for (const [key,value] of new FormData(event.target)) if (value) query.set(key,value);
  history.pushState(null,"",base + (event.target.hasAttribute("data-changes-form") ? "changes" : path.slice(1)) + (query.size ? "?" + query : ""));
  apply();
});
window.addEventListener("popstate", () => { for (const name of [...query.keys()]) query.delete(name); for (const [key,value] of new URLSearchParams(location.search)) query.set(key,value); apply(); });
document.addEventListener("club-page-ready", apply);
document.addEventListener("club-reading-updated", event => { readPaths = new Set(event.detail.read); apply(); });
document.dispatchEvent(new Event("club-reading-refresh"));
apply();

window.clubMirrorReply = async question => {
  const faq = await fetch(base+"data/faq.json").then(response=>response.json());
  const text = normalized(question);
  const answer = faq.answers.find(item=>item.triggers.some(trigger=>text.includes(normalized(trigger))));
  if (answer) return answer;
  if (/подобрать|выбрать.*программ/.test(text)) return { text: "Выберите сферу программы. В демоверсии показан каталог для ознакомления.", anchor:"/dpo", programs:[] };
  const snapshot = await fetch(base+"data/mirror-api.json").then(response=>response.json());
  const programs = snapshot['/programs'].filter(item=>(normalized(item.title)+" "+normalized(item.direction)).includes(text)).slice(0,5).map(item=>({title:item.title,url:"/dpo/"+item.slug,duration:item.duration,formatLabel:item.format}));
  return { text:programs.length ? "Программы из демонстрационного каталога:" : "Посмотрите каталог ДПО или выберите вопрос из подсказок. Отправка обращения в демоверсии отключена.",anchor:"/dpo",programs };
};

function calendar() {
  const section = document.querySelector("[data-calendar-events]");
  const timed = document.querySelectorAll("[data-event-instant]");
  if (!section && !timed.length) return;
  const now = Date.now();
  const validMonth = value => /^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(value || "");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = formatter.format(new Date(now));
  const selected = validMonth(query.get("month")) ? query.get("month") : today.slice(0, 7);
  const back = document.querySelector("[data-events-back]");
  if (back && validMonth(query.get("month"))) back.href = base + "events/?month=" + selected;
  for (const row of timed) {
    const past = ["done", "canceled"].includes(row.dataset.eventState) || Date.parse(row.dataset.eventInstant) < now;
    if (!past) continue;
    row.classList.add("event-card--past");
    const label = row.dataset.eventState === "canceled" ? "Событие отменено" : "Событие завершено";
    for (const action of row.querySelectorAll("[data-event-register]")) {
      const state = document.createElement("span");
      state.className = "event-status"; state.dataset.eventStatus = ""; state.textContent = label;
      action.replaceWith(state);
    }
    const heading = row.querySelector("[data-event-heading-status]");
    if (heading) heading.textContent = label;
  }
  if (!section) return;
  const [year, month] = selected.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const title = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
  section.querySelector("h2").textContent = title;
  document.querySelector("[data-events-period]").textContent = title;
  for (const [key, delta] of [["previous", -1], ["next", 1]]) {
    const adjacent = new Date(Date.UTC(year, month - 1 + delta, 1));
    section.querySelector(`[data-calendar-month='${key}']`).href = "?month=" + adjacent.toISOString().slice(0, 7);
  }
  section.querySelector("[data-calendar-month='current']").href = "?month=" + today.slice(0, 7);
  const events = JSON.parse(section.dataset.calendarEvents);
  events.sort((left, right) => {
    const a = Date.parse(left.starts_at), b = Date.parse(right.starts_at);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number(!Number.isFinite(a)) - Number(!Number.isFinite(b));
    const pastA = ["done", "canceled"].includes(left.status) || a < now;
    const pastB = ["done", "canceled"].includes(right.status) || b < now;
    return Number(pastA) - Number(pastB) || (pastA ? b - a : a - b) || left.id.localeCompare(right.id);
  });
  const positions = new Map(events.map((event, index) => [event.id, index]));
  const cards = [...document.querySelectorAll("[data-event-start]")].sort((left, right) => positions.get(left.dataset.eventId) - positions.get(right.dataset.eventId));
  let count = 0;
  for (const row of cards) {
    document.querySelector(".events-agenda").append(row);
    row.hidden = !row.dataset.eventStart.startsWith(selected);
    if (!row.hidden) count++;
    for (const link of row.querySelectorAll("[data-event-link]")) link.href = base + "events/" + encodeURIComponent(row.dataset.eventId) + "/?month=" + selected;
  }
  document.querySelector("[data-events-count]").textContent = "Событий: " + count;
  document.querySelector("[data-events-empty]").hidden = count > 0;
  const grid = section.querySelector(".site-calendar-grid");
  grid.replaceChildren();
  for (const label of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) { const node = document.createElement("strong"); node.textContent = label; grid.append(node); }
  const offset = (date.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let index = 0; index < Math.ceil((offset + days) / 7) * 7; index++) {
    const cell = document.createElement("div");
    const day = index - offset + 1;
    if (day > 0 && day <= days) {
      const value = selected + "-" + String(day).padStart(2, "0");
      cell.dataset.calendarDate = value;
      const number = document.createElement("span"); number.textContent = day; cell.append(number);
      if (value === today) number.setAttribute("aria-current", "date");
      const matches = events.filter(event => Number.isFinite(Date.parse(event.starts_at)) && formatter.format(new Date(event.starts_at)) === value);
      if (matches.length) {
        cell.className = "has-events";
        const link = document.createElement("a");
        link.href = "#event-" + matches[0].id;
        link.setAttribute("aria-label", new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" }).format(new Date(matches[0].starts_at)) + ". " + matches.map(event => event.title).join("; "));
        cell.append(link);
      }
    }
    grid.append(cell);
  }
}

document.addEventListener("click", event => {
  const link = event.target.closest("[data-calendar-month]");
  if (!link) return;
  event.preventDefault();
  query.set("month", new URL(link.href).searchParams.get("month"));
  history.pushState(null, "", base + "events?" + query);
  apply();
});

let cartSession = "python-preview";
try { cartSession = localStorage.getItem("club_cart") || crypto.randomUUID(); localStorage.setItem("club_cart",cartSession); } catch {}
const cartStorage = "club_mirror_cart:" + cartSession;
let snapshotPromise;
const snapshot = () => snapshotPromise ||= fetch(base + "data/mirror-api.json").then(response => { if (!response.ok) throw new Error("Не удалось загрузить каталог. Повторите действие."); return response.json(); }).catch(error => { snapshotPromise = null; throw error; });

window.clubMirrorCart = async (method, body) => {
  let items;
  try { items = JSON.parse(sessionStorage.getItem(cartStorage) || '{"items":[]}').items; }
  catch { throw new Error("Демо-корзина повреждена. Очистите данные этой вкладки."); }
  if (!Array.isArray(items) || items.some(item => !item || !["dpo", "merch"].includes(item.type) || typeof item.ref_id !== "string" || typeof item.title !== "string" || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || !Number.isSafeInteger(item.price) || item.price < 0)) throw new Error("Демо-корзина повреждена. Очистите данные этой вкладки.");
  if (method === "DELETE") items = [];
  else if (method !== "GET") {
    if (!body || !Number.isInteger(body.qty) || body.qty < (method === "PATCH" ? 0 : 1) || body.qty > 99) throw new Error("Количество должно быть целым числом от 1 до 99.");
    const data = await snapshot();
    const candidates = body.type === "dpo" ? data["/programs"] : body.type === "merch" ? data["/products"] : [...data["/programs"], ...data["/products"]];
    const row = candidates.find(item => item.slug === body.ref_id);
    if (!row) throw new Error("Позиция не найдена.");
    const type = body.type || (Object.hasOwn(row, "stock") ? "merch" : "dpo");
    const variant = row.variants_json?.find(item => item.sku === body.variant_sku);
    if (row.variants_json?.length && !variant) throw new Error("Выберите размер и цвет.");
    const existing = items.find(item => item.type === type && item.ref_id === body.ref_id && item.variant_sku === (body.variant_sku || null));
    const requested = method === "PATCH" ? body.qty : (existing?.qty || 0) + body.qty;
    const qty = type === "dpo" && requested ? 1 : requested;
    if (qty > 99 || type === "merch" && qty > (variant?.stock ?? row.stock)) throw new Error("Недостаточно товара в наличии.");
    if (!existing && items.length >= 30) throw new Error("В корзине уже 30 разных позиций.");
    items = items.filter(item => item !== existing);
    if (qty) items.push({ type, ref_id: row.slug, variant_sku: variant?.sku || null, qty, title: row.title, price: row.price });
  }
  const cart = { items, count: items.reduce((sum,item) => sum + item.qty,0), subtotal: items.reduce((sum,item) => sum + item.qty * item.price,0) };
  if (method !== "GET") sessionStorage.setItem(cartStorage, JSON.stringify(cart));
  return cart;
};

const cart = () => renderMirrorCart(window.clubMirrorCart);

function subscription() {
  const active = sessionStorage.getItem("club:mirror-podcast-demo") === "1";
  for (const button of document.querySelectorAll("[data-mirror-subscription]")) button.textContent = active ? "Выключить деморежим подписчика" : "Проверить как подписчик";
  for (const player of document.querySelectorAll("[data-mirror-paid]")) {
    player.hidden = !active;
    const audio = player.querySelector("audio");
    const source = audio.querySelector("source");
    if (active && source.getAttribute("src") !== source.dataset.mirrorAudio) { source.src = source.dataset.mirrorAudio; audio.load(); }
    if (!active) { audio.pause(); source.removeAttribute("src"); }
  }
  for (const panel of document.querySelectorAll("[data-mirror-locked]")) panel.querySelector("p").textContent = active ? "Деморежим подписчика включён. Оплата и настоящая подписка не оформлялись." : "Демонстрация без оплаты и настоящей подписки.";
}

document.addEventListener("click", event => {
  if (!event.target.closest("[data-mirror-subscription]")) return;
  sessionStorage.setItem("club:mirror-podcast-demo",sessionStorage.getItem("club:mirror-podcast-demo") === "1" ? "0" : "1");
  subscription();
});
document.addEventListener("club-page-ready", () => { void cart(); subscription(); apply(); });
void cart();
subscription();
