/**
 * Open NASA GeneLab / OSDR studies shown beside live crew readings.
 *
 * The three accessions are fixed. Group means are computed only from numeric cells
 * in each study's transformed CSV. NA and blank cells are skipped. Nothing in OSD-489
 * is treated as a radiation dose: that comparison uses the cabin sensor.
 */

export type OsdrSignal = "hrv" | "exercise" | "radiation";

export type OsdrTone = "green" | "amber" | "red";

export type OsdrMetric = {
  biomarkerId: string;
  label: string;
  unit: string;
  group: string;
  n: number;
  mean: number;
  fileName: string;
};

export type OsdrFile = {
  name: string;
  url: string | null;
  restUrl: string | null;
};

/** What is stored in the database and in the checked-in snapshot. */
export type StoredStudy = {
  id: string;
  title: string;
  description: string;
  mission: string;
  organism: string;
  files: OsdrFile[];
  metrics: {
    gapNote: string;
    biomarkers: OsdrMetric[];
  };
};

export type OsdrStudy = {
  id: string;
  title: string;
  description: string;
  mission: string;
  organism: string;
  theme: string;
  note: string;
  gapNote: string;
  signal: OsdrSignal;
  pageUrl: string;
  files: OsdrFile[];
  metrics: OsdrMetric[];
};

type CatalogEntry = {
  id: string;
  theme: string;
  signal: OsdrSignal;
  note: string;
  gapNote: string;
};

export const OSDR_CATALOG: CatalogEntry[] = [
  {
    id: "OSD-751",
    theme: "Brain inflammation and cytokines",
    signal: "hrv",
    note: "Mouse cortex after 37 days on the ISS. Cytokine levels are the study measurement. Heart-rate variability is this console’s stress signal, shown beside the study as a research analog, not a cytokine assay.",
    gapNote: "This file does not contain a human or crew cytokine assay.",
  },
  {
    id: "OSD-661",
    theme: "Bone and muscle loss / GSK3",
    signal: "exercise",
    note: "About 30 days of spaceflight lowered GSK3β in mouse muscle and bone. The countermeasure tracked here is today’s exercise against the daily plan.",
    gapNote: "This file does not contain this crew’s exercise log.",
  },
  {
    id: "OSD-489",
    theme: "Microgravity bone structure",
    signal: "radiation",
    note: "RR-1 micro-CT of cancellous bone. The file is not a dosimeter log. Cabin radiation is shown beside it because both are habitat exposures on a long transit, and this is the open NASA record for site-specific bone loss in microgravity.",
    gapNote: "This file is not a dosimeter log and has no radiation or dose column. Cabin radiation is the cabin sensor only.",
  },
];

const API = "https://visualization.osdr.nasa.gov/biodata/api/v2/dataset";

const LABELS: Record<string, string> = {
  tnf_alpha_concentration_normalized: "TNF-alpha",
  il10_concentration_normalized: "IL-10",
  ifn_gamma_concentration_normalized: "IFN-gamma",
  il5_concentration_normalized: "IL-5",
  il6_concentration_normalized: "IL-6",
  il12p70_concentration_normalized: "IL-12p70",
  body_fat_percent: "Body fat",
  lean_mass_percent: "Lean mass",
  baseline_regional_BMD: "Baseline regional BMD",
  "post-HLS_regional_BMD": "Post-HLS regional BMD",
  trabecular_thickness_mm: "Trabecular thickness",
  trabecular_separation_mm: "Trabecular separation",
  trabecular_number_1_by_mm: "Trabecular number",
  tissue_volume_mm_third: "Tissue volume",
  bone_volume_mm_third: "Bone volume",
  percent_bone_volume_bvtv_percent: "Bone volume fraction",
  tissue_surface_mm_squared: "Tissue surface",
  bone_surface_mm_squared: "Bone surface",
  bone_surface_by_volume_ratio_bsbv_mm_squared_by_mm_third: "Bone surface / volume",
  Bone_surface_density_bstv_mm_squared_by_mm_third: "Bone surface density",
  trabecular_pattern_factor: "Trabecular pattern factor",
  structure_model_index: "Structure model index",
  "Connectivity density_1_by_mm_third": "Connectivity density",
  Standard_deviation_of_trabecular_thickness: "SD of trabecular thickness",
  Standard_deviation_of_trabecular_separation: "SD of trabecular separation",
};

