"use client";

import { METRIC, type MetricId } from "@/lib/monitoring/catalog";
import type { DailyPoint, Rule } from "@/lib/monitoring/engine";

const W = 320;
const H = 120;
const PAD = { l: 34, r: 6, t: 8, b: 18 };

/**
 * Daily bars for one metric, coloured against its threshold rule, with the amber and red
 * lines drawn across. Days with no data show as a dashed empty slot, never as zero.
 */
export function MetricChart({ metric, series, rule }: { metric: MetricId; series: DailyPoint[]; rule?: Rule }) {
  const m = METRIC[metric];
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  const lines = rule && rule.enabled ? [rule.amber, rule.red] : [];
  const top = Math.max(...vals, ...lines, 1) * 1.12;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const slot = innerW / series.length;
  const bar = Math.max(2, slot * 0.68);

  const levelOf = (v: number) => {
    if (!rule || !rule.enabled) return "GREEN";
    const past = (t: number) => (rule.comparator === "above" ? v >= t : v < t);
    return past(rule.red) ? "RED" : past(rule.amber) ? "YELLOW" : "GREEN";
  };
  const fill = { GREEN: "var(--color-mc-green)", YELLOW: "var(--color-mc-amber)", RED: "var(--color-mc-red)" };
  const ticks = [0, top / 2, top].map((t) => Math.round(t * 10 ** m.decimals) / 10 ** m.decimals);
  const label = (d: string) => d.slice(5).replace("-", "/");
  const missingDays = series.filter((p) => p.value == null).length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${m.label}, last ${series.length} days${missingDays ? `, ${missingDays} days without data` : ""}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-mc-line)" strokeWidth="0.5" />
          <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="var(--color-mc-label)" fontFamily="var(--font-plex-mono)">
            {t}
          </text>
        </g>
      ))}
      {series.map((p, i) => {
        const x = PAD.l + i * slot + (slot - bar) / 2;
        if (p.value == null) {
          return (
            <rect key={p.date} x={x} y={PAD.t + innerH - 14} width={bar} height={14} fill="none" stroke="var(--color-mc-label)" strokeOpacity="0.6" strokeDasharray="2 2" strokeWidth="0.8">
              <title>{`${p.date}: no data`}</title>
            </rect>
          );
        }
        const lv = levelOf(p.value);
        return (
          <rect key={p.date} x={x} y={y(p.value)} width={bar} height={Math.max(1, PAD.t + innerH - y(p.value))} rx="1" fill={fill[lv]} fillOpacity={lv === "GREEN" ? 0.55 : 0.9}>
            <title>{`${p.date}: ${p.value.toFixed(m.decimals)} ${m.unit}`}</title>
          </rect>
        );
      })}
      {rule && rule.enabled &&
        ([
          [rule.amber, "var(--color-mc-amber)"],
          [rule.red, "var(--color-mc-red)"],
        ] as const).map(([t, c]) => (
          <line key={t} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={c} strokeWidth="1" strokeDasharray="4 3" />
        ))}
      {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
        <text key={i} x={PAD.l + i * slot + slot / 2} y={H - 5} textAnchor="middle" fontSize="8" fill="var(--color-mc-label)" fontFamily="var(--font-plex-mono)">
          {label(series[i].date)}
        </text>
      ))}
    </svg>
  );
}
