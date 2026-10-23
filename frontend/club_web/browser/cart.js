export function cartFocus(active = document.activeElement) {
  if (!active?.closest(".cart-page")) return null;
  const row = active.closest("[data-cart-line]");
  return row ? { type: row.querySelector("[name=type]").value, ref: row.querySelector("[name=ref_id]").value, variant: row.querySelector("[name=variant_sku]").value } : active.closest(".cart-clear") ? {} : null;
}

export function prepareCart() {
  const page = document.querySelector("#page");
  if (!page?.dataset.cartFocus || page.querySelector("[data-mirror-cart]")?.getAttribute("aria-busy") === "true") return;
  const saved = JSON.parse(page.dataset.cartFocus);
  const rows = [...page.querySelectorAll("[data-cart-line]")];
  const row = rows.find(row => row.querySelector("[name=type]").value === saved.type && row.querySelector("[name=ref_id]").value === saved.ref && row.querySelector("[name=variant_sku]").value === saved.variant);
  const target = row?.querySelector("form button") || page.querySelector("#cart-selection-title,#cart-empty-title");
  if (target) { if (target.tagName !== "BUTTON") target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); delete page.dataset.cartFocus; }
}
