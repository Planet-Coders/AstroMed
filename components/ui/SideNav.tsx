"use client";

import { useState, type ReactNode } from "react";
import type { TabItem } from "./TabBar";
import type { SessionUser } from "@/lib/auth";
import { worstRisk, type RiskLevel } from "@/lib/risk";
import { useMissionMode } from "../MissionModeContext";

const ICONS: Record<string, ReactNode> = {
  telemetry: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  body: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v7m0 0-3 8m3-8 3 8M6 10l6-2 6 2" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  monitoring: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  missions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  habitat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  ),
  pvt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M10 2h4" />
    </svg>
  ),
  spacecat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d="M5 11V4l4 3h6l4-3v7" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M9.5 12h.01M14.5 12h.01M11 15h2" />
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
};

function NavIcon({ id }: { id: string }) {
  return ICONS[id] ?? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const SECTIONS = [
  {
    title: "Clinical Telemetry",
    ids: ["telemetry", "body", "check", "monitoring"],
  },
  {
    title: "Habitat & Protocols",
    ids: ["missions", "habitat", "pvt"],
  },
  {
    title: "Operations & Sync",
    ids: ["queue"],
  },
  {
    title: "Crew Morale",
    ids: ["spacecat"],
  },
];

export function SideNav({
  tabs,
  active,
  onChange,
  user,
  mission = "MTV-1 · Mars transit",
  crewRisks = [],
  mobileOpen = false,
  onMobileClose,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  user?: SessionUser;
  mission?: string;
  crewRisks?: RiskLevel[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { mode } = useMissionMode();

  const handleSelect = (id: string) => {
    onChange(id);
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  const level = worstRisk(crewRisks.length ? crewRisks : ["GREEN"]);
  const statusDotClass =
    level === "RED"
      ? "bg-mc-red ring-2 ring-mc-red/30 animate-pulse"
      : level === "YELLOW"
        ? "bg-mc-amber ring-2 ring-mc-amber/30"
        : "bg-mc-green ring-2 ring-mc-green/30";

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AM";

  const renderNavList = () => {
    const tabMap = new Map(tabs.map((t) => [t.id, t]));
    const renderedIds = new Set<string>();

    return (
      <div className={`flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin ${collapsed ? "px-2" : "px-2.5"}`}>
        {SECTIONS.map((section) => {
          const sectionTabs = section.ids
            .map((id) => tabMap.get(id))
            .filter((t): t is TabItem => Boolean(t));

          if (!sectionTabs.length) return null;
          sectionTabs.forEach((t) => renderedIds.add(t.id));

          return (
            <div key={section.title} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-mc-label/70">
                  {section.title}
                </div>
              )}
              {collapsed && <div className="mx-2 my-2 border-t border-mc-line/40" />}

              <ul className="space-y-1">
                {sectionTabs.map((tab) => {
                  const on = active === tab.id;
                  return (
                    <li key={tab.id} className={collapsed ? "flex justify-center" : ""}>
                      <button
                        type="button"
                        onClick={() => handleSelect(tab.id)}
                        aria-current={on ? "page" : undefined}
                        title={collapsed ? tab.label : undefined}
                        className={`group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                          collapsed ? "h-9 w-9 justify-center px-0" : "w-full px-3"
                        } ${
                          on
                            ? "bg-mc-select text-mc-on-select border border-mc-select"
                            : "border border-transparent text-mc-muted hover:bg-mc-raised hover:text-foreground"
                        }`}
                      >
                        {on && (
                          <span
                            className={`absolute rounded-r bg-mc-cyan ${
                              collapsed ? "left-0 top-1.5 bottom-1.5 w-1" : "left-0 top-1.5 bottom-1.5 w-1"
                            }`}
                          />
                        )}

                        <span
                          className={`transition-colors duration-150 ${
                            on ? "text-mc-on-select" : "text-mc-label group-hover:text-mc-soft"
                          }`}
                        >
                          <NavIcon id={tab.id} />
                        </span>

                        {!collapsed && (
                          <span className="flex-1 truncate text-left">{tab.label}</span>
                        )}

                        {!collapsed && tab.badge != null && (
                          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold shadow-xs ${on ? "border-black/15 bg-black/10 text-mc-on-select" : "border-mc-line bg-mc-raised text-mc-link"}`}>
                            {tab.badge}
                          </span>
                        )}

                        {collapsed && tab.badge != null && (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-mc-cyan shadow-[0_0_6px_var(--color-mc-cyan)]" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/* Any extra tabs not in the pre-defined sections */}
        {tabs.filter((t) => !renderedIds.has(t.id)).length > 0 && (
          <ul className="space-y-1 pt-1">
            {tabs
              .filter((t) => !renderedIds.has(t.id))
              .map((tab) => {
                const on = active === tab.id;
                return (
                  <li key={tab.id} className={collapsed ? "flex justify-center" : ""}>
                    <button
                      type="button"
                      onClick={() => handleSelect(tab.id)}
                      aria-current={on ? "page" : undefined}
                      title={collapsed ? tab.label : undefined}
                      className={`group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                        collapsed ? "h-9 w-9 justify-center px-0" : "w-full px-3"
                      } ${
                        on
                          ? "bg-mc-select text-mc-on-select border border-mc-select"
                          : "border border-transparent text-mc-muted hover:bg-mc-raised hover:text-foreground"
                      }`}
                    >
                      {on && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-mc-cyan" />
                      )}
                      <span className={on ? "text-mc-on-select" : "text-mc-label group-hover:text-mc-soft"}>
                        <NavIcon id={tab.id} />
                      </span>
                      {!collapsed && <span className="flex-1 truncate text-left">{tab.label}</span>}
                      {!collapsed && tab.badge != null && (
                        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${on ? "border-black/15 bg-black/10 text-mc-on-select" : "border-mc-line bg-mc-raised text-mc-link"}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full w-full flex-col bg-mc-bg text-foreground select-none">
      {/* Brand Header */}
      {collapsed ? (
        /* Collapsed Header: single centered AstroMed emblem that acts as the expand button without clashing */
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-mc-line">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="group relative flex h-9 w-9 items-center justify-center rounded-lg bg-mc-nasa/40 border border-mc-nasa-edge/50 hover:bg-mc-nasa/70 hover:border-mc-nasa-edge transition-all shadow-inner"
            aria-label="Expand sidebar"
          >
            <svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true" className="group-hover:scale-95 transition-transform">
              <circle cx="18" cy="18" r="16.5" fill="#0B3D91" stroke="#2A5BC0" />
              <ellipse cx="18" cy="18" rx="15" ry="6" fill="none" stroke="#FFFFFF" strokeOpacity=".55" transform="rotate(-24 18 18)" />
              <path d="M7 19h6l2-5 3 9 2.5-6H29" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-mc-panel border border-mc-line-strong text-[9px] text-mc-link group-hover:scale-110 transition-transform">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>
        </div>
      ) : (
        /* Expanded Header: brand and distinct collapse button */
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-mc-line px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mc-nasa/40 border border-mc-nasa-edge/50 shadow-inner">
              <svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="16.5" fill="#0B3D91" stroke="#2A5BC0" />
                <ellipse cx="18" cy="18" rx="15" ry="6" fill="none" stroke="#FFFFFF" strokeOpacity=".55" transform="rotate(-24 18 18)" />
                <path d="M7 19h6l2-5 3 9 2.5-6H29" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold tracking-[0.05em] text-foreground">AstroMed</span>
                <span className="rounded bg-mc-raised px-1 py-0.2 font-mono text-[9px] font-semibold text-mc-link border border-mc-line-strong">
                  EDGE
                </span>
              </div>
              <p className="truncate text-[10px] text-mc-label">{mission}</p>
            </div>
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            className="hidden h-7 w-7 items-center justify-center rounded border border-mc-line-strong text-mc-label hover:bg-mc-raised hover:text-foreground transition-colors lg:flex"
            aria-label="Collapse sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <polyline points="15 10 13 12 15 14" />
            </svg>
          </button>

          {/* Mobile close button */}
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="flex h-7 w-7 items-center justify-center rounded border border-mc-line-strong text-mc-label hover:bg-mc-raised hover:text-foreground lg:hidden"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Prominent Quick Action Button (styled like Antigravity's '+ New Conversation') */}
      <div className={`shrink-0 pt-3 pb-1 ${collapsed ? "flex justify-center px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={() => handleSelect("check")}
          title="Daily Self-Check"
          className={`flex items-center gap-2 rounded-lg border text-xs font-semibold shadow-xs transition-colors duration-150 ${
            collapsed
              ? "h-9 w-9 justify-center border-mc-line-strong bg-mc-panel text-foreground hover:border-mc-line-strong hover:bg-mc-raised"
              : "h-9 w-full px-3 border-mc-line-strong bg-mc-panel text-foreground hover:bg-mc-raised"
          } ${active === "check" ? "border-mc-select bg-mc-select text-mc-on-select" : ""}`}
        >
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] font-bold ${active === "check" ? "bg-black/10 text-mc-on-select" : "bg-mc-raised text-mc-link"}`}>
            +
          </span>
          {!collapsed && <span className="truncate">Daily Self-Check</span>}
        </button>
      </div>

      {/* Navigation Sections */}
      {renderNavList()}

      {/* User Dock & Latency Footer (like Antigravity Settings Dock) */}
      <div className="shrink-0 border-t border-mc-line bg-mc-bg p-2.5">
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
          <div
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mc-raised border border-mc-line-strong font-mono text-[11px] font-bold text-mc-link shadow-inner cursor-pointer"
            title={`${user?.name ?? "Astronaut"} (${user?.callsign ?? user?.role ?? "Crew"})`}
            onClick={() => {
              if (collapsed) setCollapsed(false);
            }}
          >
            {initials}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-mc-bg ${statusDotClass}`}
            />
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">
                {user?.name ?? "Astronaut"}
              </div>
              <div className="truncate text-[10px] text-mc-label">
                {user?.callsign ? `${user.callsign} · ` : ""}
                {user?.role === "COMMANDER" ? "Commander" : "Crew"}
              </div>
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                window.location.assign("/login");
              }}
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded text-mc-label hover:bg-mc-raised hover:text-foreground transition-colors"
              aria-label="Sign out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-mono text-mc-label/80 border-t border-mc-line/40 pt-1.5">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${mode === "space" ? "bg-mc-amber" : "bg-mc-green"}`} />
              {mode === "space" ? "20m delay" : "Real-time sync"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-mc-label/60">NASA EDGE</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside
        aria-label="Workspace views"
        className={`hidden lg:flex flex-col sticky top-0 h-screen shrink-0 border-r border-mc-line overflow-hidden transition-[width] duration-200 ease-in-out z-30 ${
          collapsed ? "w-[68px]" : "w-[256px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Slide in when mobileOpen) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#3a342c]/45 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside
            aria-label="Workspace views"
            className="relative flex h-full w-[280px] max-w-[85vw] flex-col shadow-2xl z-10"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
