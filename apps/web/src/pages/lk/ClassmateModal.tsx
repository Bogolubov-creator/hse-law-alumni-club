import type { Classmate } from "@club/shared";
import { useAddFriend } from "../../lib/queries.js";
import Modal from "../../components/Modal.js";
import { useLkTokens, lkSurface } from "../../lib/lk-theme.js";
import { mono, disp } from "./shared.js";
import { ClassmateAvatar, FRIEND_LABEL } from "./ClassmateAvatar.js";

/** Мини-профиль однокурсника: фото, уровень, интересы с общими пересечениями. */
export function ClassmateModal({ c, myInterests, token, onClose }: { c: Classmate; myInterests: string[]; token: string; onClose: () => void }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const addFriend = useAddFriend(token);
  const common = new Set(myInterests);
  return (
    <Modal onClose={onClose} labelledBy="cm-modal-title" maxWidth={430}>
      <div style={{ position: "relative", ...surface, padding: "30px 30px 26px", boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)", animation: "g-pop .28s cubic-bezier(.2,.8,.2,1)" }}>
        <button onClick={onClose} aria-label="Закрыть" className="foc" style={{ position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.modalBtnBorder}`, background: "transparent", color: t.muted, cursor: "pointer" }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ClassmateAvatar c={c} size={72} />
          <div style={{ minWidth: 0 }}>
            <div id="cm-modal-title" style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em", lineHeight: 1.15 }}>{c.fio ?? "Выпускник"}</div>
            <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>Выпуск {c.cohort ?? "–"}{c.edu_program ? ` · ${c.edu_program}` : ""}</div>
            <div style={{ display: "inline-flex", marginTop: 8, fontSize: 12, fontWeight: 600, padding: "4px 11px", borderRadius: 999, background: t.levelChipBg, color: t.levelChipText }}>{c.level_title}</div>
          </div>
        </div>
        {c.interests.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>Интересы {c.interests.some((i) => common.has(i)) && <span style={{ color: "#1F8A5B", textTransform: "none" }}>· зелёные – общие с вами</span>}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {c.interests.map((i) => (
                <span key={i} style={{ fontSize: 12.5, fontWeight: 500, padding: "6px 12px", borderRadius: 999, border: "1.5px solid " + (common.has(i) ? "#1F8A5B" : t.chipBorder), background: common.has(i) ? "rgba(31,138,91,.1)" : t.chipBg, color: common.has(i) ? "#1F8A5B" : t.text }}>{i}</span>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => addFriend.mutate(c.id)}
          disabled={addFriend.isPending || c.friend_status === "pending" || c.friend_status === "accepted"}
          className="foc"
          style={{ marginTop: 22, width: "100%", fontWeight: 600, fontSize: 15, padding: 13, borderRadius: 12, cursor: c.friend_status === "none" || c.friend_status === "incoming" ? "pointer" : "default", border: "none", background: c.friend_status === "accepted" ? "rgba(31,138,91,.12)" : c.friend_status === "pending" ? t.pendingBg : "#EC5A13", color: c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.muted : "#FBF3E8" }}
        >
          {FRIEND_LABEL[c.friend_status]}
        </button>
      </div>
    </Modal>
  );
}
