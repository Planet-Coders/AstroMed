/**
 * Small onboard protocol library for the co-pilot. A 1B model knows little spaceflight
 * medicine and invents details, so each question pulls the few most relevant cards into
 * the prompt (keyword match, plus any card triggered by an out-of-range reading).
 * Demo guidance only, written in the style of ISS flight-surgeon checklists.
 */

import { INJURY_TYPES } from "@/lib/injuries";
import { keywordScore } from "./copilotEvidence";

export type ProtocolCard = {
  id: string;
  title: string;
  keywords: string[];
  text: string;
};

export const PROTOCOLS: ProtocolCard[] = [
  {
    id: "tachycardia",
    title: "High heart rate (above 100 bpm at rest)",
    keywords: ["heart rate", "tachy", "fast heart", "pulse", "bpm", "palpitation", "racing"],
    text: "Common causes in flight: exertion, stress, dehydration, fever, low oxygen, high CO2. Stop strenuous work, rest 10 minutes and recheck. Hydrate. If over 120 bpm at rest, irregular, or with chest pain or fainting, treat as urgent and notify the CDR and ground surgeon.",
  },
  {
    id: "bradycardia",
    title: "Low heart rate (below 55 bpm)",
    keywords: ["slow heart", "brady", "low heart rate"],
    text: "Often normal in fit crew at rest or asleep. Concerning only with dizziness, fainting or confusion. Recheck after the crew member sits up and moves; escalate if symptoms appear.",
  },
  {
    id: "hypoxia",
    title: "Low SpO2 (below 95%)",
    keywords: ["spo2", "oxygen", "saturation", "breath", "hypoxia", "short of breath"],
    text: "If the crew member is stable, re-seat the sensor and recheck. Check cabin oxygen and CO2. Notify the onboard CMO promptly if the reading stays low, is falling, or there are symptoms.",
  },
  {
    id: "hrv",
    title: "Low HRV (30 ms or less)",
    keywords: ["hrv", "variability", "stress", "fatigue", "tired", "recovery"],
    text: "Low heart rate variability signals stress, fatigue, poor sleep, illness or overtraining. Lighten workload, protect the next sleep period, hydrate, and recheck after rest. Combined with high heart rate it supports pulling the crew member from demanding tasks such as EVA.",
  },
  {
    id: "arrhythmia",
    title: "Irregular rhythm",
    keywords: ["irregular", "arrhythm", "afib", "atrial", "skipped beat", "ecg", "rhythm"],
    text: "Record a rhythm strip, stop exertion and keep the crew member seated and restrained. Check for chest pain, breathlessness or dizziness. A new irregular rhythm is reported to the ground surgeon at the next link; with symptoms, treat as an emergency.",
  },
  {
    id: "chest",
    title: "Chest pain",
    keywords: ["chest", "angina", "heart attack", "pressure in chest"],
    text: "Stop activity and contact the onboard CMO and commander immediately for new or ongoing chest pain. Do not delay help to collect measurements.",
  },
  {
    id: "radiation",
    title: "Radiation and solar particle events",
    keywords: ["radiation", "solar", "flare", "dose", "sievert", "msv", "shelter", "spe"],
    text: "Deep-space background is about 0.05-0.08 mSv/h. Above 0.1 mSv/h log the dose and limit time in lightly shielded modules. Above 1.0 mSv/h, or on a solar particle event alert, all crew move to the storm shelter and stay until levels drop. No EVA during an event.",
  },
  {
    id: "co2",
    title: "High cabin CO2 (ppCO2)",
    keywords: ["co2", "carbon dioxide", "ppco2", "scrubber", "air", "stuffy"],
    text: "Flight rule limit is 4.0 mmHg. Symptoms include headache, slowed thinking and poorer reaction times. Boost the scrubber, improve air flow in the module, and move crew to a better ventilated area. Recheck the cognitive test after levels fall.",
  },
  {
    id: "dizziness",
    title: "Dizziness and fluid shift",
    keywords: ["dizzy", "dizziness", "lightheaded", "vertigo", "faint", "headrush"],
    text: "Usually fluid shift, dehydration or space adaptation. Restrain the crew member, avoid quick head movements, hydrate, and check heart rate and SpO2. Escalate if they faint, vomit repeatedly or have weakness, numbness or speech problems.",
  },
  {
    id: "headache",
    title: "Headache",
    keywords: ["headache", "head ache", "migraine", "head hurts"],
    text: "Review cabin CO2, hydration and recent sleep. A sudden severe headache or one with confusion, weakness or vision changes calls for immediate onboard help.",
  },
  {
    id: "nausea",
    title: "Nausea and space motion sickness",
    keywords: ["nausea", "nauseous", "vomit", "sick", "motion sickness", "stomach"],
    text: "Common in the first days of flight. Keep head still, limit visual motion, small sips of fluid. Anti-nausea medication per CMO protocol. Watch hydration closely if vomiting.",
  },
  {
    id: "sleep",
    title: "Sleep",
    keywords: ["sleep", "insomnia", "rest", "tired", "fatigue", "melatonin"],
    text: "Target is 8.5 hours per sleep period. Under 6 hours raises error risk: avoid scheduling critical tasks, EVA or robotics for that crew member. Improve sleep with light control, quiet crew quarters and consistent timing.",
  },
  {
    id: "hydration",
    title: "Hydration follow-up in AstroMed",
    keywords: ["hydration", "dehydration", "fluid intake", "water intake", "urine colour", "urine color"],
    text: "Review the crew member's 24-hour fluid report and follow the mission hydration plan. Log additional water on the Low fluid intake alert in My monitoring. The intake alert tracks reported fluid; urine colour is tracked separately.",
  },
  {
    id: "glucose",
    title: "Blood sugar follow-up in AstroMed",
    keywords: ["glucose", "blood sugar", "fasting", "insulin"],
    text: "Check whether the reading was fasting and when it was taken. A single reading is insufficient for a diagnosis. Ask the CMO to review out-of-range or symptomatic readings.",
  },
  {
    id: "exercise",
    title: "Exercise countermeasures",
    keywords: ["exercise", "workout", "treadmill", "ared", "muscle", "bone", "cycle"],
    text: "About 2.5 hours a day of resistance, treadmill and cycle work protects bone and muscle in weightlessness. Missing it for several days speeds loss. Skip or lighten sessions when heart rate is high at rest, HRV is low, or the crew member is ill.",
  },
  {
    id: "pvt",
    title: "Cognitive vigilance test (PVT)",
    keywords: ["pvt", "reaction", "cognitive", "vigilance", "alert", "lapse", "focus"],
    text: "Mean reaction time around 250-350 ms is typical. Slower times or several lapses over 500 ms point to fatigue, sleep loss or high CO2. Repeat after rest; avoid critical tasks while scores are poor.",
  },
  {
    id: "medkit",
    title: "Onboard medical kit",
    keywords: ["medicine", "medication", "drug", "pill", "dose", "take", "painkiller", "pain", "ibuprofen", "acetaminophen", "paracetamol", "tylenol", "promethazine", "meclizine", "melatonin", "loratadine", "antihistamine", "kit"],
    text: "The onboard CMO checks allergies, current medicines and the mission formulary before choosing any medication.",
  },
  {
    id: "allergy",
    title: "Allergic reaction",
    keywords: ["allerg", "rash", "hives", "swelling", "anaphyla", "itch", "wheez"],
    text: "Breathing difficulty, throat swelling or fainting during a suspected reaction requires immediate onboard help. Contact the CMO and commander and follow the approved emergency procedure.",
  },
  {
    id: "comms",
    title: "Ground support and communication delay",
    keywords: ["ground", "earth", "mission control", "doctor", "surgeon", "delay", "consult", "call"],
    text: "Earth is about 20 minutes away one way, so any question to the ground surgeon takes 40+ minutes to answer. Urgent care must start onboard with the CMO and CDR; send the ground a time-stamped summary of vitals, symptoms and actions taken.",
  },
  {
    id: "eva",
    title: "EVA readiness",
    keywords: ["eva", "spacewalk", "suit", "go for eva", "fit for"],
    text: "Go for EVA needs normal heart rate, SpO2 95% or higher, adequate sleep, no illness and no active radiation event. Any WARNING status, low SpO2, or a radiation alert is a no-go until resolved and cleared by the flight surgeon.",
  },
  {
    id: "menstrual",
    title: "Periods and menstrual problems",
    keywords: ["period", "menstrua", "cramp", "cycle", "bleeding", "pms", "tampon", "pad", "suppression", "spotting"],
    text: "Record changes in flow, pain and associated symptoms. Contact the CMO for unusually heavy or prolonged bleeding, severe pain, fever, dizziness or breathlessness.",
  },
  // First-aid cards for external injuries, from the same text the body map shows.
  ...Object.entries(INJURY_TYPES)
    .filter(([id]) => id !== "other")
    .map(([id, t]) => ({
      id: `injury-${id}`,
      title: `First aid: ${t.label}`,
      keywords: t.keywords,
      text: `${t.steps.join(" ")} ${t.escalate}`,
    })),
];

