"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Card } from "./ui/Card";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { riskLabel, type RiskLevel } from "@/lib/risk";
import { assessBody, assessHazards, type HazardId, type RegionId } from "@/lib/bodyMap";
import { useMissionMode } from "./MissionModeContext";
import { useSpaceWeather } from "@/lib/useSpaceWeather";
import { labsFor } from "@/lib/labs";
import { markBodyMapSeen } from "@/lib/missions";
import { getLatestCheck, type StoredCheck } from "@/lib/selfCheck";
import { INJURY_TYPES, areaFor, injuryLevel, useInjuries } from "@/lib/injuries";
import { InjuryDetail, NewInjuryPanel } from "./InjuryPanel";
import { PeriodPanel } from "./PeriodPanel";
import dynamic from "next/dynamic";
import { canUseWebGL } from "./BodyMap3D";

// three.js is large, so the 3D figure loads only when the body map is shown.
const BodyMap3D = dynamic(() => import("./BodyMap3D").then((m) => m.BodyMap3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-xl border border-cyan-400/30 bg-[#071423] font-mono text-xs uppercase tracking-[0.2em] text-cyan-200/70 sm:h-[620px]">
      Loading 3D body…
    </div>
  ),
});

const MISSION_EPOCH = Date.UTC(2026, 0, 15);

const TONE: Record<RiskLevel, { text: string; fill: string; ring: string; bg: string }> = {
  GREEN: { text: "text-mc-green", fill: "#3ddc97", ring: "border-mc-green/50", bg: "bg-mc-green/10" },
  YELLOW: { text: "text-mc-amber", fill: "#f5b82e", ring: "border-mc-amber/60", bg: "bg-mc-amber/10" },
  RED: { text: "text-mc-red", fill: "#ff5d5d", ring: "border-mc-red/70", bg: "bg-mc-red/10" },
};

const FIGURE_KEY = "aahms_body_figure";
type Figure = "male" | "female";

const noopSubscribe = () => () => {};

/** Browser-only inputs (self-check, PVT, mission day) read after hydration. */
function useClientInputs(userId: string) {
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => {
      let pvt: { mean: number; lapses: number } | null = null;
      try {
        const s = localStorage.getItem("aahms_pvt_summary");
        if (s) pvt = JSON.parse(s);
      } catch {
        /* unavailable */
      }
      const day = Math.floor((Date.now() - MISSION_EPOCH) / 86_400_000) + 1;
      return JSON.stringify({ check: getLatestCheck(userId), pvt, day });
    },
    () => JSON.stringify({ check: null, pvt: null, day: 1 })
  );
  return useMemo(
    () => JSON.parse(raw) as { check: StoredCheck | null; pvt: { mean: number; lapses: number } | null; day: number },
    [raw]
  );
}

