import type { MetricId } from "@/lib/monitoring/catalog";
import type { DailyPoint, MissingStatus, Rule, Trend } from "@/lib/monitoring/engine";

/** JSON shape of /api/monitoring/me and /api/oversight/members/[id]/monitoring. */
export type AlertNoteView = {
  id: string;
  authorName: string;
  authorRole: string;
  action: string;
  text: string;
  createdAt: string;
};

export type AlertView = {
  id: string;
  ruleId: string;
  metric: MetricId;
  level: "YELLOW" | "RED";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  value: number | null;
  threshold: number | null;
  explanation: string;
  openedAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: AlertNoteView[];
};

export type MonitoringData = {
  now: number;
  days: number;
  rules: Rule[];
  metrics: { id: MetricId; series: DailyPoint[]; missing: MissingStatus; trend: Trend }[];
  alerts: AlertView[];
};
