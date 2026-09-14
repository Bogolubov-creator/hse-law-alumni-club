import { isMirror } from "../lib/public-url.js";
import { setMirrorPodcastDemo, useMirrorPodcastDemo } from "../lib/mirror-podcast-demo.js";
import { actionGhost } from "../styles/primitives.js";

export function MirrorPodcastDemo() {
  const enabled = useMirrorPodcastDemo();
  if (!isMirror) return null;
  return <section aria-label="Деморежим подкастов" style={{ margin: "24px 0", padding: "20px", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)" }}>
    <strong>{enabled ? "Деморежим подписчика включён" : "Проверка подписки на зеркале"}</strong>
    <p style={{ color: "var(--c-text-2)", lineHeight: 1.5 }}>{enabled ? "Доступны все семь записей. Это демонстрация: оплата не нужна, настоящая подписка не оформляется." : "Сейчас доступен бесплатный выпуск. Можно отдельно включить демонстрацию доступа ко всем записям."}</p>
    <button type="button" className="foc" style={actionGhost} aria-pressed={enabled} onClick={() => setMirrorPodcastDemo(!enabled)}>{enabled ? "Вернуться к гостевому просмотру" : "Проверить как подписчик"}</button>
  </section>;
}
