import { useState } from "react";
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
  const [enabled, setEnabled] = useState(false);
  return (
    <div
      className={v2 ? undefined : "overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-black"}
      style={{
        position: "relative",
        // 16:9 – если не задать, айфрейм схлопнется в 150px и видео не видно
        aspectRatio: enabled ? "16 / 9" : undefined,
        minHeight: enabled ? undefined : 180,
        overflow: "hidden",
        borderRadius: v2 ? "var(--r-md)" : undefined,
        border: v2 ? "1px solid var(--c-line)" : undefined,
        background: "#000",
      }}
    >
      {!enabled ? <div style={{ padding: 22, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, color: "#ffffff" }}><p style={{ margin: 0, fontSize: 15 }}>Видео размещено на RuTube. При загрузке плеера ваш браузер установит соединение с этим сервисом.</p><button type="button" className="foc" onClick={() => setEnabled(true)} style={{ background: "var(--c-accent)", color: "var(--c-on-accent)", border: 0, padding: "12px 18px", borderRadius: 8, cursor: "pointer", alignSelf: "flex-start", minHeight: 44 }}>Загрузить видео с RuTube</button></div> : <iframe
        src={src}
        referrerPolicy="no-referrer"
        title={`Видеовыпуск: ${title}`}
        loading="lazy"
        allow="clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
      />}
    </div>
  );
}
