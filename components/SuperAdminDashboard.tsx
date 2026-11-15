"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { RiskLevel } from "@/lib/risk";
import { MissionHeader } from "./MissionHeader";
import { OfflineAICopilot } from "./OfflineAICopilot";
import { CrewOverview, type CrewMemberView } from "./CrewOverview";
import { VitalsMonitor, type LiveVitals } from "./VitalsMonitor";
import { CabinEnvironment } from "./CabinEnvironment";
import { ExerciseSleep } from "./ExerciseSleep";
import { PVTTest } from "./PVTTest";
import { StoreForwardQueue } from "./StoreForwardQueue";
import { SyncEngine } from "./SyncEngine";
import { DailySelfCheck } from "./DailySelfCheck";
import { BodyMap } from "./BodyMap";
import { LabPanel } from "./LabPanel";
import { SpaceWeatherCard } from "./SpaceWeatherCard";
import { HealthMissions } from "./HealthMissions";
import { useHealthMissions } from "@/lib/missions";
import { SelfCheckDue } from "./SelfCheckDue";
import { SideNav } from "./ui/SideNav";
import { useSync } from "./SyncContext";
import { CopilotProvider, type CrewBrief } from "./CopilotProvider";
import { CopilotFloatingLauncher } from "./CopilotFloatingLauncher";
import { queueHealth, setOutboxUser } from "@/lib/outbox";
import { getInjuries } from "@/lib/injuries";
import { getCycleLog } from "@/lib/periods";
import { getLatestCheck } from "@/lib/selfCheck";
import { reportRoutineDay } from "@/lib/routineLog";
import { MonitoringView } from "./monitoring/MonitoringView";
import { SpaceCatView } from "./spacecat/SpaceCatView";
import { FloatingCat } from "./spacecat/FloatingCat";
import { CrewHotline } from "./hotline/CrewHotline";
import { useHotlineUnread } from "./hotline/useHotlineUnread";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { defaultSexFor } from "@/lib/crewProfiles";

type DashboardResponse = {
  group: { code: string; name: string; destination: string | null } | null;
  syncStatus: { lastSyncAt: string | null };
  crews: Array<{
    crewId: string;
    members: Array<{
      user: {
        id: string;
        name: string;
        email: string;
        callsign: string;
        crewId: string;
        sex?: "male" | "female";
      };
      latest: {
        heartRate: number;
        hrv: number | null;
        spo2: number;
        radiation: number | null;
        timestamp: string;
      } | null;
      baseline: { heartRate: number | null; hrv: number | null; spo2: number | null; samples: number } | null;
      risk: RiskLevel;
    }>;
  }>;
};

