import { riskLabel, type RiskLevel } from "@/lib/risk";
import { osdrFallbackCitation, type OsdrStudy } from "@/lib/osdr";
import { findEvidence, type EvidenceCard } from "./copilotEvidence";
import { emergencyGuidance, medicationGuidance } from "./copilotGuidance";
import { findProtocols } from "./copilotKnowledge";
import { isDailyCheckQuestion } from "./copilotDailyCheck";

export type CopilotContext = {
  userName: string;
  vitalsSummary: string;
  risk: RiskLevel | null;
  dailyCheck?: string;
  osdrStudies?: Pick<OsdrStudy, "id" | "metrics" | "gapNote">[];
};

const suggestions: Record<string, string> = {
  dizziness: "Pause the task, get into a safe position, and ask a crewmate or the CMO for help if the dizziness persists or worsens.",
  headache: "Review cabin CO₂, hydration, and recent sleep. Report a persistent or worsening headache to the CMO.",
  sleep: "Review your last sleep period and schedule with the crew medical officer before safety-critical work if you are fatigued.",
  arrhythmia: "Pause strenuous activity and report a new irregular rhythm to the onboard CMO. Record the time and any symptoms.",
  eva: "Ask the onboard CMO and commander to review EVA readiness with the current mission checklist.",
  nausea: "Record when nausea began and any other symptoms. Ask the onboard CMO for help if symptoms persist, worsen, or you cannot keep fluids down.",
  hydration: "Review your last 24-hour report and follow your hydration plan. You can record new intake with Log water on your Low fluid intake alert in My monitoring.",
  glucose: "Check when the reading was taken and whether you were fasting. Ask the onboard CMO to review an out-of-range reading or symptoms.",
};

/** An evidence-backed answer for the questions the offline rules can match. */
export function generateCopilotFallback(
  question: string,
  ctx: CopilotContext,
  evidence: EvidenceCard[] = findEvidence(question),
): string {
  const safety = emergencyGuidance(question) ?? medicationGuidance(question);
  if (safety) return safety;
  if (isDailyCheckQuestion(question)) {
    return ctx.dailyCheck ?? `I don’t have a Daily Check available for ${ctx.userName}.`;
  }

  const research = evidence[0];
  const osdr = osdrFallbackCitation(question, ctx.osdrStudies ?? []);
  const readingQuestion = /\b(?:my|current|latest|show|check|reading|readings|vitals|how is|is .* okay)\b/i.test(question);
  const vitalTopic = /\b(?:vitals|heart rate|pulse|hrv|spo2|oxygen saturation|radiation|dosimeter|okay)\b/i.test(question);
  if (readingQuestion && vitalTopic) {
    const status = ctx.risk ? ` Console status: ${riskLabel(ctx.risk)}.` : "";
    return [`${ctx.userName}: ${ctx.vitalsSummary}.${status}`, osdr].filter(Boolean).join(" ");
  }
  if (research && /\b(?:why|research|study|nasa|evidence|explain|risk)\b/i.test(question)) {
    return `${research.finding} ${research.limit} [${research.id}]`;
  }
  const protocol = findProtocols(question, [], 1)[0]?.id;
  return [
    protocol ? suggestions[protocol] : undefined,
    research ? `${research.finding} [${research.id}]` : osdr,
  ].filter(Boolean).join(" ") || "I don’t have enough relevant onboard information to answer that. Try naming the symptom, reading, or NASA study you want to review.";
}
