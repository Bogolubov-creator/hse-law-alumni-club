import { prepareCart } from "./cart.js";

const money = value => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value / 100);

export async function renderMirrorCart(readCart) {
  const container = document.querySelector("[data-mirror-cart]");
  if (container) container.setAttribute("aria-busy", "true");
  try {
    const data = await readCart("GET");
    document.querySelectorAll("[data-cart-count]").forEach(badge => { badge.textContent = data.count || ""; });
    if (!container?.isConnected) return;
    const template = document.querySelector(data.items.length ? "[data-cart-filled-template]" : "[data-cart-empty-template]");
    container.replaceChildren(template.content.cloneNode(true));
    for (const item of data.items) {
      const fragment = document.querySelector("[data-cart-row-template]").content.cloneNode(true);
      fragment.querySelector("[data-cart-type]").textContent = item.type === "dpo" ? "Программа Клуба" : "Мерч клуба";
      fragment.querySelector("[data-cart-title]").textContent = item.title;
      fragment.querySelector("[data-cart-price]").textContent = money(item.price);
      const variant = fragment.querySelector("[data-cart-variant]");
      variant.hidden = !item.variant_sku;
      variant.textContent = "Вариант: " + (item.variant_sku || "");
      for (const key of ["type", "ref_id", "variant_sku", "qty"]) fragment.querySelector(`[name=${key}]`).value = item[key] ?? "";
      fragment.querySelector("button[data-api]").dataset.body = JSON.stringify({ type: item.type, ref_id: item.ref_id, variant_sku: item.variant_sku || null, qty: 0 });
      container.querySelector("[data-cart-items]").append(fragment);
    }
    const total = container.querySelector("[data-cart-total]");
    if (total) total.textContent = money(data.subtotal);
  } catch (error) {
    if (!container?.isConnected) return;
    const state = document.createElement("section");
    state.className = "cart-state";
    state.setAttribute("role", "alert");
    const heading = document.createElement("h2"); heading.textContent = "Не удалось загрузить корзину";
    const message = document.createElement("p"); message.textContent = error.message;
    const retry = document.createElement("button"); retry.textContent = "Повторить загрузку"; retry.dataset.action = "refresh"; retry.className = "site-primary";
    state.append(heading, message, retry);
    container.replaceChildren(state);
  } finally {
    if (container?.isConnected) { container.removeAttribute("aria-busy"); prepareCart(); }
  }
}
