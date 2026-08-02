import type { Classmate } from "@club/shared";
import { disp } from "./shared.js";

export const MATCH_LABEL: Record<Classmate["match"], string> = {
  both: "выпуск и ОП", cohort: "тот же выпуск", program: "та же ОП",
};
export const FRIEND_LABEL: Record<Classmate["friend_status"], string> = {
  none: "В друзья", pending: "Заявка отправлена", incoming: "Принять заявку", accepted: "В друзьях ✓",
};

export function ClassmateAvatar({ c, size }: { c: Classmate; size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: size * 0.28, flex: "none", overflow: "hidden", background: "linear-gradient(135deg,#2C6E80,#11296B)", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: size * 0.4, color: "#FBF3E8" }}>
      {c.avatar ? <img src={`/api/avatars/${c.avatar}`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : (c.fio?.trim()?.[0] ?? "?").toUpperCase()}
    </div>
  );
}
