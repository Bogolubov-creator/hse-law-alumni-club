/** Общий транспорт. Сессии выпускника, офиса и поддержки задаются вызывающим кодом. */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type JsonOptions = {
  strictJson?: boolean;
  errorBeforeJson?: boolean;
  errorMessage?: (status: number, data: any) => string;
  onError?: (status: number) => void;
};

export async function requestJson<T>(path: string, init: RequestInit, options: JsonOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const fail = (data?: unknown): never => {
    options.onError?.(res.status);
    throw new ApiError(res.status, options.errorMessage?.(res.status, data) || `API ${res.status}`);
  };
  if (!res.ok && options.errorBeforeJson) fail();
  const data = options.strictJson ? await res.json() : await res.json().catch(() => ({}));
  if (!res.ok) fail(data);
  return data as T;
}
