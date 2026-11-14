import type { RiskLevel } from "@/lib/risk";
import data from "@/lib/data/inspiration4-crew.json";

/**
 * Real blood labs for the crew.
 *
 * Each MTV-1 crew member is paired with one de-identified SpaceX Inspiration4 astronaut
 * from NASA OSDR (complete blood count OSD-569, metabolic panel OSD-575). Their real
 * pre-flight samples form that person's own baseline, and the first sample after
 * spaceflight is used as the "current" panel. Values are flagged against the lab's
 * reference range and against the person's own baseline.
 */

export type LabKey =
  | "glucose"
  | "calcium"
  | "alk_phos"
  | "creatinine"
  | "potassium"
  | "sodium"
  | "wbc"
  | "lymphocytes"
  | "neutrophils"
  | "hemoglobin"
  | "hematocrit"
  | "platelets";

export const LAB_INFO: Record<LabKey, { label: string; unit: string; why: string }> = {
  glucose: { label: "Glucose", unit: "mg/dL", why: "Insulin sensitivity drops in microgravity." },
  calcium: { label: "Calcium", unit: "mg/dL", why: "Bone breakdown releases calcium; kidney-stone risk." },
  alk_phos: { label: "Alkaline phosphatase", unit: "U/L", why: "Bone turnover marker." },
  creatinine: { label: "Creatinine", unit: "mg/dL", why: "Kidney function; falls with muscle loss." },
  potassium: { label: "Potassium", unit: "mmol/L", why: "Low levels can trigger heart rhythm problems." },
  sodium: { label: "Sodium", unit: "mmol/L", why: "Fluid shifts change salt and water balance." },
  wbc: { label: "White blood cells", unit: "×10³/µL", why: "Overall immune cell count." },
  lymphocytes: { label: "Lymphocytes", unit: "cells/µL", why: "Immune cells that drop with spaceflight stress." },
  neutrophils: { label: "Neutrophils", unit: "cells/µL", why: "First-line infection fighters." },
  hemoglobin: { label: "Hemoglobin", unit: "g/dL", why: "Oxygen carrying; 'space anemia' lowers it." },
  hematocrit: { label: "Hematocrit", unit: "%", why: "Share of blood that is red cells." },
  platelets: { label: "Platelets", unit: "×10³/µL", why: "Clotting; can shift with fluid changes." },
};

/** MTV-1 crew → de-identified Inspiration4 crew ID in OSDR. */
const PAIRING: Record<string, string> = {
  EV1: "C003",
  CDR: "C001",
  FE: "C002",
  CMO: "C004",
};

const PRE = ["L-92", "L-44", "L-3"];
const CURRENT = "R+1";

export type LabResult = {
  key: LabKey;
  label: string;
  unit: string;
  why: string;
  value: number;
  baseline: number;
  changePct: number;
  ref: [number, number] | null;
  level: RiskLevel;
  note: string;
};

export type CrewLabs = {
  sourceId: string;
  results: LabResult[];
  level: RiskLevel;
  flagged: LabResult[];
  history: { t: string; values: Partial<Record<LabKey, number>> }[];
};

const refs = data.ref as unknown as Record<string, [number, number]>;
type Timeline = Record<string, Partial<Record<LabKey, number>>>;
const crew = data.crew as unknown as Record<string, Timeline>;

function grade(key: LabKey, v: number, ref: [number, number] | null, changePct: number): { level: RiskLevel; note: string } {
  if (ref) {
    const span = ref[1] - ref[0];
    if (v < ref[0] - span * 0.15 || v > ref[1] + span * 0.15) return { level: "RED", note: v < ref[0] ? "well below normal" : "well above normal" };
    if (v < ref[0]) return { level: "YELLOW", note: "below normal" };
    if (v > ref[1]) return { level: "YELLOW", note: "above normal" };
  }
  // In range but far from this person's own baseline still deserves a look.
  if (Math.abs(changePct) >= 25) return { level: "YELLOW", note: `${changePct > 0 ? "up" : "down"} ${Math.abs(Math.round(changePct))}% from own baseline` };
  return { level: "GREEN", note: "normal" };
}

export function labsFor(callsign: string | null | undefined): CrewLabs | null {
  const id = callsign ? PAIRING[callsign.toUpperCase()] : undefined;
  const timeline = id ? crew[id] : undefined;
  if (!id || !timeline?.[CURRENT]) return null;

  const results: LabResult[] = (Object.keys(LAB_INFO) as LabKey[]).flatMap((key) => {
    const value = timeline[CURRENT][key];
    const pre = PRE.map((t) => timeline[t]?.[key]).filter((v): v is number => typeof v === "number");
    if (value == null || pre.length === 0) return [];
    const baseline = pre.reduce((a, b) => a + b, 0) / pre.length;
    const changePct = (value / baseline - 1) * 100;
    const ref = refs[key] ?? null;
    return [{ key, ...LAB_INFO[key], value, baseline, changePct, ref, ...grade(key, value, ref, changePct) }];
  });

  const flagged = results.filter((r) => r.level !== "GREEN");
  const level: RiskLevel = flagged.some((r) => r.level === "RED") ? "RED" : flagged.length ? "YELLOW" : "GREEN";
  const history = data.timepoints.filter((t) => timeline[t]).map((t) => ({ t, values: timeline[t] }));
  return { sourceId: id, results, level, flagged, history };
}

export function pick(labs: CrewLabs | null, ...keys: LabKey[]) {
  return labs ? labs.results.filter((r) => keys.includes(r.key)) : [];
}

const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2));
export const formatLab = (r: LabResult) => `${fmt(r.value)} ${r.unit}`;

/** One line for the co-pilot prompt. */
export function describeLabs(name: string, labs: CrewLabs | null): string {
  if (!labs) return `Blood labs for ${name}: none on file.`;
  const shown = labs.flagged.length ? labs.flagged : labs.results.slice(0, 4);
  return `Latest blood labs for ${name} (real Inspiration4 data, ${labs.sourceId}): ${shown
    .map((r) => `${r.label} ${formatLab(r)} (${r.note}${r.level === "GREEN" ? "" : r.level === "RED" ? ", ALERT" : ", watch"})`)
    .join("; ")}.`;
}
