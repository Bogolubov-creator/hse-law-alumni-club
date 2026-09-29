/** Сессия администратора передаётся через окружение и никогда не выводится. */
export async function officeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = new URL(process.env.CLUB_API_URL || "http://localhost");
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
    throw new Error("CLUB_API_URL требует HTTPS либо локальный HTTP");
  }
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Нужен корневой CLUB_API_URL");
  const token = process.env.CLUB_ADMIN_TOKEN;
  if (!token) throw new Error("Задайте CLUB_ADMIN_TOKEN через окружение");
  const response = await fetch(new URL(`/api/admin/${path}`, base), {
    ...init, redirect: "error", signal: AbortSignal.timeout(300_000),
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Операция офиса завершилась с HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
