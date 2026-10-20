const FIELDS = ["direction", "format", "document", "enrollment", "organizer"];
let restoreFilters = null;
window.addEventListener("popstate", () => restoreFilters?.());

export function prepareCatalogFilters(root, programs, endings, url) {
  const form = root.querySelector("[data-dpo-filters]");
  const picker = root.querySelector("[data-dpo-picker]");
  const host = form.parentElement;
  const dialog = root.querySelector("#dpo-filter-dialog");
  const launch = root.querySelector("[data-dpo-filter-open]");
  const mirror = document.body.dataset.mirror === "true";
  const byId = new Map(programs.map(program => [program.id, program]));
  const stem = new RegExp(endings, "u");
  let applied = new URLSearchParams(location.search);
  let draft = null;
  let restoreDraft = true;

  function terms(value) {
    return (value.toLowerCase().replace(/ё/g, "е").match(/[a-zа-я0-9]+/g) || []).map(word => word.length > 4 ? word.replace(stem, "") : word);
  }

  function matches(program, params) {
    return FIELDS.every(name => !params.getAll(name).filter(Boolean).length || params.getAll(name).includes(program[name])) && terms(params.get("q") || "").every(word => program.search_terms.some(term => term.startsWith(word)));
  }

  function values() {
    const next = new URLSearchParams(applied);
    for (const name of [...FIELDS, "q", "sort", "compare"]) next.delete(name);
    for (const [key, value] of new FormData(form)) if (value) next.append(key, value);
    return next;
  }

  function fill(params) {
    for (const input of form.elements) {
      if (!input.name) continue;
      if (input.type === "checkbox") input.checked = params.getAll(input.name).includes(input.value);
      else input.value = params.get(input.name) || (input.name === "sort" ? "title" : "");
    }
    for (const name of FIELDS) if (name !== "organizer" && picker.elements[name]) picker.elements[name].value = params.get(name) || "";
    const organizer = picker.querySelector("[data-picker-organizer]");
    organizer.replaceChildren();
    for (const value of params.getAll("organizer")) {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = "organizer"; input.value = value; organizer.append(input);
    }
    preview();
  }

  function preview() {
    const params = values();
    for (const name of FIELDS) form.querySelector(`[data-filter-selected='${name}']`).textContent = params.getAll(name).length || "";
    form.querySelector("[data-dpo-filter-preview]").textContent = "Подходит программ: " + programs.filter(program => matches(program, params)).length;
  }

  function link(params) {
    return url("dpo/") + (params.size ? "?" + params : "") + "#program-list";
  }

  function chips() {
    const list = root.querySelector("[data-dpo-chips]");
    list.replaceChildren();
    let count = 0;
    for (const name of [...FIELDS, "q"]) for (const value of applied.getAll(name).filter(Boolean)) {
      const next = new URLSearchParams(applied);
      next.delete(name, value);
      const label = name === "q" ? "Поиск: " + value : [...form.querySelectorAll("input[type='checkbox']")].find(input => input.name === name && input.value === value)?.nextElementSibling.textContent || value;
      const chip = document.createElement("a");
      chip.href = link(next);
      chip.textContent = label + " ×";
      chip.setAttribute("aria-label", "Убрать фильтр: " + label);
      chip.dataset.dpoChip = name;
      chip.dataset.value = value;
      list.append(chip);
      count++;
    }
    launch.querySelector("[data-dpo-filter-total]").textContent = count || "";
    const reset = new URLSearchParams(applied);
    for (const name of [...FIELDS, "q", "sort"]) reset.delete(name);
    form.querySelector("[data-dpo-reset]").href = link(reset);
  }

  function apply() {
    applied = new URLSearchParams(location.search);
    fill(applied);
    chips();
    if (!mirror) return;
    const cards = [...root.querySelectorAll("[data-program-id]")];
    let count = 0;
    for (const card of cards) { card.hidden = !matches(byId.get(card.dataset.programId), applied); if (!card.hidden) count++; }
    const order = applied.get("sort") || "title";
    cards.sort((left, right) => {
      const a = byId.get(left.dataset.programId), b = byId.get(right.dataset.programId);
      let result = 0;
      if (["price", "price-desc"].includes(order)) result = Number(a.price == null) - Number(b.price == null) || (a.price - b.price) * (order === "price-desc" ? -1 : 1);
      if (order === "start") result = Number(!a.start_day) - Number(!b.start_day) || a.start_day.localeCompare(b.start_day);
      return result || a.title_order - b.title_order;
    });
    cards.forEach(card => card.parentElement.append(card));
    root.querySelector("[data-catalog-count]").textContent = "Найдено: " + count + " из " + programs.length;
    root.querySelector("[data-catalog-empty]").hidden = count !== 0;
  }

  function navigate(params) {
    history.pushState(null, "", link(params));
    window.dispatchEvent(new PopStateEvent("popstate"));
    root.querySelector("#program-list").scrollIntoView({ block: "start" });
  }

  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  root.addEventListener("submit", event => {
    if (![form, picker].includes(event.target)) return;
    restoreDraft = false;
    if (dialog.open) dialog.close();
    if (!mirror) return;
    event.preventDefault();
    const params = event.target === form ? values() : new URLSearchParams(new FormData(picker));
    navigate(params);
  });
  root.addEventListener("click", event => {
    const target = event.target.closest("a,button");
    if (!target) return;
    if (target === launch) {
      draft = new FormData(form);
      restoreDraft = true;
      dialog.querySelector("[data-dpo-filter-content]").append(form);
      dialog.showModal();
    } else if (target.matches("[data-dpo-filter-close],[data-dpo-filter-cancel]")) dialog.close();
    else if (mirror && target.matches("[data-dpo-chip],[data-dpo-reset]")) {
      event.preventDefault();
      restoreDraft = false;
      if (dialog.open) dialog.close();
      navigate(new URL(target.href).searchParams);
    }
  });
  dialog.addEventListener("close", () => {
    host.append(form);
    if (restoreDraft && draft) fill(new URLSearchParams(draft));
    launch.focus();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  restoreFilters = () => { if (root.isConnected) apply(); else restoreFilters = null; };
  apply();
}