const GROUP_ORDER = ["Baseline", "Vivarium", "Flight", "Flox_HLS", "KD_HLS", "all samples"];

export function studyPageUrl(id: string): string {
  return `https://osdr.nasa.gov/bio/repo/data/studies/${id}`;
}

export function formatOsdrMean(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 10) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

/** HRV ms: green above 30, amber 20–30, red below 20. */
export function hrvTone(ms: number): OsdrTone {
  if (ms > 30) return "green";
  if (ms >= 20) return "amber";
  return "red";
}

/** Exercise vs the daily plan: green at 100%+, amber from 60%, red below that. */
export function exerciseTone(minutes: number, target: number): OsdrTone {
  if (!(target > 0)) return "red";
  const pct = minutes / target;
  if (pct >= 1) return "green";
  if (pct >= 0.6) return "amber";
  return "red";
}

/** Cabin dose rate mSv/h: green below 0.1, amber through 0.3, red above 0.3. */
export function doseTone(msvPerHour: number): OsdrTone {
  if (msvPerHour < 0.1) return "green";
  if (msvPerHour <= 0.3) return "amber";
  return "red";
}

export function signalTone(signal: OsdrSignal, value: number, target = 0): OsdrTone {
  if (signal === "hrv") return hrvTone(value);
  if (signal === "exercise") return exerciseTone(value, target);
  return doseTone(value);
}

function isDoseText(value: string): boolean {
  return /radiation|dosimeter|sievert|\bmsv\b|\bdose\b/i.test(value);
}

/** OSD-489 never contributes a radiation metric, even if a column is named like one. */
export function isCrewDoseMetric(studyId: string, metric: Pick<OsdrMetric, "biomarkerId" | "label" | "unit">): boolean {
  if (studyId !== "OSD-489") return false;
  return isDoseText(metric.biomarkerId) || isDoseText(metric.label) || isDoseText(metric.unit);
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

function labelFor(id: string): string {
  if (LABELS[id]) return LABELS[id];
  const stripped = id
    .replace(/_mm_squared_by_mm_third$/i, "")
    .replace(/_1_by_mm_third$/i, "")
    .replace(/_mm_squared$/i, "")
    .replace(/_mm_third$/i, "")
    .replace(/_1_by_mm$/i, "")
    .replace(/_mm$/i, "")
    .replace(/_percent$/i, "");
  const words = stripped.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function unitFromId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("mm_squared_by_mm_third")) return "mm²/mm³";
  if (lower.includes("1_by_mm_third")) return "1/mm³";
  if (lower.includes("mm_third")) return "mm³";
  if (lower.includes("mm_squared")) return "mm²";
  if (lower.includes("1_by_mm")) return "1/mm";
  if (lower.endsWith("_mm")) return "mm";
  if (lower.endsWith("_percent") || lower.includes("percent")) return "%";
  return "";
}

function explicitUnit(raw: string): string {
  const value = raw.trim();
  if (!value || /^na$/i.test(value)) return "";
  if (value === "picogram_per_milligram") return "pg/mg";
  return value.replace(/_/g, " ");
}

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

/**
 * Group means for one transformed CSV.
 * A factor column is the group. If the file has none, a sample name like
 * "1_Flox_HLS" supplies the group from that cell. Otherwise every sample
 * shares the group "all samples" — flight vs ground is not invented.
 */