export function SuperAdminDashboard({ user }: { user: SessionUser }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [tab, setTab] = useState("telemetry");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The crew commander (CDR) sees their whole crew; other astronauts see only themselves.
  // The server enforces this too: /api/dashboard only returns what this user may see.
  const isCrewCommander = user.role === "ASTRONAUT" && user.callsign === "CDR";
  const seesCrew = user.role === "COMMANDER" || isCrewCommander;
  const [requestedId, setSelectedId] = useState(
    user.role === "ASTRONAUT" ? user.userId : ""
  );
  const { unsyncedCount } = useSync();
  const telemetry = useMissionTelemetry();
  const [liveSelected, setLiveSelected] = useState<LiveVitals | null>(null);

  // Co-pilot chats and health logs from this console are mirrored to the server for
  // mission oversight. Re-send the current logs on sign-in so anything recorded before
  // (or while the queue was cleared) reaches the server too.
  useEffect(() => {
    setOutboxUser({ userId: user.userId, name: user.name });
    if (user.role === "ASTRONAUT") {
      const injuries = getInjuries(user.name);
      if (injuries.length) void queueHealth("injuries", "current", injuries, user.name);
      const cycle = getCycleLog(user.name);
      if (cycle.days.length || cycle.suppressed) void queueHealth("periods", "current", cycle, user.name);
      const check = getLatestCheck(user.userId);
      // A merged summary isn't re-sent: each of its readings already went out on its own.
      if (check && !check.merged) void queueHealth("selfCheck", String(check.at), check);
      reportRoutineDay(user.userId);
    }
    return () => setOutboxUser(null);
  }, [user.userId, user.name, user.role]);

  const inFlight = useRef(false);
  const load = useCallback(async () => {
    // Skip a poll while the previous one is still running so slow links don't pile requests up.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      /* offline */
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- update from the awaited dashboard response
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, [load]);

  const members: CrewMemberView[] = useMemo(() => {
    if (!data) return [];
    const flat = data.crews.flatMap((c) => c.members);
    const filtered =
      user.role === "COMMANDER"
        ? flat
        : isCrewCommander
          ? flat.filter((m) => m.user.crewId === user.crewId)
          : flat.filter((m) => m.user.id === user.userId);
    return filtered.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      callsign: m.user.callsign,
      sex: m.user.sex || defaultSexFor(m.user.name),
      heartRate: m.latest?.heartRate ?? 70,
      hrv: m.latest?.hrv ?? 60,
      risk: m.risk,
    }));
  }, [data, user, isCrewCommander]);

  const selectedMember = members.find((m) => m.id === requestedId) ?? members[0];
  const selectedId = selectedMember?.id ?? requestedId;
  const selectedServer = data?.crews
    .flatMap((c) => c.members)
    .find((m) => m.user.id === selectedId)?.latest;
  const selectedHrv = liveSelected?.userId === selectedId ? liveSelected.hrv : (selectedMember?.hrv ?? selectedServer?.hrv ?? 60);
  const selectedHr = liveSelected?.userId === selectedId ? liveSelected.heartRate : (selectedMember?.heartRate ?? selectedServer?.heartRate ?? 72);

  // The live card (e.g. an irregular rhythm on the ECG) can be worse than the last server reading.
  const crewRisks = members.map((m) => {
    if (liveSelected?.userId !== m.id) return m.risk;
    const order = ["GREEN", "YELLOW", "RED"] as const;
    return order[Math.max(order.indexOf(m.risk), order.indexOf(liveSelected.risk))];
  });

  // Every visible crew member's latest reading and personal baseline, so the co-pilot can
  // answer about anyone, not just the selected card.
  const crewBriefs: CrewBrief[] = useMemo(
    () =>
      (data?.crews ?? [])
        .flatMap((c) => c.members)
        .filter((m) => user.role === "COMMANDER" || (isCrewCommander ? m.user.crewId === user.crewId : m.user.id === user.userId))
        .map((m) => ({
          name: m.user.name,
          callsign: m.user.callsign,
          risk: m.risk,
          vitals: m.latest,
          usualHr: m.baseline?.heartRate != null ? Math.round(m.baseline.heartRate) : null,
          usualHrv: m.baseline?.hrv != null ? Math.round(m.baseline.hrv) : null,
        })),
    [data, user, isCrewCommander]
  );
  const canWrite =
    user.role === "ASTRONAUT" && selectedId === user.userId;

  const missions = useHealthMissions(user.userId);
  const hotlineUnread = useHotlineUnread(user.role === "ASTRONAUT", tab === "hotline");

  const tabs = [
    { id: "telemetry", label: seesCrew ? "Crew vitals" : "My vitals" },
    { id: "body", label: "Body map" },
    { id: "check", label: "Daily check" },
    ...(user.role === "ASTRONAUT" ? [{ id: "monitoring", label: "My monitoring" }] : []),
    { id: "missions", label: "Missions", badge: missions.remaining || undefined },
    { id: "habitat", label: "Habitat & routine" },
    { id: "pvt", label: "Cognitive test" },
    { id: "queue", label: "Sync queue", badge: unsyncedCount || undefined },
    ...(user.role === "ASTRONAUT" ? [{ id: "hotline", label: "Hotline", badge: hotlineUnread || undefined }] : []),
    { id: "spacecat", label: "Space cat" },
  ];

  const descriptions: Record<string, string> = {
    telemetry: seesCrew
      ? "Live heart rate, SpO₂ and HRV for the crew. Pick a crew member to see their ECG and blood labs."
      : "Your live heart rate, SpO₂ and HRV, with your latest blood labs.",
    body: "How each spaceflight hazard affects the body. Tap a system to see readings and what to do.",
    check: "Six quick measurements each morning. About two minutes.",
    monitoring: "Open alerts and 7 to 30 day trends for everything you log.",
    missions: "Daily health habits that build your streak and unlock mission patches.",
    habitat: "Cabin air, radiation, space weather and today's exercise and sleep.",
    pvt: "A 3-minute reaction-time test that checks alertness and fatigue.",
    queue: "Records kept on this device until mission control confirms they arrived.",
    hotline: "Message mission control on Earth. Replies arrive with the signal delay.",
    spacecat: "Your cabin companion. Healthy habits keep it happy.",
  };
  const activeTab = tabs.find((t) => t.id === tab);

  // The crew shown first: the astronaut's own group, or MTV-1 for the commander.
  const homeCrew = user.role === "COMMANDER" ? "MTV-1" : user.crewId;

  const crewCards = (list: DashboardResponse["crews"][number]["members"], hrvDefault: number): CrewMemberView[] =>
    list.map((m) => {
      const card: CrewMemberView = {
        id: m.user.id,
        name: m.user.name,
        callsign: m.user.callsign,
        sex: m.user.sex || defaultSexFor(m.user.name),
        heartRate: m.latest?.heartRate ?? 70,
        hrv: m.latest?.hrv ?? hrvDefault,
        risk: m.risk,
      };
      // The selected card mirrors the live readout below it.
      return liveSelected?.userId === m.user.id
        ? { ...card, heartRate: liveSelected.heartRate, hrv: liveSelected.hrv, risk: liveSelected.risk }
        : card;
    });

  const missionName = data?.group
    ? `${data.group.code} · ${data.group.destination ?? data.group.name}`
    : user.role === "COMMANDER"
      ? "All crews · Mars transit"
      : `${user.crewId} · Mars transit`;

  return (
    <CopilotProvider key={user.userId} userId={user.userId}>
      <div className="flex min-h-screen w-full bg-mc-bg font-sans text-foreground">
        <SyncEngine />

        {/* Antigravity-Style Left Sidebar (Docked to screen left) */}
        <SideNav
          tabs={tabs}
          active={tab}
          onChange={setTab}
          user={user}
          mission={missionName}
          crewRisks={crewRisks}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Workspace */}
        <div className="flex flex-1 flex-col min-w-0 min-h-screen">
          <MissionHeader
            crewRisks={crewRisks}
            selfOnly={!seesCrew}
            mission={missionName}
            activeTabLabel={activeTab?.label}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />

          <div className="flex-1 w-full px-4 pt-6 pb-24 md:px-6 lg:px-8 lg:pt-8">
            <div className="mx-auto mb-6 w-full max-w-[1680px]">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[28px]">
                {activeTab?.label ?? "Dashboard"}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-mc-muted">{descriptions[tab]}</p>
            </div>
            <div className="mx-auto grid w-full max-w-[1680px] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
              <main key={tab} className="flex min-w-0 flex-col gap-6 animate-tab-enter">
                {tab === "telemetry" && <SelfCheckDue userId={user.userId} onStart={() => setTab("check")} />}

                {tab === "telemetry" && (
                  <>
                    {seesCrew && (
                      <CrewOverview
                        members={
                          data?.crews.find((c) => c.crewId === homeCrew)
                            ? crewCards(data.crews.find((c) => c.crewId === homeCrew)!.members, 60)
                            : members
                        }
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                      />
                    )}
                    {user.role === "COMMANDER" &&
                      data?.crews
                        .filter((c) => c.crewId !== homeCrew)
                        .map((crew) => (
                          <div key={crew.crewId} className="space-y-2">
                            <h3 className="mc-label">Crew {crew.crewId}</h3>
                            <CrewOverview
                              members={crewCards(crew.members, 55)}
                              selectedId={selectedId}
                              onSelect={setSelectedId}
                            />
                          </div>
                        ))}
                    <VitalsMonitor
                      userId={selectedId}
                      userName={selectedMember?.name ?? user.name}
                      canWrite={canWrite}
                      onLive={setLiveSelected}
                      serverVitals={
                        selectedServer
                          ? {
                              heartRate: selectedServer.heartRate,
                              hrv: selectedServer.hrv ?? 60,
                              spo2: selectedServer.spo2,
                              radiation: selectedServer.radiation ?? 0.075,
                            }
                          : undefined
                      }
                    />
                    <LabPanel
                      name={selectedMember?.name ?? user.name}
                      callsign={selectedMember?.callsign ?? user.callsign}
                    />
                  </>
                )}

                {tab === "body" && (
                  <BodyMap
                    userId={selectedMember?.id ?? user.userId}
                    name={selectedMember?.name ?? user.name}
                    callsign={selectedMember?.callsign ?? user.callsign}
                    userSex={selectedMember?.sex ?? (selectedMember ? defaultSexFor(selectedMember.name) : undefined) ?? user.sex ?? defaultSexFor(user.name)}
                    vitals={{
                      heartRate: selectedMember?.heartRate ?? selectedServer?.heartRate ?? 72,
                      hrv: selectedMember?.hrv ?? selectedServer?.hrv ?? 60,
                      spo2: selectedServer?.spo2 ?? 98,
                      radiation: selectedServer?.radiation ?? 0.075,
                    }}
                    onOpenSelfCheck={() => setTab("check")}
                  />
                )}

                {tab === "monitoring" && <MonitoringView url="/api/monitoring/me" show="both" canResolve={false} userId={user.userId} />}

                {tab === "missions" && <HealthMissions userId={user.userId} onGo={setTab} />}

                {tab === "check" && (
                  <DailySelfCheck
                    userId={user.userId}
                    userName={user.name}
                    onDone={() => setTab("telemetry")}
                    onReviewAlerts={user.role === "ASTRONAUT" ? () => setTab("monitoring") : undefined}
                  />
                )}

                {tab === "habitat" && (
                  // Cabin environment & radiation across the full width, then space weather and exercise & sleep side by side.
                  <div className="flex min-w-0 flex-col gap-5">
                    <CabinEnvironment />
                    <div className="grid items-start gap-5 lg:grid-cols-2">
                      <div className="min-w-0">
                        <SpaceWeatherCard />
                      </div>
                      <div className="min-w-0">
                        <ExerciseSleep />
                      </div>
                    </div>
                  </div>
                )}
                {tab === "pvt" && <PVTTest userId={user.userId} />}
                {tab === "queue" && <StoreForwardQueue />}
                {tab === "hotline" && (
                  <CrewHotline
                    vitals={
                      selectedId === user.userId
                        ? { heartRate: selectedHr, spo2: selectedServer?.spo2 ?? 98, hrv: selectedHrv, radiation: telemetry.radiation }
                        : null
                    }
                  />
                )}
                {tab === "spacecat" && (
                  <SpaceCatView
                    userId={user.userId}
                    name={user.name}
                    heartRate={selectedId === user.userId ? selectedHr : undefined}
                    onGo={setTab}
                  />
                )}
              </main>

              <div className="min-w-0">
                <OfflineAICopilot
                  userId={user.userId}
                  userName={user.name}
                  patientName={selectedMember?.name}
                  patientCallsign={selectedMember?.callsign ?? user.callsign}
                  crew={crewBriefs}
                  displayVitals={selectedServer ?? undefined}
                  simulatedArrhythmia={canWrite && telemetry.simulationEnabled && telemetry.arrhythmia}
                />
              </div>
            </div>
          </div>
        </div>
        <FloatingCat userId={user.userId} hidden={tab === "spacecat"} onOpen={() => setTab("spacecat")} />
        <CopilotFloatingLauncher />
      </div>
    </CopilotProvider>
  );
}
