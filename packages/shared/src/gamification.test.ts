import { describe, it, expect } from "vitest";
import {
  computeLevel, computeMemberDiscount, decayDelta, evaluateAchievements, achievementProgress, LEVELS, MEMBER_DISCOUNT_CAP,
} from "./gamification";

describe("computeLevel", () => {
  it("границы уровней", () => {
    expect(computeLevel(0).key).toBe("graduate");
    expect(computeLevel(199).key).toBe("graduate");
    expect(computeLevel(200).key).toBe("friend");
    expect(computeLevel(499).key).toBe("friend");
    expect(computeLevel(500).key).toBe("expert");
    expect(computeLevel(999).key).toBe("expert");
    expect(computeLevel(1000).key).toBe("ambassador");
    expect(computeLevel(99999).key).toBe("ambassador");
  });
  it("скидки уровней", () => {
    expect(LEVELS.map((l) => l.discount_percent)).toEqual([5, 10, 15, 20]);
  });
});

describe("computeMemberDiscount (cap 25, personal 0..10)", () => {
  it("база уровня без персональной", () => {
    expect(computeMemberDiscount(0)).toBe(5);
    expect(computeMemberDiscount(500)).toBe(15);
    expect(computeMemberDiscount(1000)).toBe(20);
  });
  it("сумма с персональной", () => {
    expect(computeMemberDiscount(200, 5)).toBe(15); // 10 + 5
    expect(computeMemberDiscount(0, 10)).toBe(15); // 5 + 10
  });
  it("потолок 25%", () => {
    expect(computeMemberDiscount(1000, 10)).toBe(MEMBER_DISCOUNT_CAP); // 20 + 10 → 25
  });
  it("персональная клампится в 0..10 и не уходит ниже 0", () => {
    expect(computeMemberDiscount(0, 50)).toBe(15); // personal → 10
    expect(computeMemberDiscount(0, -5)).toBe(5); // personal → 0
  });
});

describe("decayDelta (−15%)", () => {
  it("округление и знак", () => {
    expect(decayDelta(420)).toBe(-63);
    expect(decayDelta(1000)).toBe(-150);
    expect(decayDelta(0)).toBe(0);
  });
  it("понижение уровня после decay", () => {
    const points = 520; // expert
    expect(computeLevel(points).key).toBe("expert");
    const after = points + decayDelta(points); // 520 - 78 = 442 → friend
    expect(computeLevel(after).key).toBe("friend");
  });
});

describe("evaluateAchievements (набор Claude Design)", () => {
  it("«Первый шаг» – на первом мероприятии", () => {
    expect(evaluateAchievements({ events_attended: 0 })).not.toContain("first_step");
    expect(evaluateAchievements({ events_attended: 1 })).toContain("first_step");
  });
  it("«Завсегдатай» – на 5 мероприятиях", () => {
    expect(evaluateAchievements({ events_attended: 4 })).not.toContain("regular");
    expect(evaluateAchievements({ events_attended: 5 })).toContain("regular");
  });
  it("«Вечный студент» – 3 программы ДПО", () => {
    expect(evaluateAchievements({ programs_completed: 3 })).toContain("eternal_student");
  });
  it("«Легенда» – высший уровень (status_level 4)", () => {
    expect(evaluateAchievements({ status_level: 3 })).not.toContain("legend");
    expect(evaluateAchievements({ status_level: 4 })).toContain("legend");
  });
  it("«Печать офиса» – верификация", () => {
    expect(evaluateAchievements({ verified: 1 })).toContain("office_seal");
  });
});

describe("achievementProgress", () => {
  it("считает current/target/earned и подставляет demo для нетрекаемых метрик", () => {
    const p = achievementProgress({ events_attended: 1, programs_completed: 1, referrals_count: 0, verified: 1, status_level: 1 });
    const by = (k: string) => p.find((x) => x.key === k)!;
    expect(by("first_step").earned).toBe(true); // events 1 >= 1
    expect(by("regular")).toMatchObject({ current: 1, target: 5, earned: false, star: true });
    expect(by("office_seal").earned).toBe(true); // verified
    expect(by("on_wave")).toMatchObject({ current: 38, target: 50, earned: false }); // demo
    expect(by("legend")).toMatchObject({ current: 1, target: 4, earned: false });
    expect(p).toHaveLength(10);
  });
});
