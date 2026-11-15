"use client";

import { STATUS_TONE } from "@/lib/statusColors";
import { useCallback, useEffect } from "react";
import { useVoiceCheckIn } from "./useVoiceCheckIn";
import { riskLabel } from "@/lib/risk";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { useSync } from "./SyncContext";
import { useCopilot, type CrewBrief } from "./CopilotProvider";
import { CAN_CHOOSE_COMPACT, modelLabel, startCompactEngine } from "@/lib/webllm/engine";
import { formatLab, labsFor } from "@/lib/labs";
import type { CopilotVitals } from "@/lib/copilotSubject";

type OfflineAICopilotProps = {
  userId: string;
  userName: string;
  /** Callsign of the crew member on screen, used to find their blood labs. */
  patientCallsign?: string;
  /** The crew member whose vitals are on screen (may differ from the signed-in user). */
  patientName?: string;
  crew?: CrewBrief[];
  displayVitals?: CopilotVitals;
  simulatedArrhythmia?: boolean;
};

const RISK_TONE = {
  GREEN: { text: STATUS_TONE.GREEN.text, bg: `${STATUS_TONE.GREEN.bg} ${STATUS_TONE.GREEN.border}` },
  YELLOW: { text: STATUS_TONE.YELLOW.text, bg: `${STATUS_TONE.YELLOW.bg} ${STATUS_TONE.YELLOW.border}` },
  RED: { text: STATUS_TONE.RED.text, bg: `${STATUS_TONE.RED.bg} ${STATUS_TONE.RED.border}` },
} as const;

