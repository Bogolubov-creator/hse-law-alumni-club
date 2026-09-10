/**
 * Разбор ссылки RuTube в адрес встраиваемого плеера.
 *
 * Зачем отдельная функция и почему такая строгая: `video_url` заполняет
 * учебный офис руками в админке, а результат уходит в `src` айфрейма. Пускать
 * туда произвольную строку нельзя – это готовая дыра. Поэтому распознаём
 * только rutube.ru и только известные формы адреса; всё остальное – null,
 * и тогда фронт просто не показывает видео.
 *
 * Поддерживаются:
 *  • https://rutube.ru/video/<id>/                      – обычное видео
 *  • https://rutube.ru/video/private/<id>/?p=<токен>    – видео из закрытой папки
 *  • https://rutube.ru/play/embed/<id>[?p=<токен>]      – уже готовый embed
 */

/**
 * Разбор строкой, а не через `URL`: общий пакет собирается без DOM- и
 * Node-типов, поэтому глобального `URL` тут просто нет. Заодно регулярное
 * выражение не зависит от того, где выполняется код.
 *
 * Домен закрыт с обеих сторон: `rutube.ru` или его поддомен, и сразу за ним
 * обязателен `/`. Иначе прошли бы подделки вида rutube.ru.evil.com.
 */
const LINK_RE = /^https:\/\/(?:[a-z0-9-]+\.)*rutube\.ru\/(video\/private|video|play\/embed)\/([0-9a-f]{32})\/?(?:\?([^#]*))?(?:#.*)?$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface RutubeEmbed {
  /** Адрес для <iframe src>. */
  src: string;
  /** Приватное видео (из закрытой папки): ссылка несёт токен доступа. */
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
