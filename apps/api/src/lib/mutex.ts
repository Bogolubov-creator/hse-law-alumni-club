// Простой per-key асинхронный мьютекс. Сериализует критические секции по ключу,
// чтобы конкурентные операции не выполнялись одновременно даже при переплетении
// на await-точках (single-threaded event loop). Основной кейс — дубли вебхука
// ЮKassa по одной заявке: без сериализации две доставки «succeeded» могут обе
// пройти проверку payment_status !== "succeeded" и дважды продлить подписку.
//
// ВНИМАНИЕ: блокировка внутрипроцессная и на нескольких инстансах API НЕ действует.
// Деплой одноинстансный (см. docs/deploy-runbook.md). При переходе на несколько
// инстансов нужен распределённый лок (advisory-lock Postgres / Redis).
const tails = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  // fn запускается после завершения предыдущей операции по этому ключу — независимо
  // от того, успешно она завершилась или упала (prev.then(fn, fn)).
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {}); // хвост цепочки не должен «зависать» на reject
  tails.set(key, tail);
  // Убираем ключ из карты, когда наша операция — последняя в цепочке (нет утечки).
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
