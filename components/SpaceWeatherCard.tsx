"use client";

import { Card } from "./ui/Card";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { useSpaceWeather } from "@/lib/useSpaceWeather";
import { riskLabel, type RiskLevel } from "@/lib/risk";

const TONE: Record<RiskLevel, string> = {
  GREEN: "border-mc-green/40 bg-mc-green/10 text-mc-green",
  YELLOW: "border-mc-amber/50 bg-mc-amber/10 text-mc-amber",
  RED: "border-mc-red/60 bg-mc-red/10 text-mc-red",
};

const scaleTone = (n: number) => (n >= 3 ? "text-mc-red" : n >= 1 ? "text-mc-amber" : "text-mc-green");

function Scale({ letter, value, label }: { letter: string; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-mc-line bg-mc-inset px-3 py-2">
      <span className={`font-mono text-2xl ${scaleTone(value)}`}>
        {letter}
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-mc-label">{label}</span>
    </div>
  );
}

/** Live solar activity from NOAA SWPC (and NASA DONKI when it answers), driving the radiation hazard. */
export function SpaceWeatherCard() {
  const sw = useSpaceWeather();
  const { scenario, setScenario } = useMissionTelemetry();

  if (!sw) {
    return (
      <Card title="Live space weather · NOAA + NASA">
        <p className="text-sm text-mc-label">Fetching the latest solar data…</p>
      </Card>
    );
  }

  const updated =
    sw.source === "demo"
      ? `saved ${sw.fetchedAt.slice(0, 10)}`
      : new Date(sw.fetchedAt).toUTCString().slice(17, 22) + " UTC";

  return (
    <Card
      title="Live space weather · NOAA + NASA"
      action={
        <span className="font-mono text-[11px] text-mc-label">
          {sw.source === "live" ? "LIVE" : sw.source === "cached" ? "LAST KNOWN" : "DEMO DATA"} · {updated}
        </span>
      }
    >
      {sw.source === "demo" && (
        <p className="mb-3 rounded-md border border-mc-amber/40 bg-mc-amber/10 px-3 py-2 text-xs text-mc-amber">
          Can&apos;t reach NOAA right now. Showing a saved real NOAA reading as demo data; it switches to live as soon as
          the feed is back.
        </p>
      )}
      <div className={`rounded-lg border p-4 ${TONE[sw.level]}`}>
        <p className="font-mono text-xs font-semibold">● {riskLabel(sw.level)}</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{sw.headline}</p>
        <p className="mt-1 text-sm text-mc-soft">{sw.advice}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Scale letter="S" value={sw.scales.S} label="Radiation storm" />
        <Scale letter="R" value={sw.scales.R} label="Flare blackout" />
        <Scale letter="G" value={sw.scales.G} label="Geomagnetic" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-mc-muted">Protons ≥10 MeV</dt>
        <dd className="text-right font-mono">{sw.protons10MeV != null ? `${sw.protons10MeV.toFixed(2)} pfu` : "—"}</dd>
        <dt className="text-mc-muted">X-ray flux (flare class)</dt>
        <dd className="text-right font-mono">{sw.xray.flareClass ?? "—"}</dd>
        <dt className="text-mc-muted">Planetary Kp</dt>
        <dd className="text-right font-mono">{sw.kp ?? "—"}</dd>
        <dt className="text-mc-muted">Major flare chance today</dt>
        <dd className="text-right font-mono">{sw.forecast.flareMajor != null ? `${sw.forecast.flareMajor}%` : "—"}</dd>
        <dt className="text-mc-muted">NASA DONKI (30 days)</dt>
        <dd className="text-right font-mono">
          {sw.donki ? `${sw.donki.flares30d} flares · ${sw.donki.sep30d} SEP` : "unavailable"}
        </dd>
      </dl>

      {sw.alerts.length > 0 && (
        <div className="mt-4">
          <p className="mc-label">Latest NOAA messages</p>
          <ul className="mt-2 space-y-1 text-xs text-mc-soft">
            {sw.alerts.map((a) => (
              <li key={a.issued + a.title} className="flex gap-2">
                <span className="shrink-0 font-mono text-mc-label">{a.issued.slice(5, 16)}</span>
                <span>{a.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-mc-line pt-3">
        {sw.scales.S >= 1 && scenario.id !== "solar_event" && (
          <button
            type="button"
            onClick={() => setScenario("solar_event")}
            className="min-h-9 rounded-md border border-mc-red bg-mc-red/15 px-3 text-xs font-semibold text-mc-red"
          >
            Apply to MTV-1: solar particle event
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-mc-label">
          GOES satellites near Earth are the reference for the solar environment. G (geomagnetic) storms affect Earth, not
          the transit vehicle. Sources: NOAA SWPC, NASA DONKI.
        </p>
      </div>
    </Card>
  );
}
