import { writeFileSync } from "node:fs";
import { METRICS } from "../lib/monitoring/catalog";

/** Writes docs/METRICS.md from lib/monitoring/catalog.ts: `npm run docs:metrics`. */
const unitOf = (kind: string, unit: string) => (kind === "missing" ? "h" : kind === "trend" ? "%" : unit);
const lines: string[] = [
  "# Monitored metrics",
  "",
  "<!-- Generated from lib/monitoring/catalog.ts by `npm run docs:metrics`. Edit the catalog, not this file. -->",
  "",
  "AstroMed monitors Daily Check, routine, wearable and dosimeter readings. Each metric lists its expected cadence, the default rules a super admin can tune in **Alert rules**, and the NASA sources behind the rationale.",
  "",
  "The thresholds shown are AstroMed demo defaults.",
  "",
  "| Metric | Unit | Daily value | Expected every | Late / missing after |",
  "|---|---|---|---|---|",
  ...METRICS.map((m) => `| ${m.label} | ${m.unit} | ${m.daily} | ${m.cadenceHours} h | ${m.lateAfterHours} h / ${m.missingAfterHours} h |`),
  "",
];
for (const m of METRICS) {
  lines.push(`## ${m.label}`, "", `**What:** ${m.definition}`, "", `**Data source in the app:** ${m.source}.`, "", `**Why:** ${m.rationale}`, "");
  lines.push("**Default alert rules**", "", "| Rule | Kind | Amber | Red | Window |", "|---|---|---|---|---|");
  for (const r of m.rules) {
    const u = unitOf(r.kind, m.unit);
    lines.push(`| ${r.label} (\`${r.id}\`) | ${r.kind}, ${r.comparator} | ${r.amber} ${u} | ${r.red} ${u} | ${r.kind === "missing" ? "—" : `${r.windowDays} d`} |`);
  }
  lines.push("", "**Sources**", "");
  for (const c of m.citations) lines.push(`- [${c.source} ${c.id}](${c.url}): ${c.title} (${c.year}). ${c.use}`);
  lines.push("");
}
lines.push(
  "## How alerts work",
  "",
  "- **Threshold** rules compare the average daily value over the window with the amber and red limits.",
  "- **Latest** rules compare the last applicable reading in the window. A missed recheck leaves an existing alert open.",
  "- **Fluid intake** adds entries within the same UTC day. Older 24-hour snapshots are used on days without new-style fluid entries.",
  "- **Trend** rules compare the window's average with the window before it, as a % change.",
  "- **Missing-data** rules count hours since the last value against the metric's expected cadence. A metric that has never reported shows *No data yet* instead of alerting.",
  "- Rules are checked whenever a crew member's monitoring is viewed (crew console, oversight dashboard). An alert opens when a rule fires, updates while it keeps firing, re-opens if it escalates from amber to red, and resolves automatically when the value is back within limits.",
  "- Crew can add notes and **acknowledge** their own alerts. Oversight users of the crew member's group (and super admins) can also **resolve**. A rule resolved by hand stays quiet for 24 h. Every acknowledgement, resolution and rule edit is in the admin audit log.",
  "",
  "## Synthetic test crew",
  "",
  "`npm run db:synthetic -- --days 30 --seed 1` creates group **SIM-1 (Synthetic test crew)** with one astronaut per profile, marked SYNTHETIC in the UI: normal, missing data (wearable offline 20 h, no hydration report for 3 days, two nights without a sleep log), sleep debt, rising heart rate (+~17% over a week, still under 100 bpm), dehydration (~1.4 L/day) and a solar particle event (~0.5 mSv/h for 36 h). The generator is in `lib/monitoring/synthetic.ts`; it is seeded, so the same seed gives the same records. None of it is real astronaut data.",
  ""
);
writeFileSync("docs/METRICS.md", lines.join("\n"));
console.log("docs/METRICS.md written");
