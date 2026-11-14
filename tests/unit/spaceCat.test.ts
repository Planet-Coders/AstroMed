import { describe, expect, it } from "vitest";
import {
  EMPTY_CAT,
  FEED_COST,
  HUNGER_PER_HOUR,
  balance,
  canFeed,
  feed,
  fullness,
  growthStage,
  isHungry,
} from "@/lib/spaceCat";

const HOUR = 3_600_000;

describe("space cat ledger", () => {
  it("balance is earned minus spent, never negative", () => {
    expect(balance(120, EMPTY_CAT)).toBe(120);
    expect(balance(20, { ...EMPTY_CAT, spent: 60 })).toBe(0);
  });

  it("feeding spends FEED_COST and refuses when short", () => {
    const t = 1_000_000;
    const a = feed(70, EMPTY_CAT, t)!;
    expect(a.spent).toBe(FEED_COST);
    expect(a.feeds).toBe(1);
    const b = feed(70, a, t)!;
    expect(balance(70, b)).toBe(10);
    expect(canFeed(70, b)).toBe(false);
    expect(feed(70, b, t)).toBeNull();
  });

  it("fullness rises on a meal and decays per hour", () => {
    const t = 0;
    const fed = feed(100, EMPTY_CAT, t)!;
    expect(fullness(fed, t)).toBe(40);
    expect(isHungry(fed, t)).toBe(false);
    expect(fullness(fed, t + 2 * HOUR)).toBe(40 - 2 * HUNGER_PER_HOUR);
    expect(isHungry(fed, t + 2 * HOUR)).toBe(true);
    expect(fullness(EMPTY_CAT, t)).toBe(0);
  });

  it("fullness caps at 100", () => {
    let s = EMPTY_CAT;
    for (let i = 0; i < 4; i++) s = feed(1000, s, 0)!;
    expect(fullness(s, 0)).toBe(100);
  });

  it("growth stages slim, plump, chonky", () => {
    expect(growthStage(0)).toBe("slim");
    expect(growthStage(2)).toBe("slim");
    expect(growthStage(3)).toBe("plump");
    expect(growthStage(6)).toBe("plump");
    expect(growthStage(7)).toBe("chonky");
  });
});
