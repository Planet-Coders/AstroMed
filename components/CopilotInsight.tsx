"use client";

import { useEffect, useRef, useState } from "react";
import { useCopilot } from "./CopilotProvider";
import type { Insight, InsightSnapshot } from "@/lib/copilotInsight";

const timestamp = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Props = { snapshot: InsightSnapshot; label: string };

export function CopilotInsight({ snapshot, label }: Props) {
  return <InsightRequest key={JSON.stringify(snapshot)} snapshot={snapshot} label={label} />;
}

function InsightRequest({ snapshot, label }: Props) {
  const { explain, engineStatus } = useCopilot();
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function showExplanation() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await explain(snapshot, controller.signal);
      if (!controller.signal.aborted && result) setInsight(result);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="mt-3 rounded-md border border-mc-line bg-mc-inset px-3 py-2.5" aria-label="Co-pilot explanation">
      {(!insight || (insight.mode === "basic" && engineStatus === "ready")) && (
        <button
          type="button"
          onClick={() => void showExplanation()}
          disabled={busy}
          className="min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-semibold text-mc-link hover:bg-mc-raised disabled:opacity-50"
        >
          {insight ? "Try on-device model" : label}
        </button>
      )}
      {busy && <p className="mt-1 text-xs text-mc-muted" role="status">Preparing explanation…</p>}
      {insight && (
        <div
          className="flex flex-col gap-2 text-sm leading-relaxed text-mc-soft"
          aria-live="polite"
          data-insight-mode={insight.mode}
          data-insight-duration-ms={insight.durationMs}
        >
          <p className="mc-label">{insight.mode === "webllm" ? "On-device co-pilot" : "Basic guidance"}</p>
          <p><strong>{insight.finding.title}</strong> · {insight.finding.detail}</p>
          {insight.comparison && (
            <p>
              <strong>{insight.comparison.label}</strong> · {insight.comparison.text}
              {insight.comparison.at != null && ` · ${timestamp(insight.comparison.at)}`}
            </p>
          )}
          <p><strong>Suggested follow-up</strong> · {insight.followUp}</p>
          {insight.evidence && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-mc-link">NASA research context</summary>
              <p className="mt-1">{insight.evidence.finding} {insight.evidence.limit}</p>
              <a href={insight.evidence.url} target="_blank" rel="noreferrer" className="text-mc-link underline">
                {insight.evidence.id} · {insight.evidence.title}
              </a>
            </details>
          )}
          <p className="text-xs text-mc-label">
            {snapshot.source} · {snapshot.source === "Daily Check" ? "saved" : "alert updated"} {timestamp(snapshot.asOf)}
            {snapshot.lastReportAt != null && ` · latest report ${timestamp(snapshot.lastReportAt)}`}
          </p>
        </div>
      )}
    </section>
  );
}
