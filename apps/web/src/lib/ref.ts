/**
 * Отложенный реферальный код: человек может открыть /join?ref=…, отвлечься
 * и вернуться к регистрации позже уже без ?ref= в адресе. Чтобы приглашение
 * не терялось, код кладётся в localStorage с меткой времени и подставляется
 * в регистрацию в течение 30 дней; после успешной заявки ключ удаляется.
 *
 * Бэкенд принимает ref длиной до 40 символов из [A-Za-z0-9_-] – при сохранении
 * отсекаем всё лишнее, чтобы не тащить в localStorage мусор из адресной строки.
 */

const KEY = "club_ref";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredRef {
  ref: string;
  at: number; // Date.now() в момент сохранения
}

/** Приводит код к формату бэкенда; пустая строка – значит, сохранять нечего. */
export function sanitizeRef(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

/** Сохраняет ref из URL; невалидный/пустой код игнорируется (старое значение не затираем). */
export function saveRef(raw: string | null, now: number = Date.now()): void {
  if (!raw) return;
  const ref = sanitizeRef(raw);
  if (!ref) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ref, at: now } satisfies StoredRef));
  } catch { /* приватный режим / переполнение – ref просто не запомнится */ }
}

/** Сохранённый ref, если он не старше 30 дней; иначе null (просроченный ключ чистим). */
export function readRef(now: number = Date.now()): string | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredRef;
    const ref = typeof stored.ref === "string" ? sanitizeRef(stored.ref) : "";
    if (ref && typeof stored.at === "number" && now - stored.at <= MAX_AGE_MS) return ref;
  } catch { /* битый JSON – считаем, что кода нет */ }
  clearRef();
  return null;
}

/** Удаляет сохранённый ref (после успешной регистрации). */
export function clearRef(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* localStorage недоступен – не мешаем регистрации */ }
}
