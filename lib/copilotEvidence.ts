export type EvidenceCard = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
  finding: string;
  limit: string;
};

export const NASA_EVIDENCE: EvidenceCard[] = [
  {
    id: "NTRS 20240012429",
    title: "Risk of Renal Stone Formation",
    url: "https://ntrs.nasa.gov/citations/20240012429",
    keywords: ["hydration", "dehydration", "fluid intake", "drink water", "kidney stone", "renal stone", "urine", "thirst"],
    finding: "Relative dehydration and greater urinary calcium excretion in microgravity may raise kidney-stone risk.",
    limit: "An intake log or urine colour alone cannot diagnose dehydration or a kidney stone.",
  },
  {
    id: "NTRS 20160003864",
    title: "Sleep Loss and Crew Performance",
    url: "https://ntrs.nasa.gov/citations/20160003864",
    keywords: ["sleep", "fatigue", "tired", "circadian", "insomnia", "reaction time", "vigilance", "pvt"],
    finding: "Astronauts have generally slept less in flight than on Earth. Sleep loss and circadian disruption can impair performance.",
    limit: "The report does not set a personal sleep requirement or certify readiness for a task.",
  },
  {
    id: "NTRS 20170005625",
    title: "Risk of Cardiac Rhythm Problems During Spaceflight",
    url: "https://ntrs.nasa.gov/citations/20170005625",
    keywords: ["arrhythmia", "irregular rhythm", "ecg", "palpitation", "heart rate", "blood pressure", "heart rate variability", "hrv"],
    finding: "Spaceflight changes plasma volume and cardiovascular regulation. NASA documents some in-flight rhythm events, with limited evidence about incidence.",
    limit: "A pulse, HRV, or blood pressure reading cannot identify a rhythm disorder on its own.",
  },
  {
    id: "NTRS 20220019338",
    title: "Muscle and Aerobic Performance Risks",
    url: "https://ntrs.nasa.gov/citations/20220019338",
    keywords: ["exercise", "workout", "muscle", "bone", "countermeasure", "aerobic", "resistance"],
    finding: "Reduced loading can lead to muscle and aerobic deconditioning. Exercise is a countermeasure, with responses varying by person and available hardware.",
    limit: "The report cannot prescribe an individual workload.",
  },
  {
    id: "NTRS 20160003870",
    title: "Acute Radiation Syndromes and Solar Particle Events",
    url: "https://ntrs.nasa.gov/citations/20160003870",
    keywords: ["radiation", "dosimeter", "solar particle", "solar flare", "shelter", "msv", "dose rate", "spe"],
    finding: "Beyond low Earth orbit, major solar particle events can increase crew exposure. Monitoring and shielding help limit that exposure.",
    limit: "Use current dosimetry and mission procedures for an exposure assessment.",
  },
  {
    id: "OSD-575",
    title: "Inspiration4 Serum Metabolic Panel",
    url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
    keywords: ["glucose", "blood sugar", "fasting", "metabolic panel", "serum", "inspiration4"],
    finding: "The dataset contains preflight and postflight serum metabolic and cytokine measurements from four people on a three-day orbital flight.",
    limit: "These research measurements cannot diagnose a crew member or establish a Mars-mission reference range.",
  },
  {
    id: "NTRS 20250001454",
    title: "Behavioral Health and Performance",
    url: "https://ntrs.nasa.gov/citations/20250001454",
    keywords: ["mood", "isolation", "anxiety", "mental health", "behavioral health", "behavioural health", "confinement"],
    finding: "Isolation and other exploration hazards may affect behavioral health. Evidence for longer exploration missions is limited.",
    limit: "A single mood entry does not establish a diagnosis.",
  },
];

export function topicTokens(text: string) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

export function keywordScore(text: string, keywords: string[]) {
  const words = ` ${text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? ""} `;
  return keywords.reduce((score, keyword) => score + (words.includes(` ${keyword} `) ? keyword.length : 0), 0);
}

/** Retrieve a bounded set of curated excerpts without a network request or an embedding model. */
export function findEvidence(question: string, limit = 2): EvidenceCard[] {
  return NASA_EVIDENCE
    .map((card) => ({ card, score: keywordScore(question, card.keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ card }) => card);
}
