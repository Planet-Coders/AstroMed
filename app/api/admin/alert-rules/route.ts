import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { loadRules } from "@/lib/monitoring/server";
import { DEFAULT_RULES, ruleKind } from "@/lib/monitoring/catalog";
import { bpRuleError } from "@/lib/selfCheckThresholds";

export async function GET() {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ rules: await loadRules(), defaults: DEFAULT_RULES });
}

/** Edits one rule: thresholds, window and on/off. The kind, metric and direction stay fixed. */
export async function PATCH(request: Request) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  await loadRules();
  const rule = await prisma.alertRule.findUnique({ where: { id: String(body.id ?? "") } });
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const amber = body.amber === undefined ? rule.amber : Number(body.amber);
  const red = body.red === undefined ? rule.red : Number(body.red);
  const windowDays = body.windowDays === undefined ? rule.windowDays : Number(body.windowDays);
  const enabled = body.enabled === undefined ? rule.enabled : body.enabled === true;
  if (!Number.isFinite(amber) || !Number.isFinite(red) || amber < 0 || red < 0) return badRequest("Thresholds must be numbers ≥ 0");
  if (rule.comparator === "above" ? red <= amber : red >= amber) {
    return badRequest(rule.comparator === "above" ? "Red must be higher than amber" : "Red must be lower than amber");
  }
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 30) return badRequest("Window must be 1–30 days");
  if (rule.kind !== "missing" && rule.kind !== "trend") {
    const bp = bpRuleError({ id: rule.id, metric: rule.metric, amber, red }, await prisma.alertRule.findMany({ select: { id: true, metric: true, amber: true, red: true } }));
    if (bp) return badRequest(bp);
  }

  const updated = await prisma.alertRule.update({
    where: { id: rule.id },
    data: { amber, red, windowDays, enabled, updatedBy: auth.user.name },
  });
  const changes = [
    amber !== rule.amber && `amber ${rule.amber} → ${amber}`,
    red !== rule.red && `red ${rule.red} → ${red}`,
    windowDays !== rule.windowDays && `window ${rule.windowDays} → ${windowDays} d`,
    enabled !== rule.enabled && (enabled ? "switched on" : "switched off"),
  ].filter(Boolean);
  if (changes.length) await audit(auth.user, "rule.update", { type: "rule", id: rule.id, label: `Alert rule: ${rule.label}` }, changes.join("; "));
  return NextResponse.json({ rule: { ...updated, kind: ruleKind(updated.id, updated.kind) } });
}
