"use client";

import { useEffect, useId, useState } from "react";

type Rule = { title: string; text: string; action: string; source: string };

/** The rules behind the limit markers, so the crew can check what a limit means and where it comes from. */
const RULES: Record<string, Rule> = {
  "FLIGHT RULE 4.0": {
    title: "Flight rule: cabin CO₂ (ppCO₂) at or below 4.0 mmHg",
    text: "Keep the module's carbon dioxide partial pressure at or below 4.0 mmHg. Above it, crew commonly report headache, fatigue and slower thinking.",
    action: "Boost the air scrubber, reduce exertion in the module, and tell the flight surgeon about any headache or confusion.",
    source: "AstroMed demo limit, modelled on NASA-STD-3001 Vol. 2 (crew health) cabin CO₂ guidance.",
  },
  "SHELTER 1.0": {
    title: "Shelter rule: radiation dose rate at or above 1.0 mSv/h",
    text: "A dose rate at or above 1.0 mSv/h points to a solar particle event. The crew moves to the shielded shelter until the rate drops.",
    action: "Go to the storm shelter, turn on shielding, and log your personal dosimeter reading for the flight surgeon.",
    source: "AstroMed demo threshold for solar particle events, following NASA space radiation (ALARA) guidance.",
  },
};
import { Card } from "./ui/Card";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";

function LimitBar({
  label,
  value,
  unit,
  max,
  limit,
  limitLabel,
  barClass,
}: {
  label: string;
  value: string;
  unit: string;
  max: number;
  limit: number;
  limitLabel: string;
  barClass: string;
}) {
  const pct = Math.min(100, (Number(value) / max) * 100);
  const rule = RULES[limitLabel];
  const [open, setOpen] = useState(false);
  const ruleId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-mc-soft">{label}</span>
        <span className="font-mono text-2xl">
          {value}
          <span className="text-xs text-mc-label"> {unit}</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-mc-line">
        <div className={`h-1.5 rounded-full ${barClass}`} style={{ width: `${Math.max(1.5, pct)}%` }} />
        <div
          className="absolute -top-1 h-3.5 w-0.5 bg-mc-soft"
          style={{ left: `${(limit / max) * 100}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-mc-label">
        <span>0</span>
        {rule ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={ruleId}
            className="text-mc-link underline decoration-dotted underline-offset-2 hover:text-foreground"
            title="Show the rule"
          >
            {limitLabel} ⓘ
          </button>
        ) : (
          <span>{limitLabel}</span>
        )}
        <span>{max.toFixed(1)}</span>
      </div>
      {rule && open && (
        <div id={ruleId} className="rounded-md border border-mc-line bg-mc-inset px-3 py-2 text-[12px] leading-relaxed text-mc-soft">
          <p className="font-semibold text-foreground">{rule.title}</p>
          <p className="mt-1">{rule.text}</p>
          <p className="mt-1">
            <span className="font-semibold">What to do:</span> {rule.action}
          </p>
          <p className="mt-1 font-mono text-[10px] text-mc-label">Source: {rule.source}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Live sensor readings around the scenario setpoints. ppCO₂ follows the scrubber's slow
 * adsorb/desorb cycle (and drops when the scrubber is boosted); the dosimeter reading has
 * counting noise, so it never sits perfectly still.
 */
function useLiveCabin(ppCO2: number, radiation: number, scrubberBoost: boolean) {
  const [t, setT] = useState(0);
  const [jitter, setJitter] = useState({ co2: 0, rad: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setT((x) => x + 2);
      setJitter((j) => ({
        co2: j.co2 * 0.7 + (Math.random() - 0.5) * 0.06,
        rad: (Math.random() - 0.5) * 0.16,
      }));
    }, 2000);
    return () => clearInterval(id);
  }, []);
  const scrubberCycle = 0.18 * Math.sin((2 * Math.PI * t) / 144);
  return {
    ppCO2: Math.max(0.5, ppCO2 - (scrubberBoost ? 0.5 : 0) + scrubberCycle + jitter.co2),
    radiation: Math.max(0, radiation * (1 + jitter.rad)),
  };
}

export function CabinEnvironment() {
  const { ppCO2: co2Setpoint, radiation: radSetpoint, shieldingBoost, setShieldingBoost } =
    useMissionTelemetry();
  const { ppCO2, radiation } = useLiveCabin(co2Setpoint, radSetpoint, shieldingBoost);

  return (
    <Card title="Cabin environment & radiation" className="flex flex-col">
      <div className="grid gap-5 md:grid-cols-2">
        <LimitBar
          label="Module 3 ppCO₂"
          value={ppCO2.toFixed(1)}
          unit="mmHg"
          max={8}
          limit={4}
          limitLabel="FLIGHT RULE 4.0"
          barClass={ppCO2 > 4 ? "bg-mc-red" : ppCO2 > 3.5 ? "bg-mc-amber" : "bg-mc-green"}
        />
        <LimitBar
          label="Radiation dose rate (GCR + solar)"
          value={radiation.toFixed(3)}
          unit="mSv/hr"
          max={3}
          limit={1}
          limitLabel="SHELTER 1.0"
          barClass={radiation > 1 ? "bg-mc-red" : radiation > 0.1 ? "bg-mc-amber" : "bg-mc-green"}
        />
        <label className="flex items-center justify-between gap-3 rounded-md border border-mc-line bg-mc-inset px-3.5 py-3 text-sm md:col-span-2">
          <span>Shielding / Air scrubber boost</span>
          <input
            type="checkbox"
            role="switch"
            checked={shieldingBoost}
            onChange={(e) => setShieldingBoost(e.target.checked)}
            className="h-[22px] w-10 accent-mc-select"
          />
        </label>
      </div>
    </Card>
  );
}
