"use client";

import { Card } from "./ui/Card";
import { formatLab, labsFor } from "@/lib/labs";
import { riskLabel, type RiskLevel } from "@/lib/risk";

import { STATUS_TONE } from "@/lib/statusColors";

const TONE: Record<RiskLevel, string> = {
  GREEN: STATUS_TONE.GREEN.text,
  YELLOW: STATUS_TONE.YELLOW.text,
  RED: STATUS_TONE.RED.text,
};

const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2));

/**
 * Latest blood panel for the selected crew member: real values from a paired
 * Inspiration4 astronaut in NASA OSDR, compared with the lab's normal range and the
 * person's own pre-flight baseline.
 */
export function LabPanel({ name, callsign }: { name: string; callsign?: string }) {
  const labs = labsFor(callsign);
  if (!labs) {
    return (
      <Card title={`Blood labs · ${name}`}>
        <p className="text-sm text-mc-label">No lab panel on file for this crew member.</p>
      </Card>
    );
  }

  return (
    <Card
      title={`Blood labs · ${name}`}
      action={<span className={`font-mono text-xs font-semibold ${TONE[labs.level]}`}>● {riskLabel(labs.level)}</span>}
    >
      <p className="-mt-2 mb-3 text-xs text-mc-muted">
        Real values from NASA OSDR: SpaceX Inspiration4 astronaut {labs.sourceId} (blood count OSD-569, metabolic panel
        OSD-575). Latest panel is the first sample after spaceflight, compared with this person&apos;s own pre-flight
        average.
      </p>
      {labs.flagged.length > 0 && (
        <p className={`mb-3 rounded-md border px-3 py-2 text-sm text-mc-soft ${STATUS_TONE[labs.level].border} ${STATUS_TONE[labs.level].bg}`}>
          <span className={`font-semibold ${STATUS_TONE[labs.level].text}`}>Flagged: </span>
          {labs.flagged.map((r) => `${r.label} ${formatLab(r)} (${r.note})`).join(" · ")}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="mc-label pb-2 font-semibold">Test</th>
              <th className="mc-label pb-2 text-right font-semibold">Latest</th>
              <th className="mc-label pb-2 text-right font-semibold">Own baseline</th>
              <th className="mc-label pb-2 text-right font-semibold">Change</th>
              <th className="mc-label pb-2 text-right font-semibold">Normal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mc-line">
            {labs.results.map((r) => (
              <tr key={r.key} title={r.why}>
                <td className="py-1.5">
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${r.level === "GREEN" ? "bg-mc-green" : r.level === "YELLOW" ? "bg-mc-amber" : "bg-mc-red"}`} />
                  {r.label}
                </td>
                <td className={`py-1.5 text-right font-mono ${TONE[r.level]}`}>{formatLab(r)}</td>
                <td className="py-1.5 text-right font-mono text-mc-muted">{fmt(r.baseline)}</td>
                <td className="py-1.5 text-right font-mono text-mc-muted">
                  {r.changePct > 0 ? "+" : ""}
                  {Math.round(r.changePct)}%
                </td>
                <td className="py-1.5 text-right font-mono text-mc-label">{r.ref ? `${r.ref[0]}–${r.ref[1]}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
