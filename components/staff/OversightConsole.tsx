"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { RiskLevel } from "@/lib/risk";
import { assessRisk } from "@/lib/risk";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { INJURY_TYPES, injuryLevel, type Injury } from "@/lib/injuries";
import type { CycleLog } from "@/lib/periods";
import type { DayLog } from "@/lib/routineLog";
import type { StoredCheck } from "@/lib/selfCheck";
import {
  LEVEL_DOT,
  LEVEL_TEXT,
  summarizeHealth,
  type HealthReportRow,
  type HealthSummary,
  type Vitals,
} from "@/lib/healthSummary";
import { StaffHeader } from "./StaffHeader";
import { METRIC, type MetricId } from "@/lib/monitoring/catalog";
import { MonitoringView } from "@/components/monitoring/MonitoringView";
import { EarthHotline } from "@/components/hotline/EarthHotline";

function SyntheticBadge() {
  return (
    <span className="rounded border border-mc-violet/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-mc-violet" title="Generated test data, not a real astronaut">
      SYNTHETIC
    </span>
  );
}

type GroupInfo = { id: string; code: string; name: string; destination: string | null; description: string | null };
type GroupListItem = GroupInfo & { _count: { members: number } };
type MemberUser = { id: string; name: string; email: string; callsign: string; crewId: string; synthetic?: boolean };
type GroupMember = {
  user: MemberUser;
  latest: Vitals | null;
  risk: RiskLevel | null;
  reports: HealthReportRow[];
  chatCount: number;
  lastChatAt: string | null;
  monitoring?: {
    missing: Record<MetricId, "ok" | "late" | "missing" | "never">;
    alerts: { open: number; acknowledged: number; worst: "YELLOW" | "RED" | null };
  };
};
type MemberDetail = {
  member: MemberUser & { createdAt: string };
  group: { id: string; code: string; name: string };
  vitals: (Vitals & { id: string })[];
  reports: HealthReportRow[];
};
type ChatRow = { id: string; role: "USER" | "ASSISTANT"; content: string; mode: "WEBLLM" | "BASIC"; createdAt: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** SpO₂ arrives as a float from the sensor simulation; one decimal is enough. */
const pct = (n: number) => String(Math.round(n * 10) / 10);

const LEVEL_WORD: Record<RiskLevel, string> = { GREEN: "Nominal", YELLOW: "Caution", RED: "Warning" };

function LevelPill({ level, children }: { level: RiskLevel; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${LEVEL_TEXT[level]}`}>
      <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} />
      {children ?? LEVEL_WORD[level]}
    </span>
  );
}

export function OversightConsole({ user }: { user: { id: string; name: string; role: Role } }) {
  const [groups, setGroups] = useState<GroupListItem[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [group, setGroup] = useState<{ group: GroupInfo; members: GroupMember[] } | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/oversight/groups")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load groups (${r.status})`))))
      .then((d: { groups: GroupListItem[] }) => {
        setGroups(d.groups);
        setGroupId((id) => id || d.groups[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadGroup = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const r = await fetch(`/api/oversight/groups/${id}`);
      if (!r.ok) throw new Error(`Could not load group (${r.status})`);
      setGroup(await r.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load group");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the selected group, then poll
    void loadGroup(groupId);
    const t = setInterval(() => void loadGroup(groupId), 15_000);
    return () => clearInterval(t);
  }, [groupId, loadGroup]);

  const members = useMemo(
    () =>
      (group?.group.id === groupId ? group.members : []).map((m) => ({
        ...m,
        summary: summarizeHealth(m.reports, m.risk, m.latest),
      })),
    [group, groupId]
  );

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <StaffHeader user={user} active="/oversight" subtitle="Crew oversight · flight surgeon & mission control" />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-6">
        {error && <p className="rounded-md border border-mc-red/50 bg-mc-red/10 px-4 py-2.5 text-sm text-mc-red">{error}</p>}

        <EarthHotline />

        {groups && groups.length === 0 && (
          <Card>
            <p className="text-sm text-mc-muted">No mission groups are assigned to you yet. Ask the super admin to assign one.</p>
          </Card>
        )}

        {groups && groups.length > 0 && !memberId && (
          <>
            <TabBar
              tabs={groups.map((g) => ({ id: g.id, label: `${g.code} · ${g.name}`, badge: g._count.members }))}
              active={groupId}
              onChange={setGroupId}
            />
            {group?.group.id === groupId && (
              <p className="text-xs text-mc-label">
                {[group.group.destination, group.group.description].filter(Boolean).join(" · ")}
              </p>
            )}
            {members.length === 0 && group?.group.id === groupId && <p className="text-sm text-mc-label">No astronauts in this group yet.</p>}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {members.map((m) => (
                <MemberCard key={m.user.id} m={m} summary={m.summary} onOpen={() => setMemberId(m.user.id)} />
              ))}
            </div>
          </>
        )}

        {memberId && <MemberView id={memberId} onBack={() => setMemberId(null)} />}
      </main>
    </div>
  );
}

function MemberCard({ m, summary, onOpen }: { m: GroupMember; summary: HealthSummary; onOpen: () => void }) {
  const v = m.latest;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col gap-3 rounded-lg border bg-mc-panel px-4 py-3.5 text-left transition hover:border-mc-select ${
        summary.level === "RED" ? "border-mc-red/60" : summary.level === "YELLOW" ? "border-mc-amber/50" : "border-mc-line"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="text-sm font-semibold">{m.user.name}</span>
        <span className="font-mono text-[11px] text-mc-label">{m.user.callsign}</span>
        {m.user.synthetic && <SyntheticBadge />}
        <span className="ml-auto">
          <LevelPill level={summary.level} />
        </span>
      </span>

      <span className="flex items-baseline gap-4">
        {v ? (
          <>
            <span className={`font-mono text-xl ${LEVEL_TEXT[m.risk ?? "GREEN"]}`}>
              {v.heartRate}
              <span className="text-[11px] text-mc-label"> BPM</span>
            </span>
            <span className="font-mono text-xs text-mc-muted">SpO₂ {pct(v.spo2)}%</span>
            <span className="font-mono text-xs text-mc-muted">HRV {v.hrv != null ? Math.round(v.hrv) : "–"}</span>
            <span className="ml-auto text-[11px] text-mc-label">{fmt(v.timestamp)}</span>
          </>
        ) : (
          <span className="text-xs text-mc-label">No vitals synced yet</span>
        )}
      </span>

      <span className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-mc-muted">
        <span>
          Sleep{" "}
          <b className={summary.routine ? LEVEL_TEXT[summary.routine.sleepHours < 5 ? "RED" : summary.routine.sleepHours < 6 ? "YELLOW" : "GREEN"] : ""}>
            {summary.routine ? `${summary.routine.sleepHours.toFixed(1)} h` : "–"}
          </b>
        </span>
        <span>
          Exercise <b className="text-foreground">{summary.routine ? `${summary.routine.exerciseMinutes} min` : "–"}</b>
        </span>
        <span>
          Self-check{" "}
          {summary.selfCheck ? <LevelPill level={summary.selfCheck.level}>{fmt(new Date(summary.selfCheck.at).toISOString())}</LevelPill> : "–"}
        </span>
        <span>
          Injuries{" "}
          {summary.injuries?.open.length ? <LevelPill level={summary.injuries.level}>{summary.injuries.open.length} open</LevelPill> : <b className="text-foreground">none</b>}
        </span>
        {summary.periods && (
          <span>
            Cycle{" "}
            <b className="text-foreground">
              {summary.periods.log.suppressed ? "suppressed" : summary.periods.summary.cycleDay ? `day ${summary.periods.summary.cycleDay}` : "logged"}
            </b>
          </span>
        )}
        <span>
          AI chats <b className="text-foreground">{m.chatCount}</b>
        </span>
      </span>

      {m.monitoring && (
        <span className="flex flex-wrap items-center gap-1.5 border-t border-mc-line pt-2 text-[11px]" data-testid="monitoring-summary">
          <span className={m.monitoring.alerts.worst ? LEVEL_TEXT[m.monitoring.alerts.worst] : "text-mc-green"}>
            {m.monitoring.alerts.open + m.monitoring.alerts.acknowledged
              ? `${m.monitoring.alerts.open} open · ${m.monitoring.alerts.acknowledged} acknowledged alert${m.monitoring.alerts.open + m.monitoring.alerts.acknowledged === 1 ? "" : "s"}`
              : "No monitoring alerts"}
          </span>
          {(Object.entries(m.monitoring.missing) as [MetricId, string][])
            .filter(([, st]) => st === "late" || st === "missing")
            .map(([id, st]) => (
              <span
                key={id}
                className={`rounded border px-1.5 font-mono text-[10px] ${st === "missing" ? "border-mc-red/60 text-mc-red" : "border-mc-amber/50 text-mc-amber"}`}
              >
                {METRIC[id].label}: {st}
              </span>
            ))}
        </span>
      )}

      {summary.alerts.length > 0 && (
        <span className="flex flex-col gap-1 border-t border-mc-line pt-2">
          {summary.alerts.slice(0, 3).map((a, i) => (
            <span key={i} className={`text-xs ${LEVEL_TEXT[a.level]}`}>
              {a.source}: <span className="text-mc-soft">{a.text}</span>
            </span>
          ))}
          {summary.alerts.length > 3 && <span className="text-[11px] text-mc-label">+{summary.alerts.length - 3} more</span>}
        </span>
      )}
    </button>
  );
}

function MemberView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [tab, setTab] = useState("monitoring");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/oversight/members/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load member (${r.status})`))))
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const latest = detail?.vitals[0] ?? null;
  const risk = latest ? assessRisk(latest) : null;
  const summary = useMemo(() => (detail ? summarizeHealth(detail.reports, risk, latest) : null), [detail, risk, latest]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onBack} className="min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-medium text-mc-muted hover:text-foreground">
          ← Back to group
        </button>
        {detail && (
          <div>
            <h2 className="text-lg font-semibold">
              {detail.member.name} <span className="font-mono text-xs text-mc-label">{detail.member.callsign}</span>{" "}
              {detail.member.synthetic && <SyntheticBadge />}
            </h2>
            <p className="text-xs text-mc-label">
              {detail.group.code} · {detail.group.name} · {detail.member.email}
            </p>
          </div>
        )}
        {summary && (
          <span className="ml-auto">
            <LevelPill level={summary.level} />
          </span>
        )}
      </div>
      {error && <p className="text-sm text-mc-red">{error}</p>}

      <TabBar
        tabs={[
          { id: "monitoring", label: "Monitoring" },
          { id: "alerts", label: "Alerts" },
          { id: "overview", label: "Overview", badge: summary?.alerts.length || undefined },
          { id: "vitals", label: "Vitals history", badge: detail?.vitals.length },
          { id: "logs", label: "Health logs", badge: detail?.reports.length },
          { id: "chat", label: "AI conversations" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "monitoring" && <MonitoringView url={`/api/oversight/members/${id}/monitoring`} show="series" canResolve />}
      {tab === "alerts" && <MonitoringView url={`/api/oversight/members/${id}/monitoring`} show="alerts" canResolve />}
      {detail && summary && tab === "overview" && <Overview summary={summary} latest={latest} risk={risk} />}
      {detail && tab === "vitals" && <VitalsTable vitals={detail.vitals} />}
      {detail && tab === "logs" && <HealthLogs reports={detail.reports} />}
      {tab === "chat" && <Transcript memberId={id} name={detail?.member.name ?? "Astronaut"} />}
    </div>
  );
}

function Overview({ summary, latest, risk }: { summary: HealthSummary; latest: Vitals | null; risk: RiskLevel | null }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Alerts">
        {summary.alerts.length === 0 ? (
          <p className="text-sm text-mc-green">No alerts. All reported data is in the normal range.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.alerts.map((a, i) => (
              <li key={i} className={`rounded-md border px-3 py-2 text-sm ${a.level === "RED" ? "border-mc-red/50 bg-mc-red/10" : "border-mc-amber/40"}`}>
                <span className={`font-semibold ${LEVEL_TEXT[a.level]}`}>{a.source}</span> <span className="text-mc-soft">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Latest readings">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-mc-label">Vitals</dt>
          <dd>
            {latest ? (
              <LevelPill level={risk ?? "GREEN"}>
                {latest.heartRate} bpm · SpO₂ {pct(latest.spo2)}% · HRV {latest.hrv != null ? Math.round(latest.hrv) : "–"}
              </LevelPill>
            ) : (
              "–"
            )}
          </dd>
          <dt className="text-mc-label">Sleep</dt>
          <dd>{summary.routine ? `${summary.routine.sleepHours.toFixed(1)} h (${summary.routine.date})` : "–"}</dd>
          <dt className="text-mc-label">Exercise</dt>
          <dd>{summary.routine ? `${summary.routine.exerciseMinutes} / 150 min` : "–"}</dd>
          <dt className="text-mc-label">Self-check</dt>
          <dd>{summary.selfCheck ? <LevelPill level={summary.selfCheck.level}>{fmt(new Date(summary.selfCheck.at).toISOString())}</LevelPill> : "not done"}</dd>
          <dt className="text-mc-label">Open injuries</dt>
          <dd>{summary.injuries?.open.length ?? 0}</dd>
          <dt className="text-mc-label">Cycle</dt>
          <dd>
            {summary.periods
              ? summary.periods.log.suppressed
                ? "hormone suppression"
                : `day ${summary.periods.summary.cycleDay ?? "–"}, next ≈ ${summary.periods.summary.nextStart ?? "–"}`
              : "no log"}
          </dd>
        </dl>
      </Card>
    </div>
  );
}

function VitalsTable({ vitals }: { vitals: MemberDetail["vitals"] }) {
  return (
    <Card title="Vitals history (newest 200)">
      {vitals.length === 0 ? (
        <p className="text-sm text-mc-label">No vitals synced yet.</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[520px] text-left font-mono text-xs">
            <thead className="sticky top-0 bg-mc-panel text-mc-label">
              <tr>
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">HR</th>
                <th className="py-2 pr-4 font-medium">SpO₂</th>
                <th className="py-2 pr-4 font-medium">HRV</th>
                <th className="py-2 pr-4 font-medium">Radiation</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mc-line">
              {vitals.map((v) => {
                const level = assessRisk(v);
                return (
                  <tr key={v.id}>
                    <td className="py-1.5 pr-4 text-mc-muted">{fmt(v.timestamp)}</td>
                    <td className="py-1.5 pr-4">{v.heartRate}</td>
                    <td className="py-1.5 pr-4">{pct(v.spo2)}%</td>
                    <td className="py-1.5 pr-4">{v.hrv != null ? Math.round(v.hrv) : "–"}</td>
                    <td className="py-1.5 pr-4">{v.radiation != null ? v.radiation.toFixed(3) : "–"}</td>
                    <td className="py-1.5">
                      <LevelPill level={level} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function HealthLogs({ reports }: { reports: HealthReportRow[] }) {
  const checks = reports.filter((r) => r.kind === "SELF_CHECK");
  const days = reports.filter((r) => r.kind === "ROUTINE");
  const injuries = (reports.find((r) => r.kind === "INJURIES")?.data as Injury[] | undefined) ?? [];
  const cycle = reports.find((r) => r.kind === "PERIODS")?.data as CycleLog | undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={`Daily self-checks (${checks.length})`}>
        {checks.length === 0 && <p className="text-sm text-mc-label">None reported.</p>}
        <ul className="flex flex-col gap-3">
          {checks.map((r) => {
            const c = r.data as StoredCheck;
            return (
              <li key={r.key} className="rounded-md border border-mc-line px-3 py-2">
                <p className="mb-1 text-xs text-mc-label">{fmt(new Date(c.at).toISOString())}</p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {(c.items ?? []).map((i) => (
                    <LevelPill key={i.id} level={i.level}>
                      {i.label} {i.display}
                    </LevelPill>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`Exercise & sleep (${days.length} days)`}>
        {days.length === 0 && <p className="text-sm text-mc-label">None reported.</p>}
        <ul className="divide-y divide-mc-line text-xs">
          {days.map((r) => {
            const d = r.data as DayLog & { sleepHours?: number };
            return (
              <li key={r.key} className="py-2">
                <p className="font-mono text-mc-link">{r.key}</p>
                <p className="text-mc-muted">
                  Sleep {d.sleep?.bed}–{d.sleep?.wake}
                  {typeof d.sleepHours === "number" ? ` (${d.sleepHours.toFixed(1)} h)` : ""} · {d.sleep?.source}
                </p>
                <p className="text-mc-muted">
                  Exercise: {(d.exercise ?? []).map((s) => `${s.type} ${s.minutes} min at ${s.at}`).join(", ") || "none"}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`Injuries & body-map reports (${injuries.length})`}>
        {injuries.length === 0 && <p className="text-sm text-mc-label">None reported.</p>}
        <ul className="flex flex-col gap-3">
          {injuries.map((i) => (
            <li key={i.id} className="rounded-md border border-mc-line px-3 py-2 text-xs">
              <p className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {INJURY_TYPES[i.type]?.icon} {INJURY_TYPES[i.type]?.label ?? i.type}
                </span>
                <span className="text-mc-label">{i.area}</span>
                <span className="ml-auto">
                  <LevelPill level={injuryLevel(i)}>{i.healed ? "Healed" : "Open"}</LevelPill>
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {i.updates.map((u, k) => (
                  <li key={k} className="flex gap-3">
                    {u.photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- small data-URL photo from the device
                      <img src={u.photo} alt="Injury photo" className="h-12 w-12 rounded object-cover" />
                    )}
                    <span className="text-mc-muted">
                      {fmt(new Date(u.at).toISOString())} · pain {u.pain}/10{u.note ? ` · ${u.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Period log">
        {!cycle || (!cycle.days.length && !cycle.suppressed) ? (
          <p className="text-sm text-mc-label">None reported.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-mc-muted">{cycle.suppressed ? "On hormonal suppression." : "Not suppressed."}</p>
            <ul className="divide-y divide-mc-line text-xs">
              {[...cycle.days]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((d) => (
                  <li key={d.date} className="py-1.5 text-mc-muted">
                    <span className="font-mono text-mc-link">{d.date}</span> · {d.flow} flow · pain {d.pain}/10
                    {d.symptoms.length ? ` · ${d.symptoms.join(", ")}` : ""}
                  </li>
                ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function Transcript({ memberId, name }: { memberId: string; name: string }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatRow[] | null>(null);
  // The search the shown messages answer; lags `query` while a new search is in flight.
  const [shownQuery, setShownQuery] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/oversight/members/${memberId}/chat?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load conversations (${r.status})`))))
        .then((d: { messages: ChatRow[]; query: string }) => {
          setMessages(d.messages);
          setShownQuery(d.query);
          setError("");
        })
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [memberId, query]);

  useEffect(() => {
    if (!query) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, query]);

  const highlight = (text: string) => {
    if (!shownQuery) return text;
    const parts = text.split(new RegExp(`(${shownQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((p, i) =>
      p.toLowerCase() === shownQuery.toLowerCase() ? (
        <mark key={i} className="rounded bg-mc-amber/30 px-0.5 text-foreground">
          {p}
        </mark>
      ) : (
        p
      )
    );
  };

  let lastDay = "";
  return (
    <Card
      title={`${name}'s AI co-pilot conversations`}
      action={
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages…"
          aria-label="Search conversations"
          className="min-h-9 w-64 max-w-full rounded-md border border-mc-line-strong bg-mc-inset px-3 text-sm placeholder:text-mc-label focus:border-mc-select focus:outline-none"
        />
      }
    >
      {error && <p className="text-sm text-mc-red">{error}</p>}
      {messages && (
        <p className="mb-3 text-xs text-mc-label">
          {messages.length} message{messages.length === 1 ? "" : "s"}
          {shownQuery ? ` matching “${shownQuery}”` : ""}, oldest first.
        </p>
      )}
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
        {messages?.length === 0 && <p className="text-sm text-mc-label">{shownQuery ? "No matches." : "No conversations yet."}</p>}
        {messages?.map((m) => {
          const day = new Date(m.createdAt).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="my-2 text-center font-mono text-[11px] text-mc-label">{new Date(m.createdAt).toLocaleDateString()}</p>}
              <div className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "USER"
                      ? "rounded-br-md border border-mc-select bg-mc-select text-mc-on-select"
                      : "rounded-bl-md border border-mc-line bg-mc-raised text-foreground"
                  }`}
                >
                  <p className="mb-1 flex gap-2 font-mono text-[10px] text-mc-label">
                    <span>{m.role === "USER" ? name : "Co-pilot"}</span>
                    <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                    {m.role === "ASSISTANT" && <span>{m.mode === "WEBLLM" ? "on-device AI" : "basic mode"}</span>}
                  </p>
                  <p className="whitespace-pre-wrap">{highlight(m.content)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
    </Card>
  );
}
