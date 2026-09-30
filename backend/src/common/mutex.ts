// Блокировка по ключу действует только внутри одного процесса API.
const tails = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  // fn запускается после завершения предыдущей операции по этому ключу – независимо
  // от того, успешно она завершилась или упала (prev.then(fn, fn)).
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {}); // хвост цепочки не должен «зависать» на reject
  tails.set(key, tail);
  // Убираем ключ из карты, когда наша операция – последняя в цепочке (нет утечки).
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
