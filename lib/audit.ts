import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Records one super admin action. Never blocks the action itself if logging fails. */
export async function audit(
  actor: Pick<User, "id" | "name">,
  action: string,
  target: { type: "group" | "user" | "rule"; id?: string | null; label: string },
  detail?: string
) {
  await prisma.adminAuditLog
    .create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action,
        targetType: target.type,
        targetId: target.id ?? null,
        targetLabel: target.label,
        detail: detail ?? null,
      },
    })
    .catch((err) => console.warn("Audit log write failed:", err instanceof Error ? err.message : err));
}
