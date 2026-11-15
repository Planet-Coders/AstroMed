import { describe, expect, it } from "vitest";
import snapshot from "@/lib/data/osdr-studies.json";
import { generateCopilotFallback } from "@/lib/copilotFallback";
import {
  doseTone,
  exerciseTone,
  hrvTone,
  osdrBaselineBlock,
  osdrFallbackCitation,
  parseTransformedCsv,
  presentStudies,
  resolveStoredStudies,
  type StoredStudy,
} from "@/lib/osdr";

const saved = (snapshot as { studies: StoredStudy[] }).studies;
const studies = presentStudies(saved);

describe("transformed CSV means", () => {
  it("skips NA and records n", () => {
    const { metrics } = parseTransformedCsv(
      "OSD-751",
      "fixture.csv",
      "Sample Name,tnf_alpha_concentration_normalized,unit\nM1,1,picogram_per_milligram\nM2,NA,picogram_per_milligram\nM3,3,picogram_per_milligram\n",
    );
    expect(metrics).toEqual([
      expect.objectContaining({ biomarkerId: "tnf_alpha_concentration_normalized", label: "TNF-alpha", unit: "pg/mg", group: "all samples", n: 2, mean: 2 }),
    ]);
  });

  it("reads genotype groups from the sample name and does not invent a BMD change", () => {
    const { metrics, omissions } = parseTransformedCsv(
      "OSD-661",
      "fixture.csv",
      "Sample Name,body_fat_percent,baseline_regional_BMD\n1_Flox_HLS,10,30\n2_Flox_HLS,,40\n1_KD_HLS,8,36\n",
    );
    const fat = metrics.find((metric) => metric.biomarkerId === "body_fat_percent" && metric.group === "Flox_HLS");
    const bmd = metrics.find((metric) => metric.biomarkerId === "baseline_regional_BMD" && metric.group === "Flox_HLS");
    expect(fat).toMatchObject({ n: 1, mean: 10, unit: "%" });
    expect(bmd).toMatchObject({ n: 2, mean: 35 });
    expect(metrics.some((metric) => /change/i.test(metric.biomarkerId))).toBe(false);
    expect(omissions.some((note) => /BMD-change/.test(note))).toBe(true);
  });

  it("drops a dose column from OSD-489", () => {
    const { metrics } = parseTransformedCsv(
      "OSD-489",
      "fixture.csv",
      "Sample Name,Factor Value,bone_volume_mm_third,dose_mSv\nA,Flight,1,9\nB,Flight,3,NA\nC,Baseline,2,4\n",
    );
    expect(metrics.map((metric) => metric.biomarkerId)).toEqual(["bone_volume_mm_third", "bone_volume_mm_third"]);
    expect(metrics.find((metric) => metric.group === "Flight")).toMatchObject({ n: 2, mean: 2, unit: "mm³" });
    expect(JSON.stringify(metrics)).not.toMatch(/dose|mSv|9/);
  });
});

describe("live reading colors", () => {
  it("bands HRV, exercise, and cabin dose", () => {
    expect(hrvTone(30.1)).toBe("green");
    expect(hrvTone(30)).toBe("amber");
    expect(hrvTone(20)).toBe("amber");
    expect(hrvTone(19.9)).toBe("red");
    expect(exerciseTone(150, 150)).toBe("green");
    expect(exerciseTone(90, 150)).toBe("amber");
    expect(exerciseTone(89, 150)).toBe("red");
    expect(doseTone(0.099)).toBe("green");
    expect(doseTone(0.1)).toBe("amber");
    expect(doseTone(0.3)).toBe("amber");
    expect(doseTone(0.301)).toBe("red");
  });
});

