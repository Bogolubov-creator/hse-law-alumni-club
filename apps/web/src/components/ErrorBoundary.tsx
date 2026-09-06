import { Component, type ReactNode } from "react";

/**
 * Ошибка загрузки динамического чанка (устаревший хеш после деплоя, флейки сети).
 * Такое лечится перезагрузкой – показываем мягкое «сайт обновился», а не «ошибка».
 */
function isChunkError(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(m);
}

interface State {
  error: Error | null;
  chunk: boolean;
}

/**
 * Граница ошибок верхнего уровня: ловит падение рендера или сбой lazy-import,
 * чтобы вместо белого экрана пользователь увидел понятный экран восстановления.
 * Стили инлайновые – работают даже если CSS не загрузился.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, chunk: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, chunk: isChunkError(error) };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    const { error, chunk } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1D2433" }}>
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 40 }} aria-hidden>{chunk ? "🔄" : "⚠️"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
            {chunk ? "Доступна новая версия сайта" : "Что-то пошло не так"}
          </h1>
          <p style={{ marginTop: 8, color: "#555", lineHeight: 1.5 }}>
            {chunk
              ? "Похоже, сайт обновился, пока вы были на странице. Обновите – загрузится актуальная версия."
              : "Произошла непредвиденная ошибка. Попробуйте обновить страницу или вернуться на главную."}
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={{ background: "#EC5A13", color: "#FBF3E8", border: 0, borderRadius: 11, padding: "12px 22px", fontWeight: 600, cursor: "pointer", fontSize: 15 }}>Обновить страницу</button>
            {/* «Домой» – в тот же контур, откуда пришёл человек: внешний v1
                или /v2. Иначе ошибка в v2 неожиданно выбрасывала на старый сайт. */}
            <a href={window.location.pathname.startsWith("/v2") ? "/v2" : "/"} style={{ border: "1.5px solid #E5E7EB", borderRadius: 11, padding: "12px 22px", fontWeight: 600, textDecoration: "none", color: "inherit", fontSize: 15 }}>На главную</a>
          </div>
        </div>
      </div>
    );
  }
}

/** Видимый индикатор загрузки для Suspense-fallback (self-contained SMIL-спиннер). */
export function PageLoader() {
  return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }} role="status" aria-label="Загрузка">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#EC5A13" strokeWidth="2.5" aria-hidden>
        <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>
  );
}
