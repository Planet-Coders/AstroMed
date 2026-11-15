"use client";

import { useEffect, useState } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/demoScenarios";
import { worstRisk, type RiskLevel } from "@/lib/risk";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { useMissionMode } from "./MissionModeContext";
import { ThemeToggle } from "./ThemeToggle";

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
  activeTabLabel,
  onOpenMobileMenu,
}: {
  crewRisks: RiskLevel[];
  mission?: string;
  /** Astronaut view: the status pill describes only the signed-in crew member. */
  selfOnly?: boolean;
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
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mc-line bg-mc-header px-4 py-2.5 md:px-6">
      {onOpenMobileMenu && (
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-mc-line-strong text-mc-label hover:bg-mc-raised hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Mobile Title (shown only when left sidebar is hidden on small screens) */}
      <div className="flex items-center gap-2 lg:hidden">
        <svg width="24" height="24" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="16.5" fill="#0B3D91" stroke="#2A5BC0" />
          <ellipse cx="18" cy="18" rx="15" ry="6" fill="none" stroke="#FFFFFF" strokeOpacity=".55" transform="rotate(-24 18 18)" />
          <path d="M7 19h6l2-5 3 9 2.5-6H29" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[14px] font-bold tracking-[0.06em]">AstroMed</span>
      </div>

      {/* Desktop breadcrumb trail (Antigravity-inspired) */}
      <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
        <span className="text-mc-label">{mission}</span>
        <span className="text-mc-line-strong">/</span>
        <span className="font-semibold text-foreground tracking-wide">{activeTabLabel ?? "Dashboard"}</span>
      </div>

      <span
        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${status.cls}`}
        role="status"
        title="Based on live vitals only: heart rate, HRV, SpO₂, radiation dose and heart rhythm. Blood labs are assessed separately in the Medical assessment panel."
      >
        <span className={`h-2 w-2 rounded-full ${status.dot}`} />
        {status.text}
        <span className="font-mono text-[10px] font-normal opacity-70">· vitals</span>
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-4">
        <div className="hidden text-right font-mono text-xs leading-tight sm:block">
          {/* Clock ticks every second, so server and client HTML differ by design. */}
          <div suppressHydrationWarning>MET {formatDayTime(now - MISSION_EPOCH)}</div>
          <div className={mode === "space" ? "text-mc-amber" : "text-mc-green"}>
            {mode === "space" ? "Earth link delay 20m 04s" : "Online · syncing"}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-mc-label">
          Demo
          <select
            value={scenario.id}
            onChange={(e) => setScenario(e.target.value as DemoScenarioId)}
            className="min-h-8 rounded-md border border-mc-line-strong bg-mc-panel px-2 text-xs text-foreground"
          >
            {DEMO_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <ThemeToggle />
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.assign("/login");
          }}
          className="min-h-8 rounded-md border border-mc-line-strong px-3 text-xs font-medium text-mc-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
