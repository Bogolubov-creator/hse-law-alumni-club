import { describe, it, expect } from "vitest";
import {
  computeLevel, computeMemberDiscount, decayDelta, evaluateAchievements, LEVELS, MEMBER_DISCOUNT_CAP,
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

describe("evaluateAchievements", () => {
  it("«Знаток» открывается на 3-й программе", () => {
    expect(evaluateAchievements({ programs_completed: 2 })).not.toContain("expert3");
    expect(evaluateAchievements({ programs_completed: 3 })).toContain("expert3");
  });
  it("первый шаг и легенда", () => {
    expect(evaluateAchievements({ programs_completed: 1 })).toContain("first_step");
    expect(evaluateAchievements({ points: 1000 })).toContain("legend");
    expect(evaluateAchievements({ points: 999 })).not.toContain("legend");
  });
});
