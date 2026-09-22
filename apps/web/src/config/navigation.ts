/** Единые названия разделов для шапки, подвала и поиска. */
export const CLUB_NAV = [
  { to: "/dpo", label: "ДПО" },
  { to: "/events", label: "События" },
  { to: "/news", label: "Новости" },
  { to: "/podcasts", label: "Подкасты" },
  { to: "/changes", label: "Изменения в праве" },
  { to: "/merch", label: "Мерч" },
];
export const SEARCH_NAV = [
  ...CLUB_NAV,
  { to: "/lk", label: "Кабинет" },
  { to: "/cart", label: "Корзина" },
  { to: "/support", label: "Поддержка" },
];
