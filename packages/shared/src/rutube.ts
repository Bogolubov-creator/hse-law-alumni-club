// DOM/Node-типы отсутствуют; домен ограничен целиком, чтобы исключить rutube.ru.evil.com.
const LINK_RE = /^https:\/\/(?:[a-z0-9-]+\.)*rutube\.ru\/(video\/private|video|play\/embed)\/([0-9a-f]{32})\/?(?:\?([^#]*))?(?:#.*)?$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface RutubeEmbed {
  src: string;
  // Ссылка приватного видео содержит токен доступа.
  private: boolean;
}

export function rutubeEmbed(raw: string | null | undefined): RutubeEmbed | null {
  if (!raw) return null;
  const m = LINK_RE.exec(raw.trim());
  if (!m) return null;

  const kind = m[1]!.toLowerCase();
  const id = m[2]!.toLowerCase();

  // Токен подставляется в адрес, поэтому проверяется отдельно: иначе через `p`
  // можно было бы дописать в src что угодно.
  let token: string | null = null;
  for (const pair of (m[3] ?? "").split("&")) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq) === "p") {
      const v = pair.slice(eq + 1);
      if (TOKEN_RE.test(v)) token = v;
      break;
    }
  }

  return {
    src: `https://rutube.ru/play/embed/${id}${token ? `?p=${token}` : ""}`,
    private: kind === "video/private" || !!token,
  };
}
