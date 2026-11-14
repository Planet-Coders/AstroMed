"use client";

import { useState } from "react";
import { METRIC, formatValue, type MetricId } from "@/lib/monitoring/catalog";
import { crosses, meanOf, type DailyPoint, type Rule } from "@/lib/monitoring/engine";
import { worstRisk } from "@/lib/risk";

const W = 320;
const H = 120;
const PAD = { l: 34, r: 8, t: 8, b: 18 };

function formatPointDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const monthDay = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { weekday, monthDay };
}

/**
 * Daily bars for one metric inspired by Apple Screen Time:
 * - Full filled bars across all days
 * - Horizontal dashed "avg" guideline with period mean
 * - Interactive hover / tap with floating tooltip showing day, date, and value
 * - Color-coded against alert rules (green/amber/red thresholds)
 */
export function MetricChart({ metric, series, rules }: { metric: MetricId; series: DailyPoint[]; rules: Rule[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const m = METRIC[metric];
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  const avg = meanOf(series);

  const lines = rules.flatMap((r) => [
    { id: `${r.id}:amber`, threshold: r.amber, color: "var(--color-mc-amber)" },
    { id: `${r.id}:red`, threshold: r.red, color: "var(--color-mc-red)" },
  ]);

  const top = Math.max(...vals, ...lines.map((line) => line.threshold), 1) * 1.14;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const slot = innerW / series.length;
  const bar = Math.max(2, slot * 0.7);

  const fill = {
    GREEN: "var(--color-mc-green, #10b981)",
    YELLOW: "var(--color-mc-amber, #f59e0b)",
    RED: "var(--color-mc-red, #ef4444)",
  };

  const ticks = [...new Set([0, top / 2, top].map((t) => Number(t.toFixed(m.decimals))))];
  const label = (d: string) => d.slice(5).replace("-", "/");
  const missingDays = series.filter((p) => p.value == null).length;
  const activePoint = activeIndex != null ? series[activeIndex] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label={`${m.label}, last ${series.length} days${missingDays ? `, ${missingDays} days without data` : ""}`}
      onMouseLeave={() => setActiveIndex(null)}
    >
      {/* Background Y-axis gridlines and numeric ticks */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-mc-line)" strokeWidth="0.5" />
          <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize="7.5" fill="var(--color-mc-label)" fontFamily="var(--font-plex-mono)">
            {t}
          </text>
        </g>
      ))}

      {/* Screen Time style horizontal "avg" guideline */}
      {avg != null && (
        <g key="avg-guideline">
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(avg)}
            y2={y(avg)}
            stroke="var(--color-mc-label)"
            strokeOpacity="0.45"
            strokeWidth="0.75"
            strokeDasharray="3 3"
          />
          <text
            x={PAD.l - 4}
            y={y(avg) + 2.5}
            textAnchor="end"
            fontSize="6.5"
            fontWeight="600"
            fill="var(--color-mc-label)"
            fontFamily="var(--font-plex-mono)"
          >
            avg
          </text>
        </g>
      )}

      {/* Daily Data Bars */}
      {series.map((p, i) => {
        const x = PAD.l + i * slot + (slot - bar) / 2;
        const isActive = activeIndex === i;

        if (p.value == null) {
          return (
            <rect
              key={p.date}
              x={x}
              y={PAD.t + innerH - 14}
              width={bar}
              height={14}
              rx="1.5"
              fill="none"
              stroke="var(--color-mc-label)"
              strokeOpacity="0.5"
              strokeDasharray="2 2"
              strokeWidth="0.8"
            >
              <title>{`${p.date}: no data`}</title>
            </rect>
          );
        }

        const value = p.value;
        const lv = worstRisk(rules.map((rule) => crosses(value, rule) ?? "GREEN"));
        const barHeight = Math.max(2, PAD.t + innerH - y(value));

        // When a bar is hovered/selected, highlight it and slightly dim the others
        const opacity = activeIndex == null ? (lv === "GREEN" ? 0.7 : 0.95) : isActive ? 1.0 : 0.35;

        return (
          <g key={p.date}>
            <rect
              x={x}
              y={y(value)}
              width={bar}
              height={barHeight}
              rx="2"
              fill={fill[lv]}
              fillOpacity={opacity}
              stroke={isActive ? "#ffffff" : "none"}
              strokeWidth={isActive ? 1 : 0}
              className="transition-all duration-150 ease-out"
            >
              <title>{`${p.date}: ${formatValue(metric, value)}`}</title>
            </rect>
          </g>
        );
      })}

      {/* Invisible broad hit targets for effortless mouse/touch interaction */}
      {series.map((p, i) => (
        <rect
          key={`hit-${p.date}`}
          x={PAD.l + i * slot}
          y={PAD.t}
          width={slot}
          height={innerH + PAD.b}
          fill="transparent"
          className="cursor-pointer"
          onMouseEnter={() => setActiveIndex(i)}
          onTouchStart={() => setActiveIndex(i)}
          onClick={() => setActiveIndex((curr) => (curr === i ? null : i))}
        />
      ))}

      {/* Amber and Red Threshold Lines */}
      {lines.map(({ id, threshold, color }) => (
        <line
          key={id}
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      ))}

      {/* X-axis Day / Date Labels */}
      {series.length === 7 ? (
        series.map((p, i) => {
          const { weekday } = formatPointDate(p.date);
          const dayInitial = weekday.charAt(0);
          const isActive = activeIndex === i;
          return (
            <text
              key={`lbl-${p.date}`}
              x={PAD.l + i * slot + slot / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="8"
              fontWeight={isActive ? "700" : "500"}
              fill={isActive ? "var(--color-mc-green, #10b981)" : "var(--color-mc-label)"}
              fontFamily="var(--font-plex-mono)"
            >
              {dayInitial}
            </text>
          );
        })
      ) : (
        [0, Math.floor(series.length / 3), Math.floor((series.length * 2) / 3), series.length - 1].map((i) => (
          <text
            key={`lbl-${series[i].date}`}
            x={PAD.l + i * slot + slot / 2}
            y={H - 5}
            textAnchor="middle"
            fontSize="7.5"
            fill="var(--color-mc-label)"
            fontFamily="var(--font-plex-mono)"
          >
            {label(series[i].date)}
          </text>
        ))
      )}

      {/* Apple Screen Time Interactive Floating Tooltip Popover */}
      {activePoint && activePoint.value != null && activeIndex != null && (() => {
        const { weekday, monthDay } = formatPointDate(activePoint.date);
        const barCenterX = PAD.l + activeIndex * slot + slot / 2;
        const valY = y(activePoint.value);
        const tw = 78;
        const th = 26;
        const tooltipX = Math.min(Math.max(barCenterX, PAD.l + tw / 2 + 1), W - PAD.r - tw / 2 - 1);
        const tooltipY = Math.max(PAD.t + 2, valY - th - 5);

        return (
          <g className="pointer-events-none transition-all duration-100 ease-out">
            <rect
              x={tooltipX - tw / 2}
              y={tooltipY}
              width={tw}
              height={th}
              rx="4"
              fill="#0f172a"
              stroke="var(--color-mc-line-strong, #334155)"
              strokeWidth="0.8"
              opacity="0.96"
            />
            {/* Small downward pointer triangle */}
            <polygon
              points={`${barCenterX - 3},${tooltipY + th} ${barCenterX + 3},${tooltipY + th} ${barCenterX},${tooltipY + th + 3}`}
              fill="#0f172a"
            />
            <text
              x={tooltipX}
              y={tooltipY + 10}
              textAnchor="middle"
              fontSize="7"
              fontWeight="600"
              fill="var(--color-mc-soft, #94a3b8)"
              fontFamily="var(--font-plex-mono)"
            >
              {weekday}, {monthDay}
            </text>
            <text
              x={tooltipX}
              y={tooltipY + 21}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="700"
              fill="#ffffff"
              fontFamily="var(--font-plex-mono)"
            >
              {formatValue(metric, activePoint.value)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
