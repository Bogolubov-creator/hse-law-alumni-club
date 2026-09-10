/** Статус заявки в именительном падеже – для бейджей и списков. */
export const ORDER_STATUS_RU: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  confirmed: "Подтверждена",
  done: "Выполнена",
  canceled: "Отменена",
  expired: "Истёк резерв",
};

/** Статус в глагольной форме – для уведомлений («Заявка … взята в работу»). */
export const ORDER_STATUS_VERB_RU: Record<string, string> = {
  in_progress: "взята в работу",
  confirmed: "подтверждена",
  done: "выполнена",
  canceled: "отменена",
  expired: "истекла по сроку резерва",
};

/** Копейки → «12 345» (ru-RU), без символа валюты. */
export function formatRub(kop: number): string {
  return (kop / 100).toLocaleString("ru-RU");
}
