"use client";

import { URGENCY_LABEL, type Urgency } from "@/lib/hotline/rules";

export const hotlineTime = (t: string | number) =>
  new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const cls =
    urgency === "EMERGENCY"
      ? "border-mc-red bg-mc-red text-white"
      : urgency === "URGENT"
        ? "border-mc-amber bg-mc-amber/20 text-foreground"
        : "border-mc-line-strong text-mc-muted";
  return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${cls}`}>{URGENCY_LABEL[urgency]}</span>;
}

export function VitalsLine({ vitals, className = "" }: { vitals: Record<string, number | undefined>; className?: string }) {
  const parts = [
    vitals.heartRate != null ? `HR ${Math.round(vitals.heartRate)}` : null,
    vitals.spo2 != null ? `SpO₂ ${Math.round(vitals.spo2 * 10) / 10}%` : null,
    vitals.hrv != null ? `HRV ${Math.round(vitals.hrv)} ms` : null,
    vitals.radiation != null ? `Dose ${vitals.radiation} mSv/h` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className={`font-mono text-[11px] text-mc-label ${className}`}>❤ {parts.join(" · ")}</span>;
}