export function OfflineAICopilot({
  userId,
  userName,
  patientName,
  patientCallsign,
  crew,
  displayVitals,
  simulatedArrhythmia,
}: OfflineAICopilotProps) {
  const { voiceStress, scenario } = useMissionTelemetry();
  const { isOnline } = useSync();
  const {
    setSession,
    voiceTranscript,
    setVoiceTranscript,
    engineStatus,
    loadProgress,
    loadPercent,
    modelId,
    basicReason,
    isSending,
    replyMetrics,
    retryEngine,
    risk,
    setChatOpen,
  } = useCopilot();

  useEffect(() => {
    setSession({ userId, userName, patientName, crew, displayVitals, simulatedArrhythmia });
  }, [userId, userName, patientName, crew, displayVitals, simulatedArrhythmia, setSession]);

  // The console pairs crew profiles with de-identified Inspiration4 samples for the demo.
  const patientLabs = labsFor(patientCallsign ?? crew?.find((c) => c.name === (patientName ?? userName))?.callsign);
  const stressIndex = displayVitals?.hrv != null
    ? Math.max(0, Math.min(100, Math.round(100 - displayVitals.hrv + (voiceStress ? 25 : 0))))
    : null;
  const stressLabel = stressIndex == null ? "" : stressIndex < 40 ? "low" : stressIndex < 70 ? "moderate" : "elevated";

  const applyVoiceTranscript = useCallback(
    (text: string) => {
      setVoiceTranscript(`"${userName}: ${text}"`);
    },
    [userName, setVoiceTranscript]
  );
  const voice = useVoiceCheckIn(applyVoiceTranscript);
  const tone = risk ? RISK_TONE[risk] : { text: "text-mc-muted", bg: "bg-mc-panel border-mc-line" };
  // Lab flags use the shared status colour of the lab panel's own level.
  const labLevel = patientLabs?.level ?? "GREEN";

  return (
    <aside aria-label="AI co-pilot" className="flex flex-col gap-4 self-start lg:sticky lg:top-20">
      {/* 1. The answer first: is the crew OK? */}
      <section className="rounded-lg border border-mc-line bg-mc-panel p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="mc-label">Medical assessment</p>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${risk === "RED" ? "bg-mc-red" : risk === "YELLOW" ? "bg-mc-amber" : risk === "GREEN" ? "bg-mc-green" : "bg-mc-label"}`} />
            {patientName ?? userName}
          </span>
        </div>
        <p className={`mt-2 text-2xl font-semibold tracking-tight ${tone.text}`}>{risk ? riskLabel(risk) : "No assessment"}</p>
        <p className="mt-2 text-sm leading-relaxed text-mc-soft">
          {simulatedArrhythmia || displayVitals?.arrhythmia
            ? "Irregular heart rhythm on the ECG. Stop activity, record a 12-lead ECG and contact the CMO now."
            : risk == null
            ? "No synced vitals available for this crew member."
            : risk === "GREEN"
            ? "Available vitals are within the console’s demo limits."
            : risk === "YELLOW"
              ? "Some readings are outside baseline. Review vitals and cabin air."
              : "A crew member needs attention now. Ask the co-pilot for steps."}
        </p>
        {(stressIndex != null || risk) && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-mc-line pt-3 text-xs">
            {stressIndex != null && (
              <div>
                <dt className="text-mc-label">Estimated stress</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                  {stressIndex}/100 <span className="font-normal text-mc-muted">· {stressLabel}</span>
                </dd>
              </div>
            )}
            {risk && (
              <div>
                <dt className="text-mc-label">Based on</dt>
                <dd className="mt-0.5 text-foreground">
                  {simulatedArrhythmia ? "Simulated ECG" : scenario.sensorDropout ? "Last sync (sensor offline)" : "Last synced vitals"}
                </dd>
              </div>
            )}
          </dl>
        )}
        {patientLabs && patientLabs.flagged.length > 0 && (
          <p className={`mt-3 rounded-md px-3 py-2 text-xs leading-relaxed ${RISK_TONE[labLevel].bg} ${RISK_TONE[labLevel].text}`}>
            <span className="font-semibold">Lab flag:</span>{" "}
            {patientLabs.flagged.map((r) => `${r.label} ${formatLab(r)} ${r.note}`).join(" · ")}
            <span className="block text-[11px] opacity-80">Inspiration4 research sample</span>
          </p>
        )}
      </section>

      {/* 2. The co-pilot and how it is running */}
      <section className="flex flex-col gap-3 rounded-lg border border-mc-line bg-mc-panel p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">Flight Surgeon Co-Pilot</p>
          <AiBadge status={engineStatus} />
        </div>

        {engineStatus === "loading" && (
          <div>
            <div className="h-1.5 overflow-hidden rounded bg-mc-line">
              <div
                className={`h-full bg-mc-cyan transition-[width] duration-300 ${loadPercent == null ? "w-1/3 animate-pulse" : ""}`}
                style={loadPercent == null ? undefined : { width: `${Math.round(loadPercent * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-mc-label" role="status">
              {loadProgress}
              {loadPercent != null && ` ${Math.floor(loadPercent * 100)}%`}
              {" "}Basic answers work meanwhile.
            </p>
          </div>
        )}
        {engineStatus === "basic" && (
          <p className="text-xs leading-relaxed text-mc-muted" title={basicReason || undefined}>
            Answering with built-in triage rules while the on-device AI is unavailable.{" "}
            <button type="button" onClick={retryEngine} className="font-medium text-mc-link underline underline-offset-2">
              Try on-device AI again
            </button>
          </p>
        )}
        {engineStatus === "ready" && (
          <div className="text-xs text-mc-label">
            <p>
              {modelLabel(modelId)} on this device
              {replyMetrics?.firstTokenMs != null && ` · first token ${replyMetrics.firstTokenMs} ms · reply ${replyMetrics.totalMs} ms`}
            </p>
            {CAN_CHOOSE_COMPACT && modelId?.startsWith("Llama-") && (
              <button type="button" onClick={startCompactEngine} disabled={isSending} className="mt-1.5 text-mc-link underline disabled:opacity-50">
                Use compact model
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="min-h-11 rounded-md border border-mc-select bg-mc-select text-sm font-semibold text-mc-on-select"
        >
          Ask the co-pilot
        </button>
        <button
          type="button"
          onClick={voice.isListening ? voice.stop : voice.supported ? voice.start : voice.runPromptFallback}
          className={`min-h-11 rounded-md border text-sm font-medium ${
            voice.isListening ? "border-mc-red/60 bg-mc-red/10 text-mc-red" : "border-mc-line-strong text-mc-soft hover:text-foreground"
          }`}
        >
          {voice.isListening ? "Stop listening" : voice.supported ? "Voice check-in" : "Type a check-in"}
        </button>
        {!voice.isListening && !voice.error && (
          <p className="text-[11px] leading-relaxed text-mc-label">
            {voice.supported
              ? `Voice typing needs a network link; the co-pilot itself works offline.${isOnline ? "" : " No link right now, so type your check-in."}`
              : "This browser has no voice typing (use Chrome or Edge on desktop). You can type your check-in instead."}
          </p>
        )}
        {(voice.interim || voice.error) && (
          <p className={`text-xs ${voice.error ? "text-mc-red" : "text-mc-cyan"}`} role={voice.error ? "alert" : undefined}>
            {voice.error ?? `…${voice.interim}`}
          </p>
        )}
        <div className="border-t border-mc-line pt-3 text-xs leading-relaxed">
          <p className="text-mc-label">Last check-in</p>
          <p className="mt-0.5 text-mc-soft">{voiceTranscript}</p>
        </div>
      </section>

    </aside>
  );
}

function AiBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    ready: ["Full AI", "border-[#1f5f48] text-mc-green"],
    loading: ["Loading", "border-mc-line-strong text-mc-cyan"],
    basic: ["Basic mode", "border-mc-amber/40 text-mc-amber"],
    idle: ["Starting", "border-mc-line-strong text-mc-label"],
  };
  const [label, cls] = map[status] ?? map.idle;
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}
