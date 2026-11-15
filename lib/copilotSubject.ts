import { assessRisk, describeVitals, type RiskLevel, type VitalSignals } from "./risk";
import { keywordScore } from "./copilotEvidence";

export type CopilotVitals = VitalSignals & { timestamp?: string | number };

/** A crew member's latest reading and personal baseline. */
export type CrewBrief = {
  name: string;
  callsign: string;
  risk: RiskLevel;
  vitals: CopilotVitals | null;
  usualHr: number | null;
  usualHrv: number | null;
};

export type CopilotSession = {
  userId: string;
  userName: string;
  patientName?: string;
  crew?: CrewBrief[];
  displayVitals?: CopilotVitals;
  simulatedArrhythmia?: boolean;
};

export function selectSubject(question: string, session: CopilotSession, previousName?: string) {
  const selectedName = session.patientName ?? session.userName;
  const self = /\b(?:my|i|me|myself)\b/i.test(question);
  const crew = session.crew ?? [];
  const named = crew.filter(({ name, callsign }) =>
    keywordScore(question, [name.toLowerCase(), ...(callsign.length > 2 ? [callsign.toLowerCase()] : [])]) > 0
  );
  // A surname can select a crew member only if it has a unique match.
  const surnameMatches = named.length ? named : crew.filter(({ name }) => {
    const surname = name.toLowerCase().split(/\s+/).at(-1) ?? "";
    return surname.length > 2 && keywordScore(question, [surname]) > 0;
  });
  if (surnameMatches.length > 1) return null;
  const name = surnameMatches[0]?.name ?? (self ? session.userName : previousName ?? selectedName);
  const member = crew.find((item) => item.name === name);
  return {
    name,
    member,
    own: name === session.userName,
    vitals: name === selectedName ? session.displayVitals ?? member?.vitals : member?.vitals,
  };
}

export function describeSubjectVitals(vitals?: CopilotVitals | null) {
  const at = vitals?.timestamp == null ? NaN : new Date(vitals.timestamp).getTime();
  return {
    summary: [
      vitals ? describeVitals(vitals) : "no vitals available",
      vitals?.arrhythmia ? "irregular heart rhythm on ECG" : "",
      Number.isFinite(at) ? `recorded ${new Date(at).toISOString()}` : "",
    ].filter(Boolean).join(", "),
    risk: vitals ? assessRisk(vitals) : null,
  };
}

export function describePersonalBaseline(member?: CrewBrief, vitals?: VitalSignals | null) {
  const compare = (label: string, unit: string, usual: number | null | undefined, current?: number | null) => {
    if (usual == null) return "";
    const reference = "usual " + label + " " + Math.round(usual) + " " + unit;
    if (current == null) return reference;
    const delta = Math.round(current) - Math.round(usual);
    return reference + (delta === 0 ? " (matches available reading)" : " (available reading is " + Math.abs(delta) + " " + unit + (delta > 0 ? " higher)" : " lower)"));
  };
  return [
    compare("heart rate", "bpm", member?.usualHr, vitals?.heartRate),
    compare("HRV", "ms", member?.usualHrv, vitals?.hrv),
  ].filter(Boolean).join(", ");
}