export function BodyMap({
  userId,
  name,
  callsign,
  vitals,
  onOpenSelfCheck,
}: {
  userId: string;
  name: string;
  callsign?: string;
  vitals: { heartRate: number; hrv: number; spo2: number; radiation: number };
  onOpenSelfCheck: () => void;
}) {
  const t = useMissionTelemetry();
  const { mode } = useMissionMode();
  const sw = useSpaceWeather();
  useEffect(() => markBodyMapSeen(userId), [userId]);
  const client = useClientInputs(userId);
  // Body figure per crew member, chosen by the crew and remembered in this browser.
  const [figures, setFigures] = useState<Record<string, Figure>>({});
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from storage
      setFigures(JSON.parse(localStorage.getItem(FIGURE_KEY) ?? "{}"));
    } catch {
      /* unavailable */
    }
  }, []);
  const figure: Figure = figures[name] ?? "male";
  const chooseFigure = (f: Figure) => {
    const next = { ...figures, [name]: f };
    setFigures(next);
    try {
      localStorage.setItem(FIGURE_KEY, JSON.stringify(next));
    } catch {
      /* unavailable */
    }
  };

  const inputs = useMemo(
    () => ({
        heartRate: vitals.heartRate,
        hrv: vitals.hrv,
        spo2: vitals.spo2,
        doseRate: t.radiation,
        arrhythmia: t.arrhythmia,
        ppCO2: t.ppCO2,
        sleepHours: t.sleepHours,
        sleepTarget: t.sleepTarget,
        exerciseMinutes: t.exerciseMinutes,
        exerciseTarget: t.exerciseTarget,
        voiceStress: t.voiceStress,
        pvt: client.pvt,
        check: client.check,
        missionDay: client.day,
        sex: figure,
        labs: labsFor(callsign),
      }),
    [vitals, t, client, figure, callsign]
  );
  const regions = useMemo(() => assessBody(inputs), [inputs]);
  const hazards = useMemo(() => assessHazards(inputs, regions, mode === "space", sw ? { level: sw.level, S: sw.scales.S, R: sw.scales.R } : null), [inputs, regions, mode, sw]);
  const [hazardId, setHazardId] = useState<HazardId | null>(null);
  const hazard = hazards.find((h) => h.id === hazardId) ?? null;
  const inHazard = (id: RegionId) => !hazard || hazard.regions.includes(id);

  const order: RiskLevel[] = ["RED", "YELLOW", "GREEN"];
  const worstId = [...regions].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))[0].id;
  const [picked, setPicked] = useState<RegionId | null>(null);
  const active = regions.find((r) => r.id === (picked ?? worstId))!;
  const tone = TONE[active.level];
  const byId = Object.fromEntries(regions.map((r) => [r.id, r])) as Record<RegionId, (typeof regions)[number]>;

  // External injuries: tap the figure in report mode to drop a marker at that spot.
  const { injuries, report, addUpdate, setHealed, remove } = useInjuries(name);
  const [reporting, setReporting] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; area: string } | null>(null);
  // Placing stays on while a report is open, so tapping again moves the marker.
  const placing = reporting || draft !== null;

  const [injuryId, setInjuryId] = useState<string | null>(null);
  const openInjury = injuries.find((i) => i.id === injuryId) ?? null;
  const activeInjuries = injuries.filter((i) => !i.healed);

  // The body map is 3D only. Browsers without WebGL get a plain list of body systems instead.
  const webgl = useSyncExternalStore(noopSubscribe, canUseWebGL, () => false);

  return (
    <Card title={`Body map · ${name}`}>
      {/* NASA HRP's five hazards; picking one highlights the body systems it affects */}
      <div className="mb-5">
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Five hazards of human spaceflight">
          {hazards.map((h) => {
            const on = hazardId === h.id;
            return (
              <button
                key={h.id}
                type="button"
                aria-pressed={on}
                onClick={() => setHazardId(on ? null : h.id)}
                className={`flex min-h-16 flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition ${
                  on ? `${TONE[h.level].ring} ${TONE[h.level].bg}` : "border-mc-line bg-mc-inset hover:border-mc-line-strong"
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="font-mono text-lg font-semibold leading-none">{h.letter}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: TONE[h.level].fill }} aria-hidden />
                </span>
                <span className="text-[11px] font-medium leading-tight text-mc-soft">{h.name}</span>
              </button>
            );
          })}
        </div>
        {hazard ? (
          <p className="mt-2 rounded-md border border-mc-line bg-mc-inset px-3 py-2 text-[13px] leading-relaxed text-mc-soft">
            <span className={`font-semibold ${TONE[hazard.level].text}`}>{hazard.name}: </span>
            <span className="font-mono text-xs text-mc-muted">{hazard.now}.</span> {hazard.about}{" "}
            <span className="text-mc-label">Highlighted: {hazard.regions.map((r) => byId[r].name).join(", ")}.</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-mc-label">NASA&apos;s five hazards of spaceflight (RIDGE). Pick one to see which body systems it affects.</p>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-mc-line-strong text-xs" role="group" aria-label="Body figure">
          {(["male", "female"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={figure === f}
              onClick={() => chooseFigure(f)}
              className={`px-3 py-1.5 transition ${figure === f ? "bg-mc-select/25 text-white" : "text-mc-muted hover:bg-mc-raised"}`}
            >
              {f === "male" ? "♂ Male" : "♀ Female"}
            </button>
          ))}
        </div>
        {webgl && (
          <button
            type="button"
            onClick={() => {
              setReporting((r) => !r);
              setDraft(null);
            }}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              reporting ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-mc-line-strong text-mc-soft hover:bg-mc-raised"
            }`}
          >
            {reporting ? "Tap the body where it hurts… (cancel)" : "🩹 Report injury"}
          </button>
        )}
        {activeInjuries.length > 0 && (
          <span className="text-xs text-mc-amber">
            {activeInjuries.length} active injur{activeInjuries.length === 1 ? "y" : "ies"}:{" "}
            {activeInjuries.map((i) => (
              <button key={i.id} type="button" onClick={() => setInjuryId(i.id)} className="mr-2 underline">
                {INJURY_TYPES[i.type].label.toLowerCase()} ({i.area.toLowerCase()})
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {webgl ? (
          <BodyMap3D
            figure={figure}
            regions={regions}
            activeId={active.id}
            dimmed={(id) => !inHazard(id)}
            onPick={(id) => {
              setPicked(id);
              setInjuryId(null);
              setDraft(null);
            }}
            placing={placing}
            injuries={injuries.map((i) => ({
              id: i.id,
              x: i.x,
              y: i.y,
              color: TONE[injuryLevel(i)].fill,
              pulse: !i.healed && injuryLevel(i) !== "GREEN",
              healed: i.healed,
              label: `${INJURY_TYPES[i.type].label}, ${i.area}`,
            }))}
            selectedInjury={injuryId}
            draft={draft}
            areaLabel={(x, y) => areaFor(x, y, figure)}
            onPlace={(x, y) => {
              setDraft({ x, y, area: areaFor(x, y, figure) });
              setReporting(false);
              setInjuryId(null);
            }}
            onPickInjury={(id) => {
              setInjuryId(id);
              setDraft(null);
            }}
          />
        ) : (
          <div className="rounded-xl border border-mc-line bg-mc-inset p-4">
            <p className="text-xs text-mc-label">This browser can&apos;t show the 3D body. Pick a body system:</p>
            <ul className="mt-3 grid gap-2">
              {regions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={active.id === r.id}
                    onClick={() => {
                      setPicked(r.id);
                      setInjuryId(null);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
                      active.id === r.id ? "border-white/60 bg-white/10" : "border-mc-line hover:border-mc-line-strong"
                    } ${inHazard(r.id) ? "" : "opacity-40"}`}
                  >
                    <span>{r.name}</span>
                    <span className={`font-mono text-xs ${TONE[r.level].text}`}>{riskLabel(r.level)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detail panel: a new injury report, an injury's details, or the picked body system */}
        {reporting && !draft ? (
          <section aria-live="polite" className="min-w-0">
            <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4 text-sm leading-relaxed text-mc-soft">
              <h3 className="text-xl font-semibold text-foreground">Where does it hurt?</h3>
              <p className="mt-2">Move over the 3D body: the label shows the area under the pointer. Tap to place the marker. Drag to turn the body if the spot is on the side or back.</p>
              <p className="mt-2 text-xs text-mc-label">Facing you, the body&apos;s right side is on your left. You can fine-tune the area from a list after tapping.</p>
            </div>
          </section>
        ) : draft ? (
          <section aria-live="polite" className="min-w-0">
            <NewInjuryPanel
              spot={draft}
              onAreaChange={(a) => setDraft({ x: a.x, y: a.y, area: a.name })}
              onCancel={() => setDraft(null)}
              onReport={(type, first) => {
                setInjuryId(report(type, draft.x, draft.y, first, draft.area));
                setDraft(null);
              }}
            />
          </section>
        ) : openInjury ? (
          <section aria-live="polite" className="min-w-0">
            <InjuryDetail
              injury={openInjury}
              onUpdate={(u) => addUpdate(openInjury.id, u)}
              onHealed={(h) => setHealed(openInjury.id, h)}
              onRemove={() => {
                remove(openInjury.id);
                setInjuryId(null);
              }}
              onClose={() => setInjuryId(null)}
            />
          </section>
        ) : (
        <section aria-live="polite" className="flex min-w-0 flex-col gap-4">
          <div className={`rounded-lg border p-4 ${tone.ring} ${tone.bg}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xl font-semibold">{active.name}</h3>
              <span className={`font-mono text-sm font-semibold ${tone.text}`}>● {riskLabel(active.level)}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-mc-label">Hazards: {active.hazards}</p>
          </div>

          <div>
            <p className="mc-label">Readings</p>
            <ul className="mt-2 divide-y divide-mc-line rounded-md border border-mc-line">
              {active.readings.map((rd) => (
                <li key={rd.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-mc-muted">{rd.label}</span>
                  <span className={`font-mono ${rd.level ? TONE[rd.level].text : "text-mc-label"}`}>{rd.value}</span>
                </li>
              ))}
            </ul>
            {active.readings.some((rd) => rd.value === "not done today") && (
              <button type="button" onClick={onOpenSelfCheck} className="mt-2 text-xs text-mc-link underline">
                Do today&apos;s self-check to fill these in
              </button>
            )}
          </div>

          {active.id === "reproductive" && figure === "female" && <PeriodPanel name={name} />}

          <div className="grid gap-3">
            <div className="rounded-md border border-mc-line bg-mc-inset p-3">
              <p className="mc-label">What it does</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-mc-soft">{active.role}</p>
            </div>
            <div className="rounded-md border border-mc-line bg-mc-inset p-3">
              <p className="mc-label">How space affects it</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-mc-soft">{active.space}</p>
            </div>
          </div>

          <div>
            <p className="mc-label">What to do now</p>
            <ul className="mt-2 space-y-2">
              {active.actions.map((a) => (
                <li key={a} className="flex gap-2 text-sm leading-relaxed text-mc-soft">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full`} style={{ background: TONE[active.level].fill }} />
                  {a}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-mc-label">
            Source: NASA OSDR ·{" "}
            <a href="https://osdr.nasa.gov/bio/repo/data/studies/OSD-569" target="_blank" rel="noreferrer" className="text-mc-link hover:underline">
              OSD-569
            </a>{" "}
            ·{" "}
            <a href="https://osdr.nasa.gov/bio/repo/data/studies/OSD-575" target="_blank" rel="noreferrer" className="text-mc-link hover:underline">
              OSD-575
            </a>{" "}
            (Inspiration4 crew labs) ·{" "}
            <a
              href={`https://osdr.nasa.gov/bio/repo/search?q=${encodeURIComponent(`${active.name.split(" ")[0]} spaceflight`)}`}
              target="_blank"
              rel="noreferrer"
              className="text-mc-link hover:underline"
            >
              related studies
            </a>
          </p>
        </section>
        )}
      </div>
    </Card>
  );
}