export function parseTransformedCsv(studyId: string, fileName: string, csv: string): { metrics: OsdrMetric[]; omissions: string[] } {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { metrics: [], omissions: ["The transformed CSV has no data rows."] };
  const headers = rows[0].map((h) => h.trim());
  const factorIdx = headers.findIndex((h) => /factor\s*value|^group$|spaceflight|^treatment$/i.test(h));
  const sampleIdx = headers.findIndex((h) => /^sample name$/i.test(h));

  const measures: { index: number; id: string; label: string; unitIndex: number | null }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header || /^unit$/i.test(header)) continue;
    if (/^(sample name|source name)$/i.test(header)) continue;
    if (i === factorIdx) continue;
    if (isDoseText(header) || (studyId === "OSD-489" && isDoseText(header))) continue;
    const unitIndex = headers[i + 1] && /^unit$/i.test(headers[i + 1]) ? i + 1 : null;
    measures.push({ index: i, id: header, label: labelFor(header), unitIndex });
  }

  const buckets = new Map<string, { group: string; measure: (typeof measures)[number]; values: number[]; unit: string }>();
  let sawEncodedGroup = factorIdx >= 0;

  for (const row of rows.slice(1)) {
    let group = "";
    if (factorIdx >= 0) {
      const factor = (row[factorIdx] ?? "").trim();
      if (factor && !/^na$/i.test(factor)) group = factor;
    } else if (sampleIdx >= 0) {
      const sample = (row[sampleIdx] ?? "").trim();
      const encoded = sample.match(/^\d+_(.+)$/);
      if (encoded) {
        group = encoded[1];
        sawEncodedGroup = true;
      } else if (sample) group = "all samples";
    } else group = "all samples";
    if (!group) continue;

    for (const measure of measures) {
      const raw = (row[measure.index] ?? "").trim();
      if (!raw || /^na$/i.test(raw)) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const key = `${group}\0${measure.id}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        const unitCell = measure.unitIndex != null ? explicitUnit(row[measure.unitIndex] ?? "") : "";
        bucket = { group, measure, values: [], unit: unitCell || unitFromId(measure.id) };
        buckets.set(key, bucket);
      } else if (!bucket.unit && measure.unitIndex != null) {
        bucket.unit = explicitUnit(row[measure.unitIndex] ?? "") || bucket.unit;
      }
      bucket.values.push(value);
    }
  }

  const metrics: OsdrMetric[] = [...buckets.values()].map((bucket) => {
    const sum = bucket.values.reduce((total, value) => total + value, 0);
    return {
      biomarkerId: bucket.measure.id,
      label: bucket.measure.label,
      unit: bucket.unit,
      group: bucket.group,
      n: bucket.values.length,
      mean: sum / bucket.values.length,
      fileName,
    };
  });
  metrics.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || a.biomarkerId.localeCompare(b.biomarkerId));

  const headerBlob = headers.join(" ");
  const omissions: string[] = [];
  if (!sawEncodedGroup) {
    omissions.push("The transformed CSV does not label spaceflight groups, so each mean is across every sample in the file.");
  }
  if (studyId === "OSD-661" && !/bmd[-_\s]*change|change[-_\s]*bmd/i.test(headerBlob)) {
    omissions.push("The file does not contain a BMD-change column. Baseline and post-HLS regional BMD are separate columns, and no change was calculated.");
  }
  const expected: [string, RegExp][] =
    studyId === "OSD-751"
      ? [
          ["TNF-alpha", /tnf/i],
          ["IL-10", /il10/i],
          ["IFN-gamma", /ifn/i],
          ["IL-5", /il5/i],
          ["IL-6", /il6(?!.*p70)|il6_concentration/i],
          ["IL-12p70", /il12/i],
        ]
      : studyId === "OSD-661"
        ? [
            ["body fat", /body_fat/i],
            ["lean mass", /lean_mass/i],
            ["regional BMD", /bmd/i],
          ]
        : studyId === "OSD-489"
          ? [
              ["bone volume", /bone_volume/i],
              ["trabecular thickness", /trabecular_thickness/i],
              ["trabecular number", /trabecular_number/i],
            ]
          : [];
  for (const [label, pattern] of expected) {
    if (!pattern.test(headerBlob)) omissions.push(`The transformed CSV does not contain ${label}.`);
  }
  return {
    metrics: metrics.filter((metric) => !isCrewDoseMetric(studyId, metric)),
    omissions,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function missionLabel(meta: Record<string, unknown>): string {
  const mission = meta.mission;
  if (typeof mission === "string" && mission.trim()) return mission.trim();
  if (mission && typeof mission === "object" && "name" in mission) {
    const name = (mission as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "Not listed";
}

async function getText(url: string, accept: string): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(40_000),
        cache: "no-store",
        headers: {
          Accept: accept,
          "User-Agent": "AstroMed/1.0 (educational crew console)",
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last;
}

function readFiles(json: unknown, id: string): OsdrFile[] {
  const files = asRecord(asRecord(asRecord(json)[id]).files);
  return Object.entries(files).map(([name, raw]) => {
    const rec = asRecord(raw);
    return {
      name,
      url: typeof rec.URL === "string" ? rec.URL : null,
      restUrl: typeof rec.REST_URL === "string" ? rec.REST_URL : null,
    };
  });
}

/** Build one stored study from OSDR metadata, the file list, and transformed CSV text. */
export function assembleStoredStudy(
  id: string,
  metaJson: unknown,
  filesJson: unknown,
  csvs: { name: string; csv: string }[],
): StoredStudy {
  const catalog = OSDR_CATALOG.find((entry) => entry.id === id);
  if (!catalog) throw new Error(`Unknown study ${id}`);
  const metadata = asRecord(asRecord(asRecord(metaJson)[id]).metadata);
  const files = readFiles(filesJson, id);
  const parsed = csvs.map((file) => parseTransformedCsv(id, file.name, file.csv));
  const title = typeof metadata["study title"] === "string" ? metadata["study title"] : id;
  const description = typeof metadata["study description"] === "string" ? metadata["study description"] : "";
  const organism = typeof metadata.organism === "string" ? metadata.organism : "Not listed";
  return {
    id,
    title,
    description,
    mission: missionLabel(metadata),
    organism,
    files,
    metrics: {
      gapNote: [catalog.gapNote, ...new Set(parsed.flatMap((item) => item.omissions))].join(" "),
      biomarkers: parsed.flatMap((item) => item.metrics),
    },
  };
}

/** Metadata, file list, and parsed means for one accession. Throws if NASA cannot be read. */
export async function fetchStoredStudy(id: string): Promise<StoredStudy> {
  const [metaText, filesText] = await Promise.all([
    getText(`${API}/${id}/`, "application/json"),
    getText(`${API}/${id}/files/`, "application/json"),
  ]);
  const files = readFiles(JSON.parse(filesText) as unknown, id);
  const transformed = files.filter((file) => /TRANSFORMED/i.test(file.name) && file.name.toLowerCase().endsWith(".csv") && file.url);
  if (!transformed.length) throw new Error(`${id} has no transformed CSV`);
  const csvs: { name: string; csv: string }[] = [];
  for (const file of transformed) csvs.push({ name: file.name, csv: await getText(file.url!, "text/csv,*/*") });
  return assembleStoredStudy(id, JSON.parse(metaText) as unknown, JSON.parse(filesText) as unknown, csvs);
}

export async function fetchAllStoredStudies(): Promise<StoredStudy[]> {
  const studies: StoredStudy[] = [];
  for (const entry of OSDR_CATALOG) studies.push(await fetchStoredStudy(entry.id));
  return studies;
}

function validMetric(value: unknown): value is OsdrMetric {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<OsdrMetric>;
  return (
    typeof metric.biomarkerId === "string" &&
    typeof metric.label === "string" &&
    typeof metric.unit === "string" &&
    typeof metric.group === "string" &&
    typeof metric.n === "number" &&
    typeof metric.mean === "number" &&
    typeof metric.fileName === "string"
  );
}

export function readStoredMetrics(raw: unknown): StoredStudy["metrics"] {
  const record = asRecord(raw);
  const biomarkers = Array.isArray(record.biomarkers) ? record.biomarkers.filter(validMetric) : [];
  return {
    gapNote: typeof record.gapNote === "string" ? record.gapNote : "",
    biomarkers,
  };
}

export function presentStudies(records: StoredStudy[]): OsdrStudy[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return OSDR_CATALOG.flatMap((catalog) => {
    const record = byId.get(catalog.id);
    if (!record) return [];
    const metrics = readStoredMetrics(record.metrics).biomarkers
      .filter((metric) => !isCrewDoseMetric(catalog.id, metric))
      .map((metric) => ({ ...metric, label: labelFor(metric.biomarkerId) }));
    const storedGap = readStoredMetrics(record.metrics).gapNote;
    return [
      {
        id: catalog.id,
        title: record.title,
        description: record.description,
        mission: record.mission,
        organism: record.organism,
        theme: catalog.theme,
        note: catalog.note,
        gapNote: storedGap || catalog.gapNote,
        signal: catalog.signal,
        pageUrl: studyPageUrl(catalog.id),
        files: record.files ?? [],
        metrics,
      },
    ];
  });
}

/** Database rows win when any exist. Null (database down) or an empty list uses the snapshot. */
export function resolveStoredStudies(
  rows: StoredStudy[] | null,
  snapshotStudies: StoredStudy[],
): { studies: OsdrStudy[]; source: "database" | "snapshot" } {
  if (rows && rows.length > 0) return { source: "database", studies: presentStudies(rows) };
  return { source: "snapshot", studies: presentStudies(snapshotStudies) };
}

export function hasBiomarkers(studies: Pick<OsdrStudy, "metrics">[]): boolean {
  return studies.some((study) => study.metrics.length > 0);
}

/** Short prompt block. Empty when no parsed biomarkers were loaded. */
export function osdrBaselineBlock(studies: Pick<OsdrStudy, "id" | "theme" | "gapNote" | "metrics">[]): string {
  const loaded = studies.filter((study) => study.metrics.length > 0);
  if (!loaded.length) return "";
  const lines = [
    "NASA OSDR BASELINES",
    "These are mouse-study means, not this crew’s blood or bones.",
    "Cite OSD-751 for stress, HRV, or inflammation. Cite OSD-661 for exercise, muscle, or bone density. Cite OSD-489 for microgravity bone loss, and state that it is not a dosimeter. Cabin radiation is the cabin sensor only.",
    "Never invent a cytokine, BMD, or dose that is not listed below.",
  ];
  for (const study of loaded) {
    const means = study.metrics
      .map((metric) => `${metric.group}: ${metric.label} ${formatOsdrMean(metric.mean)}${metric.unit ? ` ${metric.unit}` : ""} (n=${metric.n})`)
      .join("; ");
    lines.push(`${study.id} ${study.theme}. ${means}`);
    if (study.gapNote) lines.push(`${study.id} note: ${study.gapNote}`);
  }
  return lines.join("\n");
}

function citationMetric(study: Pick<OsdrStudy, "id" | "metrics">): OsdrMetric | null {
  const preferred =
    study.id === "OSD-751"
      ? /tnf/i
      : study.id === "OSD-661"
        ? /body_fat|lean_mass|bmd/i
        : /bone_volume|trabecular_thickness|trabecular_number/i;
  return study.metrics.find((metric) => preferred.test(metric.biomarkerId)) ?? study.metrics[0] ?? null;
}

function metricSentence(metric: OsdrMetric): string {
  const unit = metric.unit ? ` ${metric.unit}` : "";
  return `${metric.group}: ${metric.label} mean ${formatOsdrMean(metric.mean)}${unit} (n=${metric.n})`;
}

/**
 * One citation sentence for the rules fallback, or null when the question is off-topic
 * or no parsed means are available. Radiation questions do not quote a dose from OSD-489.
 */
export function osdrFallbackCitation(question: string, studies: Pick<OsdrStudy, "id" | "metrics" | "gapNote">[]): string | null {
  const q = question.toLowerCase();
  const byId = new Map(studies.map((study) => [study.id, study]));
  const dose = /radiation|dosimeter|\bmsv\b|sievert|dose rate|cabin dose/.test(q);
  const bone = /microgravity|trabecular|cancellous|bone loss|bone volume|bone structure/.test(q);
  const cyto = /stress|\bhrv\b|heart-rate variability|heart rate variability|inflamm|cytokine|\btnf\b|interleukin/.test(q);
  const exercise = /exercise|workout|\bmuscle\b|bone density|\bbmd\b|\bgsk\b|lean mass/.test(q);

  type Hit = { id: string; score: number; kind: "cyto" | "exercise" | "bone" | "dose" };
  const hits: Hit[] = [
    { id: "OSD-751", score: cyto ? 3 : 0, kind: "cyto" },
    { id: "OSD-661", score: exercise ? 3 : 0, kind: "exercise" },
    { id: "OSD-489", score: (bone ? 3 : 0) + (dose ? 2 : 0), kind: bone ? "bone" : "dose" },
  ];
  hits.sort((a, b) => b.score - a.score);
  const top = hits[0];
  if (!top || top.score === 0) return null;

  if (top.kind === "dose") {
    return "OSD-489 is the open NASA micro-CT record for site-specific bone loss in microgravity and is not a dosimeter; cabin radiation is the cabin sensor only.";
  }

  const study = byId.get(top.id);
  const metric = study ? citationMetric(study) : null;
  if (!metric) return null;
  const doseClause =
    top.id === "OSD-489" && dose ? " OSD-489 is not a dosimeter; cabin radiation is the cabin sensor only." : "";
  return `${top.id} ${metricSentence(metric)}. These are mouse-study means, not this crew’s blood or bones.${doseClause}`;
}
