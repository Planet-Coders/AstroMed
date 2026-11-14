/**
 * The five monitored metrics: what each measures, how often a value is expected, the
 * default alert thresholds, and why NASA watches it. Every citation below was checked to
 * resolve (NTRS record, OSDR study page or NASA standards PDF) on 2026-11-04.
 * Thresholds are demo defaults chosen from these sources; a super admin can tune them.
 */

export type MetricId = "sleep" | "activity" | "pulse" | "hydration" | "radiation";

export type Citation = {
  source: "NTRS" | "OSDR" | "NASA standard";
  id: string;
  title: string;
  year: number;
  url: string;
  /** What this source contributes to the metric. */
  use: string;
};

export type RuleDefault = {
  id: string;
  kind: "threshold" | "trend" | "missing";
  comparator: "above" | "below";
  amber: number;
  red: number;
  windowDays: number;
  label: string;
};

export type MetricDef = {
  id: MetricId;
  label: string;
  unit: string;
  /** How a day's value is formed from several samples. */
  daily: "sum" | "mean" | "last";
  decimals: number;
  definition: string;
  /** Where values come from in the app. */
  source: string;
  /** Hours between expected values; drives the missing-data badge. */
  cadenceHours: number;
  lateAfterHours: number;
  missingAfterHours: number;
  rationale: string;
  rules: RuleDefault[];
  citations: Citation[];
};

const ntrs = (id: string, title: string, year: number, use: string): Citation => ({
  source: "NTRS",
  id,
  title,
  year,
  url: `https://ntrs.nasa.gov/citations/${id}`,
  use,
});

const osdr = (id: string, title: string, year: number, use: string): Citation => ({
  source: "OSDR",
  id,
  title,
  year,
  url: `https://osdr.nasa.gov/bio/repo/data/studies/${id}`,
  use,
});

const missing = (metric: MetricId, label: string, amber: number, red: number): RuleDefault => ({
  id: `${metric}_missing`,
  kind: "missing",
  comparator: "above",
  amber,
  red,
  windowDays: 1,
  label: `${label}: no data`,
});

