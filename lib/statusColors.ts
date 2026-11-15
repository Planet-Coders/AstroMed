import type { RiskLevel } from "@/lib/risk";

/**
 * One colour per status level, used by every status display (assessment, blood labs, header,
 * flags), so a WARNING looks the same wherever it appears.
 * GREEN = safe/nominal, YELLOW = caution, RED = warning.
 */
export const STATUS_TONE: Record<RiskLevel, { text: string; bg: string; border: string; dot: string }> = {
  GREEN: { text: "text-mc-green", bg: "bg-mc-green/10", border: "border-mc-green/30", dot: "bg-mc-green" },
  YELLOW: { text: "text-mc-amber", bg: "bg-mc-amber/10", border: "border-mc-amber/40", dot: "bg-mc-amber" },
  RED: { text: "text-mc-red", bg: "bg-mc-red/10", border: "border-mc-red/50", dot: "bg-mc-red" },
};
