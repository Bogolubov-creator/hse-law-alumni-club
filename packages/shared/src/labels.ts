export const ORDER_STATUS_RU: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  confirmed: "Подтверждена",
  done: "Выполнена",
  canceled: "Отменена",
  expired: "Истёк резерв",
};

export const ORDER_STATUS_VERB_RU: Record<string, string> = {
  in_progress: "взята в работу",
  confirmed: "подтверждена",
  done: "выполнена",
  canceled: "отменена",
  expired: "истекла по сроку резерва",
};

export function formatRub(kop: number): string {
  return (kop / 100).toLocaleString("ru-RU");
}
