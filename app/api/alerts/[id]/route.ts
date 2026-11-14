import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readableMember, requireRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ALERT_INCLUDE, logAlertWater } from "@/lib/monitoring/server";
import { str } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Acknowledge, resolve or add a note to an alert. The astronaut it belongs to may add notes
 * and acknowledge; oversight users of their group and super admins may also resolve.
 */
export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireRole(["ASTRONAUT", "OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const alert = await prisma.alert.findUnique({ where: { id }, include: { user: { select: { id: true, name: true } } } });
  const own = alert?.userId === user.id;
  const staff = !!alert && !own && user.role !== "ASTRONAUT" && !!(await readableMember(user, alert.userId));
  // Same answer for "not yours" and "doesn't exist", so alert ids can't be probed.
  if (!alert || (!own && !staff)) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (action === "log-water") {
    if (!own || user.role !== "ASTRONAUT" || alert.ruleId !== "hydration_low") {
      return NextResponse.json({ error: "Water can only be logged on your own low fluid intake alert" }, { status: 403 });
    }
    const { amountMl, entryId } = body;
    if (!Number.isInteger(amountMl) || amountMl < 1 || amountMl > 8000) return badRequest("Enter a whole amount from 1 to 8,000 mL");
    if (typeof entryId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(entryId)) {
      return badRequest("Invalid water entry ID");
    }
    const updated = await logAlertWater(user, id, amountMl, entryId);
    if (!updated) return NextResponse.json({ error: "This hydration alert is no longer active, or this entry was already used" }, { status: 409 });
    return NextResponse.json({ alert: updated });
  }
  const note = str(body?.note, 1000);
  if (!["note", "acknowledge", "resolve"].includes(action)) return badRequest("Unknown action");
  if (action === "note" && !note) return badRequest("Write a note first");
  if (action === "resolve" && !staff) {
    return NextResponse.json({ error: "Only mission oversight can resolve an alert" }, { status: 403 });
  }
  if (action !== "note" && alert.status === "RESOLVED") return badRequest("This alert is already resolved");
  if (action === "acknowledge" && alert.status === "ACKNOWLEDGED") return badRequest("Already acknowledged");

  const now = new Date();
  const who = `${user.name} (${user.role === "ASTRONAUT" ? "crew" : user.role === "OVERSIGHT" ? "oversight" : "super admin"})`;
  const updated = await prisma.alert.update({
    where: { id },
    data: {
      ...(action === "acknowledge" ? { status: "ACKNOWLEDGED" as const, acknowledgedAt: now, acknowledgedBy: who } : {}),
      ...(action === "resolve" ? { status: "RESOLVED" as const, resolvedAt: now, resolvedBy: who } : {}),
      notes: {
        create: {
          authorId: user.id,
          authorName: user.name,
          authorRole: user.role,
          action: action === "note" ? "note" : action === "acknowledge" ? "acknowledged" : "resolved",
          text: note || (action === "acknowledge" ? "Acknowledged." : "Resolved."),
        },
      },
    },
    include: ALERT_INCLUDE,
  });
  if (action !== "note") {
    await audit(user, `alert.${action}`, { type: "user", id: alert.userId, label: `${alert.user.name} · ${alert.ruleId}` }, note || undefined);
  }
  return NextResponse.json({ alert: updated });
}
