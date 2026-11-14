"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { assessRisk, type RiskLevel } from "@/lib/risk";
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
// import { NasaOsdrPanel } from "./NasaOsdrPanel";
// import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";

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
      };
      latest: {
        heartRate: number;
        hrv: number | null;
        spo2: number;
        radiation: number | null;
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
  const [selectedId, setSelectedId] = useState(
    user.role === "ASTRONAUT" ? user.userId : ""
  );
  const { unsyncedCount } = useSync();
  // const telemetry = useMissionTelemetry();
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
      if (check) void queueHealth("selfCheck", String(check.at), check);
      reportRoutineDay();
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
      heartRate: m.latest?.heartRate ?? 70,
      hrv: m.latest?.hrv ?? 60,
      risk: m.risk,
    }));
  }, [data, user]);

  useEffect(() => {
    if (!members.length) return;
    if (!selectedId || !members.find((m) => m.id === selectedId)) {
      setSelectedId(members[0].id);
    }
  }, [members, selectedId]);

  const selectedMember = members.find((m) => m.id === selectedId);
  const selectedServer = data?.crews
    .flatMap((c) => c.members)
    .find((m) => m.user.id === selectedId)?.latest;
  const selectedHrv = liveSelected?.userId === selectedId ? liveSelected.hrv : (selectedMember?.hrv ?? selectedServer?.hrv ?? 60);
  const selectedHr = liveSelected?.userId === selectedId ? liveSelected.heartRate : (selectedMember?.heartRate ?? selectedServer?.heartRate ?? 72);

  const crewRisks = members.map((m) => m.risk);

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
          vitals: m.latest
            ? {
                heartRate: m.latest.heartRate,
                hrv: m.latest.hrv ?? 60,
                spo2: m.latest.spo2,
                radiation: m.latest.radiation ?? 0.075,
              }
            : null,
          usualHr: m.baseline?.heartRate != null ? Math.round(m.baseline.heartRate) : null,
          usualHrv: m.baseline?.hrv != null ? Math.round(m.baseline.hrv) : null,
        })),
    [data, user]
  );
  const canWrite =
    user.role === "ASTRONAUT" && selectedId === user.userId;

  const missions = useHealthMissions(user.userId);

  const tabs = [
    { id: "telemetry", label: seesCrew ? "Crew vitals" : "My vitals" },
    { id: "body", label: "Body map" },
    { id: "check", label: "Daily check" },
    ...(user.role === "ASTRONAUT" ? [{ id: "monitoring", label: "My monitoring" }] : []),
    { id: "missions", label: "Missions", badge: missions.remaining || undefined },
    { id: "habitat", label: "Habitat & routine" },
    { id: "pvt", label: "Cognitive test" },
    { id: "queue", label: "Sync queue", badge: unsyncedCount || undefined },
  ];

  // The crew shown first: the astronaut's own group, or MTV-1 for the commander.
  const homeCrew = user.role === "COMMANDER" ? "MTV-1" : user.crewId;

  const crewCards = (list: DashboardResponse["crews"][number]["members"], hrvDefault: number) =>
    list.map((m) => {
      const card = {
        id: m.user.id,
        name: m.user.name,
        callsign: m.user.callsign,
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
    <CopilotProvider>
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
            activeTabLabel={tabs.find((t) => t.id === tab)?.label}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />

          <div className="flex-1 w-full p-4 md:p-6 lg:p-7 pb-24">
            <div className="mx-auto grid w-full max-w-[1680px] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_370px]">
              <main key={tab} className="flex min-w-0 flex-col gap-5 animate-tab-enter">
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
                    {/* NASA OSDR research panel (OSD-751, OSD-661, OSD-489) — hidden for now
                    <NasaOsdrPanel
                      name={selectedMember?.name ?? user.name}
                      hrv={selectedHrv}
                      exerciseMinutes={telemetry.exerciseMinutes}
                      exerciseTarget={telemetry.exerciseTarget}
                      doseRate={telemetry.radiation}
                    />
                    */}
                    <LabPanel
                      name={selectedMember?.name ?? user.name}
                      callsign={selectedMember?.callsign ?? user.callsign}
                    />
                  </>
                )}

                {tab === "body" && (
                  <BodyMap
                    userId={user.userId}
                    name={selectedMember?.name ?? user.name}
                    callsign={selectedMember?.callsign ?? user.callsign}
                    vitals={{
                      heartRate: selectedMember?.heartRate ?? selectedServer?.heartRate ?? 72,
                      hrv: selectedMember?.hrv ?? selectedServer?.hrv ?? 60,
                      spo2: selectedServer?.spo2 ?? 98,
                      radiation: selectedServer?.radiation ?? 0.075,
                    }}
                    onOpenSelfCheck={() => setTab("check")}
                  />
                )}

                {tab === "monitoring" && <MonitoringView url="/api/monitoring/me" show="both" canResolve={false} />}

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
                  // Radiation (cabin dose + space weather) and exercise & sleep side by side, both from the top.
                  <div className="grid items-start gap-5 lg:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-5">
                      <CabinEnvironment />
                      <SpaceWeatherCard />
                    </div>
                    <div className="min-w-0">
                      <ExerciseSleep />
                    </div>
                  </div>
                )}
                {tab === "pvt" && <PVTTest />}
                {tab === "queue" && <StoreForwardQueue />}
              </main>

              <div className="min-w-0">
                <OfflineAICopilot
                  userId={user.userId}
                  userName={user.name}
                  patientName={selectedMember?.name}
                  patientCallsign={selectedMember?.callsign ?? user.callsign}
                  crew={crewBriefs}
                  displayVitals={
                    selectedMember
                      ? {
                          heartRate: selectedHr,
                          hrv: selectedHrv,
                          spo2: selectedServer?.spo2 ?? 98,
                          radiation: selectedServer?.radiation ?? 0.075,
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <CopilotFloatingLauncher />
      </div>
    </CopilotProvider>
  );
}