/**
 * Pick the cards most relevant to a question: the two best keyword matches first (what
 * was actually asked), then cards named by `forced` (out-of-range readings), then any
 * other matches, up to `limit` cards.
 */
export function findProtocols(question: string, forced: string[] = [], limit = 4): ProtocolCard[] {
  const scored = PROTOCOLS.map((card) => ({
    card,
    score: keywordScore(question, card.keywords),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.card);

  const picked: ProtocolCard[] = scored.slice(0, 2);
  for (const id of forced) {
    const card = PROTOCOLS.find((c) => c.id === id);
    if (card && !picked.includes(card)) picked.push(card);
  }
  for (const card of scored) {
    if (!picked.includes(card)) picked.push(card);
  }
  return picked.slice(0, limit);
}

/**
 * Go/no-go for EVA worked out in code, so the model reports a decision instead of
 * reasoning its way to the wrong one.
 */
export function evaRecommendation(r: {
  heartRate?: number;
  hrv?: number;
  spo2?: number;
  radiation?: number;
  sleepHours?: number;
  arrhythmia?: boolean;
}): string {
  const reasons: string[] = [];
  if (r.arrhythmia) reasons.push("irregular heart rhythm");
  if (r.heartRate != null && r.heartRate > 100) reasons.push(`high resting heart rate (${Math.round(r.heartRate)} bpm)`);
  if (r.spo2 != null && r.spo2 < 95) reasons.push(`low SpO2 (${Math.round(r.spo2)}%)`);
  if (r.hrv != null && r.hrv <= 30) reasons.push(`low HRV (${Math.round(r.hrv)} ms)`);
  if (r.radiation != null && r.radiation >= 0.1) reasons.push("elevated radiation");
  if (r.sleepHours != null && r.sleepHours < 6) reasons.push(`short sleep (${r.sleepHours.toFixed(1)} h)`);
  return reasons.length
    ? `Hold EVA and ask the CMO to review ${reasons.join(", ")}.`
    : "The available readings cannot establish EVA clearance. Check with the CMO.";
}

/** Protocol ids triggered by a reading, using the same limits as the risk engine. */
export function protocolsForReadings(r: {
  heartRate?: number;
  hrv?: number;
  spo2?: number;
  radiation?: number;
  ppCO2?: number;
  arrhythmia?: boolean;
}): string[] {
  const ids: string[] = [];
  if (r.arrhythmia) ids.push("arrhythmia");
  if (r.spo2 != null && r.spo2 < 95) ids.push("hypoxia");
  if (r.heartRate != null && r.heartRate > 100) ids.push("tachycardia");
  if (r.radiation != null && r.radiation >= 0.1) ids.push("radiation");
  if (r.ppCO2 != null && r.ppCO2 > 4) ids.push("co2");
  if (r.hrv != null && r.hrv <= 30) ids.push("hrv");
  return ids;
}
