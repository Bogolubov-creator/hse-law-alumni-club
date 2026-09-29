import { isMirror } from "../lib/public-url.js";
import { setMirrorPodcastDemo, useMirrorPodcastDemo } from "../lib/mirror-podcast-demo.js";
import { actionGhost } from "../styles/primitives.js";

export function MirrorPodcastDemo() {
  const enabled = useMirrorPodcastDemo();
  if (!isMirror) return null;
  return <section aria-label="Деморежим подкастов" style={{ margin: "24px 0", padding: "20px", border: "1px solid var(--c-line)", borderRadius: "var(--r-lg)" }}>
    <strong>{enabled ? "Деморежим подписчика включён" : "Просмотр подкастов на зеркале"}</strong>
    <p style={{ color: "var(--c-text-2)", lineHeight: 1.5 }}>{enabled ? "Открыты все выпуски. Демодоступ без оплаты." : "Один выпуск открыт. Остальные можно посмотреть в деморежиме."}</p>
    <button type="button" className="foc" style={actionGhost} aria-pressed={enabled} onClick={() => setMirrorPodcastDemo(!enabled)}>{enabled ? "Вернуться к гостевому просмотру" : "Проверить как подписчик"}</button>
  </section>;
}
