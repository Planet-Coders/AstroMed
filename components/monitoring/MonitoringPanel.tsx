"use client";

import { METRIC, METRICS, formatValue } from "@/lib/monitoring/catalog";
import { describeTrend, type MissingStatus, type Rule } from "@/lib/monitoring/engine";
import { MetricChart } from "./MetricChart";
import type { MonitoringData } from "./types";

const RANGES = [7, 14, 30] as const;

function ago(h: number) {
  return h < 1 ? "under 1 h ago" : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
}

export function MissingBadge({ status }: { status: MissingStatus }) {
  const map = {
    ok: ["border-mc-green/40 text-mc-green", "On time"],
    late: ["border-mc-amber/50 text-mc-amber", "Late"],
    missing: ["border-mc-red/60 bg-mc-red/10 text-mc-red", "Missing"],
    never: ["border-mc-line-strong text-mc-label", "No data yet"],
  } as const;
  const [cls, text] = map[status.status];
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${cls}`} title={status.hoursSince != null ? `Last value ${ago(status.hoursSince)}` : "No value recorded"}>
      {text}
      {status.hoursSince != null && status.status !== "ok" ? ` · ${Math.round(status.hoursSince)} h` : ""}
    </span>
  );
}

/** The thresholds a rule uses, in words: "amber below 6 h, red below 5 h (3-day average)". */
export function ruleText(r: Rule) {
  const m = METRIC[r.metric];
  if (r.kind === "missing") return `amber after ${r.amber} h without data, red after ${r.red} h`;
  if (r.kind === "trend") return `amber if the ${r.windowDays}-day average rises ${r.amber}%+ vs the previous ${r.windowDays} days, red at ${r.red}%+`;
  const span = r.kind === "latest"
    ? `latest reading within ${r.windowDays} ${r.windowDays === 1 ? "day" : "days"}`
    : r.windowDays === 1 ? "today's average" : `${r.windowDays}-day average`;
  return `amber ${r.comparator} ${r.amber} ${m.unit}, red ${r.comparator} ${r.red} ${m.unit} (${span})`;
}

export function WhyWeMonitor({ metricId, rules }: { metricId: MonitoringData["metrics"][number]["id"]; rules: Rule[] }) {
  const m = METRIC[metricId];
  return (
    <details className="group rounded-md border border-mc-line bg-mc-inset px-3 py-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-mc-link">
        Why we monitor this <span className="inline-block transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-mc-muted">
        <p>
          <span className="text-mc-soft">What:</span> {m.definition}
        </p>
        <p>
          <span className="text-mc-soft">Why:</span> {m.rationale}
        </p>
        <p>
          <span className="text-mc-soft">Source of values:</span> {m.source}. Expected about every {m.cadenceHours} h.
        </p>
        <div>
          <p className="text-mc-soft">Alert rules (editable by the super admin):</p>
          <ul className="ml-4 list-disc">
            {rules
              .filter((r) => r.metric === metricId)
              .map((r) => (
                <li key={r.id}>
                  {r.label}: {ruleText(r)}
                  {!r.enabled && <span className="text-mc-amber"> (off)</span>}
                </li>
              ))}
          </ul>
        </div>
        <div>
          <p className="text-mc-soft">NASA sources:</p>
          <ul className="ml-4 list-disc">
            {m.citations.map((c) => (
              <li key={c.id}>
                <a href={c.url} target="_blank" rel="noreferrer" className="text-mc-link underline-offset-2 hover:underline">
                  {c.source} {c.id}
                </a>{" "}
                · {c.title} ({c.year}). {c.use}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

/** Time-series cards with missing-data badges and trends. */
export function MonitoringPanel({ data, onDays, loading }: { data: MonitoringData; onDays: (d: 7 | 14 | 30) => void; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Time range" className="flex rounded-lg border border-mc-line-strong bg-mc-panel p-[3px]">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDays(d)}
              aria-pressed={data.days === d}
              className={`min-h-8 rounded-md px-3 text-xs ${data.days === d ? "bg-mc-select font-semibold text-mc-on-select" : "font-medium text-mc-muted hover:text-foreground"}`}
            >
              {d} days
            </button>
          ))}
        </div>
        <p className="text-xs text-mc-label">
          Daily values · dashed slots are days with no data · dashed lines are the amber and red thresholds
          {loading ? " · updating…" : ""}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {METRICS.map((def) => {
          const mm = data.metrics.find((x) => x.id === def.id);
          if (!mm) return null;
          const latest = [...mm.series].reverse().find((p) => p.value != null);
          const rules = data.rules.filter((r) => r.metric === def.id && r.enabled && (r.kind === "threshold" || r.kind === "latest"));
          // When a metric has a direct reading rule, colour the chart against that rule.
          const chartRules = rules.some((r) => r.kind === "latest") ? rules.filter((r) => r.kind === "latest") : rules;
          return (
            <section key={def.id} data-metric={def.id} className="flex flex-col gap-3 rounded-lg border border-mc-line bg-mc-panel p-5">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug">{def.label}</h3>
                  <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {latest?.value != null ? formatValue(def.id, latest.value) : "—"}
                  </p>
                  {latest && (
                    <p className="text-[11px] text-mc-label">
                      {latest.date === mm.series[mm.series.length - 1].date ? "Today" : `Last value ${latest.date}`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <MissingBadge status={mm.missing} />
                  {mm.trend.pct != null && (
                    <div
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight transition-colors ${
                        Math.abs(mm.trend.pct) < 2
                          ? "border border-mc-line-strong bg-mc-inset text-mc-muted"
                          : mm.trend.pct > 0
                          ? "border border-mc-green/40 bg-mc-green/10 text-mc-green"
                          : "border border-mc-amber/40 bg-mc-amber/10 text-mc-amber"
                      }`}
                      title={describeTrend(def.id, mm.trend)}
                    >
                      <span className="text-[10px]">
                        {Math.abs(mm.trend.pct) < 2 ? "→" : mm.trend.pct > 0 ? "↑" : "↓"}
                      </span>
                      <span>
                        {Math.abs(mm.trend.pct) < 2 ? "steady" : `${Math.abs(mm.trend.pct).toFixed(0)}%`}
                      </span>
                      <span className="text-[9px] font-normal opacity-70">
                        {data.days === 7 ? "vs last wk" : `vs ${data.days}d`}
                      </span>
                    </div>
                  )}
                </div>
              </header>
              <MetricChart metric={def.id} series={mm.series} rules={chartRules} />
              <p className="text-xs text-mc-soft" data-testid={`trend-${def.id}`}>
                {describeTrend(def.id, mm.trend)}
              </p>
              <WhyWeMonitor metricId={def.id} rules={data.rules} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