describe("co-pilot grounding", () => {
  it("puts only parsed means in the prompt and stays quiet without biomarkers", () => {
    const parsed = parseTransformedCsv(
      "OSD-489",
      "fixture.csv",
      "Sample Name,Factor Value,trabecular_thickness_mm,cabin_dose_mSv\nA,Flight,0.06,1.5\n",
    ).metrics;
    const block = osdrBaselineBlock([
      { id: "OSD-489", theme: "Microgravity bone structure", gapNote: "This file is not a dosimeter log.", metrics: parsed },
    ]);
    expect(block).toContain("0.0600 mm");
    expect(block).toContain("not a dosimeter");
    expect(block).toContain("cabin sensor only");
    expect(block).not.toMatch(/1\.5|mSv/);
    expect(osdrBaselineBlock([{ id: "OSD-751", theme: "x", gapNote: "", metrics: [] }])).toBe("");
  });

  it("appends one citation sentence and does not quote a dose from OSD-489", () => {
    const cite = osdrFallbackCitation("How is my HRV?", studies);
    expect(cite).toMatch(/^OSD-751 /);
    expect(cite).toContain("n=");
    const tnf = studies.find((study) => study.id === "OSD-751")!.metrics.find((metric) => /tnf/i.test(metric.biomarkerId))!;
    expect(cite).toContain(String(tnf.n));

    const radiation = osdrFallbackCitation("What is the cabin radiation?", studies);
    expect(radiation).toMatch(/OSD-489/);
    expect(radiation).toMatch(/not a dosimeter/);
    expect(radiation).not.toMatch(/mSv|\(n=|\d+\.\d+/);

    expect(osdrFallbackCitation("What should I eat?", studies)).toBeNull();
    expect(osdrFallbackCitation("How is my HRV?", [])).toBeNull();
  });

  it("lets the rules fallback append that citation only for a matching question", () => {
    const ctx = {
      userName: "Vance",
      vitalsSummary: "HRV 71 ms",
      risk: "GREEN" as const,
      osdrStudies: studies,
    };
    expect(generateCopilotFallback("How is HRV?", ctx)).toMatch(/OSD-751 .+\(n=\d+\)/);
    expect(generateCopilotFallback("What should I eat?", ctx)).not.toMatch(/OSD-751|OSD-661|OSD-489/);
  });
});

describe("cache source", () => {
  it("uses the database when rows exist and the snapshot otherwise", () => {
    expect(resolveStoredStudies(null, saved).source).toBe("snapshot");
    expect(resolveStoredStudies([], saved).source).toBe("snapshot");
    const database = resolveStoredStudies(saved, []);
    expect(database.source).toBe("database");
    expect(database.studies.map((study) => study.id)).toEqual(["OSD-751", "OSD-661", "OSD-489"]);
  });
});

describe("checked-in NASA snapshot", () => {
  it("has file-derived means for all three studies and no OSD-489 dose", () => {
    expect(studies.map((study) => study.id)).toEqual(["OSD-751", "OSD-661", "OSD-489"]);
    const cortex = studies[0];
    const tnf = cortex.metrics.find((metric) => metric.biomarkerId === "tnf_alpha_concentration_normalized");
    expect(tnf).toMatchObject({ group: "all samples", n: 8, unit: "pg/mg" });
    expect(tnf!.mean).toBeCloseTo(0.059612238875, 6);

    const bone = studies[1];
    expect(bone.metrics.some((metric) => metric.biomarkerId === "body_fat_percent" && metric.group === "Flox_HLS" && metric.n === 4)).toBe(true);
    expect(bone.metrics.some((metric) => /change/i.test(metric.biomarkerId))).toBe(false);
    expect(bone.mission).toBe("Not listed");

    const micro = studies[2];
    expect(new Set(micro.metrics.map((metric) => metric.group))).toEqual(new Set(["Baseline", "Vivarium", "Flight", "Ground Control"]));
    expect(micro.metrics.some((metric) => /bone_volume|trabecular_thickness|trabecular_number/i.test(metric.biomarkerId))).toBe(true);
    expect(micro.metrics.some((metric) => /dose|radiation|msv|sievert/i.test(`${metric.biomarkerId} ${metric.label} ${metric.unit}`))).toBe(false);
    expect(micro.gapNote).toMatch(/not a dosimeter/i);
    expect(micro.files.some((file) => file.url)).toBe(true);
  });
});
