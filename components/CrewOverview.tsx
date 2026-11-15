"use client";

import type { RiskLevel } from "@/lib/risk";

export type CrewMemberView = {
  id: string;
  name: string;
  callsign: string;
  sex?: "male" | "female";
  heartRate: number;
  hrv: number;
  risk: RiskLevel;
};

const RISK_DOT: Record<RiskLevel, string> = {
  GREEN: "bg-mc-green",
  YELLOW: "bg-mc-amber",
  RED: "bg-mc-red",
};

export function CrewOverview({
  members,
  selectedId,
  onSelect,
}: {
  members: CrewMemberView[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {members.map((m) => {
        const isSelected = m.id === selectedId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={isSelected}
            aria-label={`Show ${m.name} (${m.callsign})`}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border bg-mc-panel p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_18px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-select focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg ${
              isSelected
                ? "border-mc-select ring-2 ring-mc-select"
                : "border-mc-line hover:border-mc-line-strong"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-mc-label">{m.callsign}</span>
              <span className={`h-2 w-2 rounded-full ${RISK_DOT[m.risk]}`} />
            </div>
            <div className="truncate text-sm font-semibold">{m.name}</div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-xs text-mc-soft">
              <span>{m.heartRate} bpm</span>
              <span>HRV {m.hrv.toFixed(0)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
