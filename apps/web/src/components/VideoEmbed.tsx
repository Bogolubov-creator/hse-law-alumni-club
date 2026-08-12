/**
 * Встроенный плеер RuTube для выпуска подкаста.
 *
 * Адрес приходит с сервера уже разобранным (`rutubeEmbed` в общем пакете):
 * в `src` айфрейма попадает только rutube.ru и только известная форма адреса.
 * Произвольную строку из админки сюда пускать нельзя – это была бы дыра.
 *
 * `v2` меняет лишь оформление рамки; сам плеер одинаков в обеих версиях.
 */
export function VideoEmbed({ src, title, v2 = false }: { src: string; title: string; v2?: boolean }) {
  return (
    <div
      className={v2 ? undefined : "overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-black"}
      style={{
        position: "relative",
        // 16:9 – если не задать, айфрейм схлопнется в 150px и видео не видно
        aspectRatio: "16 / 9",
        overflow: "hidden",
        borderRadius: v2 ? "var(--r-md)" : undefined,
        border: v2 ? "1px solid var(--c-line)" : undefined,
        background: "#000",
      }}
    >
      <iframe
        src={src}
        title={`Видеовыпуск: ${title}`}
        loading="lazy"
        allow="clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}
