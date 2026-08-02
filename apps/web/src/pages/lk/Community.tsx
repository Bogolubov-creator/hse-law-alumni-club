import { useState } from "react";
import type { Classmate } from "@club/shared";
import { useClassmates, useAddFriend } from "../../lib/queries.js";
import { useLkTokens, lkSurface } from "../../lib/lk-theme.js";
import { mono, disp } from "./shared.js";
import { ClassmateAvatar, MATCH_LABEL, FRIEND_LABEL } from "./ClassmateAvatar.js";
import { ClassmateModal } from "./ClassmateModal.js";

/** «Мои однокурсники» — тот же выпуск или ОП; клик по карточке — мини-профиль. */
export function Community({ token, myInterests }: { token: string; myInterests: string[] }) {
  const t = useLkTokens();
  const surface = lkSurface(t);
  const classmates = useClassmates(token);
  const addFriend = useAddFriend(token);
  const [sel, setSel] = useState<Classmate | null>(null);
  const list = classmates.data ?? [];
  const friendsCount = list.filter((c) => c.friend_status === "accepted").length;
  if (classmates.isLoading || classmates.isError || list.length === 0) return null;

  return (
    <div style={{ ...surface, padding: "26px 28px", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Мои однокурсники</div>
          <div style={{ ...mono, fontSize: 12, color: t.muted, marginTop: 6 }}>Тот же выпуск или образовательная программа</div>
        </div>
        <span style={{ ...mono, fontSize: 12, color: t.muted }}>{list.length} чел. · в друзьях: <b style={{ color: "#1F8A5B" }}>{friendsCount}</b></span>
      </div>
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${t.surfaceBorder}`, borderRadius: 16, padding: "14px 16px" }}>
            {/* Клик по человеку — мини-профиль */}
            <button onClick={() => setSel(c)} className="foc" style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
              <ClassmateAvatar c={c} size={46} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{c.fio ?? "Выпускник"}</span>
                <span style={{ display: "block", ...mono, fontSize: 11, color: t.muted, marginTop: 3 }}>
                  {MATCH_LABEL[c.match]}{c.cohort ? ` · ${c.cohort}` : ""}{c.edu_program ? ` · ${c.edu_program}` : ""}
                </span>
                {c.interests.length > 0 && (
                  <span style={{ display: "block", ...mono, fontSize: 10, color: "#a07d2e", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.interests.join(" · ")}</span>
                )}
              </span>
            </button>
            <button
              onClick={() => addFriend.mutate(c.id)}
              disabled={(addFriend.isPending && addFriend.variables === c.id) || c.friend_status === "pending" || c.friend_status === "accepted"}
              className="foc"
              style={{
                flex: "none", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 10, cursor: c.friend_status === "none" || c.friend_status === "incoming" ? "pointer" : "default",
                border: "1.5px solid " + (c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.ghostBtnBorder : "#EC5A13"),
                background: c.friend_status === "none" || c.friend_status === "incoming" ? "#EC5A13" : t.ghostBtnBg,
                color: c.friend_status === "accepted" ? "#1F8A5B" : c.friend_status === "pending" ? t.muted : "#FBF3E8",
              }}
            >
              {FRIEND_LABEL[c.friend_status]}
            </button>
          </div>
        ))}
      </div>
      {addFriend.isError && <p style={{ ...mono, fontSize: 12, color: "#B5331B", margin: "12px 0 0" }}>Не удалось отправить заявку — попробуйте ещё раз.</p>}
      {sel && <ClassmateModal c={list.find((x) => x.id === sel.id) ?? sel} myInterests={myInterests} token={token} onClose={() => setSel(null)} />}
    </div>
  );
}
