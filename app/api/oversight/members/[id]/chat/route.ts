import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readableMember, requireRole } from "@/lib/authz";

type Ctx = { params: Promise<{ id: string }> };

/** An astronaut's AI co-pilot transcript, oldest first, optionally filtered by ?q=. */
export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireRole(["OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const member = await readableMember(auth.user, id);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  // Newest 2000, returned in time order.
  const messages = await prisma.chatMessage.findMany({
    where: { userId: id, ...(q ? { content: { contains: q, mode: "insensitive" as const } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { id: true, role: true, content: true, mode: true, createdAt: true },
  });
  return NextResponse.json({ messages: messages.reverse(), query: q });
}
