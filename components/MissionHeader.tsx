"use client";

import { useEffect, useState } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/demoScenarios";
import { worstRisk, type RiskLevel } from "@/lib/risk";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { useMissionMode } from "./MissionModeContext";
import { ThemeToggle } from "./ThemeToggle";
import { useSync } from "./SyncContext";

const MISSION_EPOCH = new Date("2026-01-15T00:00:00Z").getTime();

/** DDD/HH:MM:SS, the format used on mission clocks. */
function formatDayTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(d).padStart(3, "0")}/${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const STATUS: Record<RiskLevel, { text: string; cls: string; dot: string }> = {
  GREEN: { text: "All crew nominal", cls: "border-mc-green/40 text-mc-green", dot: "bg-mc-green" },
  YELLOW: { text: "Caution · check crew", cls: "border-mc-amber/50 text-mc-amber", dot: "bg-mc-amber" },
  RED: { text: "Warning · act now", cls: "border-mc-red/60 bg-mc-red/10 text-mc-red", dot: "bg-mc-red animate-pulse" },
};

const SELF_TEXT: Record<RiskLevel, string> = {
  GREEN: "You're nominal",
  YELLOW: "Caution · check in",
  RED: "Warning · act now",
};

export function MissionHeader({
  crewRisks,
  mission = "MTV-1 · Mars transit",
  selfOnly = false,
  onOpenMobileMenu,
}: {
  crewRisks: RiskLevel[];
  mission?: string;
  /** Astronaut view: the status pill describes only the signed-in crew member. */
  selfOnly?: boolean;
  /** Kept for callers; the page title now lives in the workspace. */
  activeTabLabel?: string;
  onOpenMobileMenu?: () => void;
}) {
  const { mode } = useMissionMode();
  const { scenario, setScenario } = useMissionTelemetry();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const level = worstRisk(crewRisks.length ? crewRisks : ["GREEN"]);
  const status = selfOnly ? { ...STATUS[level], text: SELF_TEXT[level] } : STATUS[level];

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-mc-line bg-mc-header px-4 md:px-6">
      {onOpenMobileMenu && (
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-mc-line-strong text-mc-label hover:bg-mc-raised hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Mobile title (the sidebar carries the brand on desktop) */}
      <div className="hidden shrink-0 items-center gap-2 sm:flex lg:hidden">
        <svg width="24" height="24" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="16.5" fill="#0B3D91" stroke="#2A5BC0" />
          <ellipse cx="18" cy="18" rx="15" ry="6" fill="none" stroke="#FFFFFF" strokeOpacity=".55" transform="rotate(-24 18 18)" />
          <path d="M7 19h6l2-5 3 9 2.5-6H29" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden text-[14px] font-bold tracking-[0.04em] sm:inline">AstroMed</span>
      </div>

      <span
        className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold ${status.cls}`}
        role="status"
        title="Based on live vitals only: heart rate, HRV, SpO₂, radiation dose and heart rhythm. Blood labs are assessed separately in the Medical assessment panel."
      >
        <span className={`h-2 w-2 rounded-full ${status.dot}`} />
        {status.text}
      </span>

      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <div
          className="hidden items-center gap-2 whitespace-nowrap text-xs text-mc-label xl:flex"
          title={mission}
        >
          {/* Clock ticks every second, so server and client HTML differ by design. */}
          <span className="keep-mono font-mono tabular-nums text-mc-soft" suppressHydrationWarning>
            MET {formatDayTime(now - MISSION_EPOCH)}
          </span>
          <span className="text-mc-line-strong">·</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "space" ? "bg-mc-amber" : "bg-mc-green"}`} />
            {mode === "space" ? "Earth link 20 min delay" : "Online"}
          </span>
        </div>

        <span className="hidden h-5 w-px bg-mc-line-strong xl:block" aria-hidden />

        <SyncChip />

        <label className="hidden items-center gap-2 text-xs text-mc-label sm:flex">
          Demo
          <select
            value={scenario.id}
            onChange={(e) => setScenario(e.target.value as DemoScenarioId)}
            className="min-h-8 w-36 rounded-md border border-mc-line-strong bg-mc-panel px-2 text-xs text-foreground"
          >
            {DEMO_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <ThemeToggle />
      </div>
    </header>
  );
}

/** Records waiting for Earth, with a one-tap sync. Replaces the old sync card in the side rail. */
function SyncChip() {
  const { unsyncedCount, syncNow, isSyncing, isOnline } = useSync();
  const pending = unsyncedCount > 0;
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={isSyncing || !pending}
      title={pending ? `${unsyncedCount} records waiting · tap to sync to Earth` : "All records confirmed by Earth"}
      className={`flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-default ${
        pending
          ? "border-mc-line-strong text-foreground hover:bg-mc-raised"
          : "border-transparent text-mc-label"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {pending && <span className="tabular-nums sm:hidden">{unsyncedCount}</span>}
      <span className="hidden sm:inline">{isSyncing ? "Syncing…" : pending ? `${unsyncedCount} to sync` : isOnline ? "Synced" : "No link"}</span>
    </button>
  );
}
