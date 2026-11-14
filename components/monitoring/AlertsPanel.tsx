"use client";

import { useState } from "react";
import { METRIC, formatValue } from "@/lib/monitoring/catalog";
import type { Rule } from "@/lib/monitoring/engine";
import { ruleText } from "./MonitoringPanel";
import type { AlertView } from "./types";

const STATUS: Record<AlertView["status"], string> = {
  OPEN: "border-mc-red/60 bg-mc-red/10 text-mc-red",
  ACKNOWLEDGED: "border-mc-amber/50 text-mc-amber",
  RESOLVED: "border-mc-green/40 text-mc-green",
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function measured(a: AlertView, rule?: Rule) {
  if (a.value == null) return "—";
  if (rule?.kind === "missing") return `${a.value} h since the last value`;
  if (rule?.kind === "trend") return `${a.value > 0 ? "+" : ""}${a.value}% change`;
  return formatValue(a.metric, a.value);
}

function limit(a: AlertView, rule?: Rule) {
  if (a.threshold == null) return "—";
  if (rule?.kind === "missing") return `${a.threshold} h`;
  if (rule?.kind === "trend") return `${a.threshold}%`;
  return formatValue(a.metric, a.threshold);
}

/**
 * Alerts for one crew member: open → acknowledged → resolved, with a "why" panel and a
 * note thread. Crew can note and acknowledge; oversight can also resolve.
 */
export function AlertsPanel({
  alerts,
  rules,
  canResolve,
  onChanged,
}: {
  alerts: AlertView[];
  rules: Rule[];
  canResolve: boolean;
  onChanged: () => void;
}) {
  const [show, setShow] = useState<"active" | "resolved">("active");
  const list = alerts.filter((a) => (show === "active" ? a.status !== "RESOLVED" : a.status === "RESOLVED"));
  const activeCount = alerts.filter((a) => a.status !== "RESOLVED").length;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Alert status" className="flex self-start rounded-lg border border-mc-line-strong bg-mc-panel p-[3px]">
        {(
          [
            ["active", `Active (${activeCount})`],
            ["resolved", `Resolved (${alerts.length - activeCount})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setShow(id)}
            aria-pressed={show === id}
            className={`min-h-8 rounded-md px-3 text-xs ${show === id ? "bg-mc-select font-semibold text-mc-on-select" : "font-medium text-mc-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className="text-sm text-mc-label">{show === "active" ? "No active alerts. Everything monitored is within its rules." : "No alerts resolved in the last 30 days."}</p>
      )}
      {list.map((a) => (
        <AlertCard key={a.id} alert={a} rule={rules.find((r) => r.id === a.ruleId)} canResolve={canResolve} onChanged={onChanged} />
      ))}
    </div>
  );
}

function AlertCard({ alert: a, rule, canResolve, onChanged }: { alert: AlertView; rule?: Rule; canResolve: boolean; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const m = METRIC[a.metric];

  const act = async (action: "note" | "acknowledge" | "resolve") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/alerts/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setNote("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      data-alert={a.ruleId}
      className={`rounded-lg border bg-mc-panel px-4 py-3.5 ${a.status === "RESOLVED" ? "border-mc-line" : a.level === "RED" ? "border-mc-red/60" : "border-mc-amber/50"}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${a.level === "RED" ? "bg-mc-red" : "bg-mc-amber"}`} aria-hidden />
        <h4 className="text-sm font-semibold">{rule?.label ?? a.ruleId}</h4>
        <span className="text-xs text-mc-label">{m.label}</span>
        <span className={`ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${STATUS[a.status]}`} data-testid="alert-status">
          {a.status}
        </span>
      </header>
      <p className="mt-2 text-sm text-mc-soft">{a.explanation}</p>
      <p className="mt-1 text-[11px] text-mc-label">
        Opened {fmt(a.openedAt)}
        {a.acknowledgedBy && ` · acknowledged by ${a.acknowledgedBy}`}
        {a.resolvedBy && ` · resolved by ${a.resolvedBy}`}
      </p>

      <details className="group mt-3 rounded-md border border-mc-line bg-mc-inset px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-mc-link">
          Why this alerted <span className="inline-block transition group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-mc-label">Rule</dt>
          <dd className="text-mc-soft">
            {rule?.label ?? a.ruleId} ({rule?.kind ?? "rule"}) · {rule ? ruleText(rule) : "rule no longer exists"}
          </dd>
          <dt className="text-mc-label">Measured</dt>
          <dd className="font-mono text-mc-soft">{measured(a, rule)}</dd>
          <dt className="text-mc-label">Threshold crossed</dt>
          <dd className="font-mono text-mc-soft">
            {limit(a, rule)} ({a.level === "RED" ? "red" : "amber"})
          </dd>
          <dt className="text-mc-label">Why it matters</dt>
          <dd className="text-mc-muted">{m.rationale}</dd>
          <dt className="text-mc-label">Source</dt>
          <dd>
            {m.citations.slice(0, 2).map((c) => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="mr-3 text-mc-link underline-offset-2 hover:underline">
                {c.source} {c.id}
              </a>
            ))}
          </dd>
        </dl>
      </details>

      {a.notes.length > 0 && (
        <ol className="mt-3 space-y-1.5 border-l border-mc-line pl-3">
          {a.notes.map((n) => (
            <li key={n.id} className="text-[12px]">
              <span className="font-mono text-[10px] text-mc-label">{fmt(n.createdAt)}</span>{" "}
              <span className="font-medium text-mc-soft">{n.authorName}</span>{" "}
              <span className="text-mc-label">{n.action}</span>
              {n.text && <span className="text-mc-muted">: {n.text}</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={a.status === "RESOLVED" ? "Add a note to the record…" : "Note (what you did, what you saw)…"}
          aria-label={`Note on ${rule?.label ?? a.ruleId}`}
          className="w-full rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2 text-sm text-foreground placeholder:text-mc-label focus:border-mc-select focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {a.status === "OPEN" && (
            <button type="button" disabled={busy} onClick={() => void act("acknowledge")} className="min-h-9 rounded-md bg-mc-select px-3 text-xs font-semibold text-mc-on-select hover:bg-mc-soft disabled:opacity-50">
              Acknowledge
            </button>
          )}
          {canResolve && a.status !== "RESOLVED" && (
            <button type="button" disabled={busy} onClick={() => void act("resolve")} className="min-h-9 rounded-md border border-mc-green/50 px-3 text-xs font-semibold text-mc-green hover:bg-mc-green/10 disabled:opacity-50">
              Resolve
            </button>
          )}
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => void act("note")}
            className="min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-medium text-mc-muted hover:text-foreground disabled:opacity-40"
          >
            Add note
          </button>
        </div>
        {error && <p className="text-xs text-mc-red">{error}</p>}
      </div>
    </article>
  );
}
