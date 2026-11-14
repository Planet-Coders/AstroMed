import { CHECK_LIMITS } from "../selfCheckThresholds";

export type MetricId =
  | "sleep" | "activity" | "pulse" | "hydration" | "radiation"
  | "systolic" | "diastolic" | "glucose_fasting" | "glucose_after_meal" | "temperature" | "mood" | "urine_color";

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
  kind: "threshold" | "latest" | "trend" | "missing";
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

const latest = (
  id: string, label: string, comparator: RuleDefault["comparator"], limits: { amber: number; red: number },
): RuleDefault => ({ id, label, kind: "latest", comparator, ...limits, windowDays: 2 });

function selfCheckMetric(
  id: MetricId, label: string, unit: string, decimals: number, definition: string, rules: RuleDefault[], rationale: string, citations: Citation[],
): MetricDef {
  return {
    id, label, unit, decimals, definition, rules, rationale, citations,
    daily: "last", source: "Daily self-check", cadenceHours: 24, lateAfterHours: 30, missingAfterHours: 48,
  };
}

const cardiacEvidence = ntrs("20170005625", "Risk of Cardiac Rhythm Problems During Spaceflight", 2017, "Cardiovascular changes in flight.");
const glucoseEvidence = osdr("OSD-575", "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays", 2024, "Inspiration4 crew glucose measurements.");
const stoneEvidence = ntrs("20240012429", "Evidence Report: Risk of Renal Stone Formation (2024 update)", 2024, "Dehydration as a driver of kidney-stone risk.");

export const METRICS: MetricDef[] = [
  {
    id: "sleep",
    label: "Sleep",
    unit: "h",
    daily: "last",
    decimals: 1,
    definition: "Hours of sleep in the main sleep period. The latest Daily Check entry for the night takes precedence over the routine log.",
    source: "Daily self-check and Habitat & routine sleep log",
    cadenceHours: 24,
    lateAfterHours: 30,
    missingAfterHours: 48,
    rationale:
      "Astronauts sleep less in flight than on the ground, and sleep loss, circadian misalignment and work overload degrade performance and raise error risk. Continuous actigraphy on long-duration missions captures sleep changes that occasional checks miss, so sleep is tracked every night and a multi-day average flags building sleep debt.",
    rules: [
      { id: "sleep_low", kind: "threshold", comparator: "below", amber: 6, red: 5, windowDays: 3, label: "Sleep debt" },
      latest("self_check_sleep_low", "Short sleep in Daily Check", "below", CHECK_LIMITS.sleepLow),
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
    definition: "Total newly logged fluid intake for each UTC day. Earlier 24-hour reports are shown as snapshots.",
    source: "Daily self-check, hydration step (self-report)",
    cadenceHours: 24,
    lateAfterHours: 30,
    missingAfterHours: 48,
    rationale:
      "Relative dehydration, together with calcium released from bone, raises urine supersaturation and kidney-stone risk in flight. A NASA study found long-duration crew producing more than 2.5 L of urine a day appeared to minimise stone risk, while lower volumes raised it, so a daily intake target near 2–2.5 L is tracked.",
    rules: [
      latest("hydration_low", "Low fluid intake", "below", CHECK_LIMITS.hydrationLow),
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
  selfCheckMetric("systolic", "Systolic blood pressure", "mmHg", 0, "Top number from the latest blood pressure reading each day.", [
    latest("systolic_high", "High systolic pressure", "above", CHECK_LIMITS.systolicHigh),
    latest("systolic_low", "Low systolic pressure", "below", CHECK_LIMITS.systolicLow),
  ], "Fluid shifts in microgravity change cardiovascular workload. Tracking systolic readings helps the crew identify changes in pressure.", [cardiacEvidence]),
  selfCheckMetric("diastolic", "Diastolic blood pressure", "mmHg", 0, "Bottom number from the latest blood pressure reading each day.", [
    latest("diastolic_high", "High diastolic pressure", "above", CHECK_LIMITS.diastolicHigh),
    latest("diastolic_low", "Low diastolic pressure", "below", CHECK_LIMITS.diastolicLow),
  ], "Fluid shifts in microgravity change cardiovascular workload. Diastolic pressure describes pressure between beats.", [cardiacEvidence]),
  selfCheckMetric("glucose_fasting", "Fasting blood sugar", "mg/dL", 0, "Latest daily blood sugar reading after at least 8 hours without food.", [
    latest("glucose_fasting_high", "High fasting blood sugar", "above", CHECK_LIMITS.glucoseFastingHigh),
    latest("glucose_fasting_low", "Low fasting blood sugar", "below", CHECK_LIMITS.glucoseLow),
  ], "Fasting values have their own reference range. Spaceflight, reduced muscle loading and disrupted sleep can affect glucose regulation.", [glucoseEvidence]),
  selfCheckMetric("glucose_after_meal", "Non-fasting blood sugar", "mg/dL", 0, "Latest daily blood sugar reading taken without an 8-hour fast.", [
    latest("glucose_after_meal_high", "High non-fasting blood sugar", "above", CHECK_LIMITS.glucoseAfterMealHigh),
    latest("glucose_after_meal_low", "Low non-fasting blood sugar", "below", CHECK_LIMITS.glucoseLow),
  ], "Food changes blood sugar. Keeping meal context with a reading lets the console apply the matching thresholds.", [glucoseEvidence]),
  selfCheckMetric("temperature", "Body temperature", "°C", 1, "Latest body temperature measured in Daily Check each day.", [
    latest("temperature_high", "High body temperature", "above", CHECK_LIMITS.temperatureHigh),
    latest("temperature_low", "Low body temperature", "below", CHECK_LIMITS.temperatureLow),
  ], "Body temperature can shift during spaceflight and after exercise. Follow-up measurements help the crew track an abnormal reading.", [
    ntrs("20000104233", "Temperature Regulation in Crewmembers After a 115-Day Space Flight", 1995, "Altered thermoregulation during exercise after spaceflight."),
  ]),
  selfCheckMetric("mood", "Mood", "/5", 0, "Latest self-reported mood score each day, from 1 (very low) to 5 (great).", [
    latest("mood_low", "Low mood", "below", CHECK_LIMITS.moodLow),
  ], "Isolation, confinement and workload can affect mood. A simple daily check gives the crew a way to report changes.", [
    ntrs("20160004365", "Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders", 2015, "Behavioral health risks during spaceflight."),
  ]),
  selfCheckMetric("urine_color", "Urine colour", "/8", 0, "Latest reported shade on the Daily Check chart each day, from pale to dark.", [
    latest("urine_color_dark", "Dark urine colour", "above", CHECK_LIMITS.urineDark),
  ], "Urine colour gives the crew another self-reported observation to track alongside fluid intake.", [stoneEvidence]),
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;

export const DEFAULT_RULES = METRICS.flatMap((m) => m.rules.map((r) => ({ ...r, metric: m.id })));

export function formatValue(metric: MetricId, v: number) {
  const m = METRIC[metric];
  return `${v.toFixed(m.decimals)}${m.unit.startsWith("/") ? "" : " "}${m.unit}`;
}