export const METRICS: MetricDef[] = [
  {
    id: "sleep",
    label: "Sleep",
    unit: "h",
    daily: "last",
    decimals: 1,
    definition: "Hours of sleep in the main sleep period, from the wearable or the crew sleep log.",
    source: "Habitat & routine sleep log (one value per night)",
    cadenceHours: 24,
    lateAfterHours: 30,
    missingAfterHours: 48,
    rationale:
      "Astronauts sleep less in flight than on the ground, and sleep loss, circadian misalignment and work overload degrade performance and raise error risk. Continuous actigraphy on long-duration missions captures sleep changes that occasional checks miss, so sleep is tracked every night and a multi-day average flags building sleep debt.",
    rules: [
      { id: "sleep_low", kind: "threshold", comparator: "below", amber: 6, red: 5, windowDays: 3, label: "Sleep debt" },
      missing("sleep", "Sleep", 30, 48),
    ],
    citations: [
      ntrs(
        "20160003864",
        "Risk of Performance Decrements and Adverse Health Outcomes Resulting from Sleep Loss, Circadian Desynchronization, and Work Overload (HRP Evidence Report)",
        2016,
        "Why sleep loss is a crew health and performance risk."
      ),
      ntrs(
        "20220014774",
        "Comparison Between Continuous and Intermittent Actigraphy Outcomes During Long-Duration Missions",
        2023,
        "Why sleep is measured every night rather than in occasional blocks."
      ),
    ],
  },
  {
    id: "activity",
    label: "Exercise",
    unit: "min",
    daily: "sum",
    decimals: 0,
    definition: "Minutes of countermeasure exercise per day on the resistance device, treadmill and cycle.",
    source: "Habitat & routine exercise log (wearable sessions + manual entries)",
    cadenceHours: 24,
    lateAfterHours: 30,
    missingAfterHours: 48,
    rationale:
      "Without gravity, muscle mass, strength and aerobic capacity fall. On the ISS, crew who keep to the daily exercise prescription (about 2.5 h across resistance and aerobic devices) return with minimal losses on average, so falling below the plan for several days is an early warning.",
    rules: [
      { id: "activity_low", kind: "threshold", comparator: "below", amber: 90, red: 45, windowDays: 3, label: "Exercise below plan" },
      missing("activity", "Exercise", 30, 48),
    ],
    citations: [
      ntrs(
        "20220019338",
        "Risk of Impaired Performance Due to Reduced Muscle Mass, Strength & Endurance, and Risk of Reduced Physical Performance Capabilities Due to Reduced Aerobic Capacity (HRP Evidence Report)",
        2023,
        "Why daily countermeasure exercise is prescribed and monitored."
      ),
      osdr(
        "OSD-195",
        "Effects of 21 days of bedrest on human skeletal muscle gene expression",
        2018,
        "Open human data on muscle changes from disuse, the ground analog of weightlessness."
      ),
    ],
  },
  {
    id: "pulse",
    label: "Pulse trend",
    unit: "bpm",
    daily: "mean",
    decimals: 0,
    definition: "Daily average heart rate from the wearable, compared with the crew member's own previous week.",
    source: "Wearable vitals (BiometricRecord, synced from the crew console)",
    cadenceHours: 1,
    lateAfterHours: 6,
    missingAfterHours: 18,
    rationale:
      "Spaceflight lowers plasma volume, changes heart size and shifts autonomic control. Rhythm problems have been seen in flight, and a heart rate that drifts up over days can reflect deconditioning, dehydration, illness or stress. A personal trend catches a rise that is still inside the population normal range.",
    rules: [
      { id: "pulse_high", kind: "threshold", comparator: "above", amber: 100, red: 120, windowDays: 1, label: "High heart rate" },
      { id: "pulse_trend", kind: "trend", comparator: "above", amber: 8, red: 15, windowDays: 7, label: "Rising heart rate trend" },
      missing("pulse", "Heart rate", 6, 18),
    ],
    citations: [
      ntrs(
        "20170005625",
        "Risk of Cardiac Rhythm Problems During Spaceflight (HRP Evidence Report)",
        2017,
        "Cardiovascular changes in flight and why heart rhythm is monitored."
      ),
      osdr(
        "OSD-575",
        "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays",
        2024,
        "Open astronaut data with cardiac markers before, during and after flight."
      ),
    ],
  },
  {
    id: "hydration",
    label: "Hydration",
    unit: "mL",
    daily: "last",
    decimals: 0,
    definition: "Self-reported fluid intake over the last 24 hours (mL), with urine colour on a 1–8 chart.",
    source: "Daily self-check, hydration step (self-report)",
    cadenceHours: 24,
    lateAfterHours: 30,
    missingAfterHours: 48,
    rationale:
      "Relative dehydration, together with calcium released from bone, raises urine supersaturation and kidney-stone risk in flight. A NASA study found long-duration crew producing more than 2.5 L of urine a day appeared to minimise stone risk, while lower volumes raised it, so a daily intake target near 2–2.5 L is tracked.",
    rules: [
      { id: "hydration_low", kind: "threshold", comparator: "below", amber: 2000, red: 1500, windowDays: 2, label: "Low fluid intake" },
      missing("hydration", "Hydration", 30, 48),
    ],
    citations: [
      ntrs("20240012429", "Evidence Report: Risk of Renal Stone Formation (2024 update)", 2024, "Dehydration as a main driver of kidney-stone risk in flight."),
      ntrs("20000020539", "Renal Stone Risk During Space Flight", 1999, "Urine volume above 2.5 L/day appeared to minimise stone risk."),
      osdr(
        "OSD-575",
        "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays",
        2024,
        "Open astronaut metabolic panel (sodium, BUN, creatinine): blood markers of hydration."
      ),
      osdr(
        "OSD-569",
        "Whole Blood Measurements from the SpaceX Inspiration4 Mission (incl. CBC)",
        2024,
        "Open astronaut blood counts, including haematocrit, which shifts with fluid balance."
      ),
    ],
  },
  {
    id: "radiation",
    label: "Radiation dose",
    unit: "mSv/day",
    daily: "mean",
    decimals: 2,
    definition: "Daily dose from the cabin dosimeter (dose rate × 24 h), in the context of the mission's space weather.",
    source: "Cabin dosimeter readings (BiometricRecord radiation, mSv/h × 24) and NOAA / NASA DONKI space weather",
    cadenceHours: 1,
    lateAfterHours: 6,
    missingAfterHours: 24,
    rationale:
      "Galactic cosmic rays give a steady background dose on a Mars transit; a solar particle event can add a large dose within hours and cause acute radiation effects. NASA limits career effective dose to 600 mSv, so daily dose is tracked against the mission background and a sudden jump triggers shelter procedures.",
    rules: [
      { id: "radiation_high", kind: "threshold", comparator: "above", amber: 2.5, red: 10, windowDays: 1, label: "Radiation dose above background" },
      missing("radiation", "Dosimeter", 6, 24),
    ],
    citations: [
      ntrs(
        "20160003870",
        "Evidence Report: Risk of Acute Radiation Syndromes Due to Solar Particle Events",
        2016,
        "Why a solar particle event needs immediate detection and shelter."
      ),
      ntrs(
        "20240012790",
        "RadLab: A Comprehensive Database and Graphical and Programming Interfaces for Space Radiation Data (NASA OSDR)",
        2024,
        "OSDR's database of measured spacecraft dose rates, used as the reference for dose data."
      ),
      {
        source: "NASA standard",
        id: "NASA-STD-3001 Vol. 1 Rev C",
        title: "NASA Space Flight Human-System Standard, Volume 1: Crew Health",
        year: 2023,
        url: "https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf",
        use: "The 600 mSv career effective dose limit.",
      },
    ],
  },
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;

export const DEFAULT_RULES = METRICS.flatMap((m) => m.rules.map((r) => ({ ...r, metric: m.id })));

export function formatValue(metric: MetricId, v: number) {
  const m = METRIC[metric];
  return `${v.toFixed(m.decimals)} ${m.unit}`;
}
