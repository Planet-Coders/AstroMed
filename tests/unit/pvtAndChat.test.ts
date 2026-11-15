import { describe, expect, it } from "vitest";
import { PVT, median, pvtLevel, scoredRt, storedPvtLevel, summarizePvt } from "@/lib/pvt";
import { mergeWithPending } from "@/lib/hotline/rules";

describe("PVT scoring", () => {
  it("uses the standard lapse (500 ms) and false-start (100 ms) lines", () => {
    expect(PVT.LAPSE_MS).toBe(500);
    expect(PVT.FALSE_START_MS).toBe(100);
  });

  it("removes the pointing allowance so hand travel isn't counted as slowness", () => {
    expect(scoredRt(450)).toBe(450 - PVT.POINTING_ALLOWANCE_MS);
    expect(scoredRt(50)).toBe(0);
  });

  it("a rested player is alert, even with one slow tap", () => {
    const rts = [260, 280, 300, 310, 290, 270, 620, 300].map((t) => t); // already scored
    const s = summarizePvt(rts, 0, 1);
    expect(s.median).toBe(295);
    expect(s.lapses).toBe(1);
    expect(s.level).toBe("GREEN");
  });

  it("mild fatigue in between, fatigued only when clearly impaired", () => {
    expect(pvtLevel(380, 3, 1)).toBe("YELLOW");
    expect(pvtLevel(460, 1, 1)).toBe("RED");
    expect(pvtLevel(320, 6, 1)).toBe("RED");
    // longer tests allow proportionally more lapses
    expect(pvtLevel(320, 6, 3)).toBe("GREEN");
  });

  it("false starts are counted separately, not as fatigue", () => {
    const s = summarizePvt([40, 60, 300, 310, 290], 0, 1);
    expect(s.falseStarts).toBe(2);
    expect(s.responses).toBe(3);
    expect(s.level).toBe("GREEN");
  });

  it("missed beacons count as lapses", () => {
    expect(summarizePvt([300, 300], 6, 1).level).toBe("RED");
  });

  it("older saved results (mean only) still get a level", () => {
    expect(storedPvtLevel({ mean: 320, lapses: 1 })).toBe("GREEN");
    expect(storedPvtLevel({ mean: 320, lapses: 1, level: "YELLOW" })).toBe("YELLOW");
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("hotline chat merge", () => {
  it("shows a queued message until the server has it, never twice", () => {
    const pending = [{ clientId: "a1" }, { clientId: "b2" }];
    const server = [{ id: "m1", clientId: "a1" }, { id: "m0", clientId: null }];
    const { sent, waiting } = mergeWithPending(server, pending);
    expect(sent).toHaveLength(2);
    expect(waiting.map((p) => p.clientId)).toEqual(["b2"]);
  });
});
