import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OutboxChat } from "@/lib/db";

/**
 * Saves the signed-in user's co-pilot messages (both their questions and the replies) so
 * mission oversight can read them. Ids come from the device, so a retried batch is stored once.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(0, 100) as OutboxChat[];
  const valid = messages.filter(
    (m) =>
      typeof m.id === "string" &&
      m.id.length <= 64 &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      Number.isFinite(m.createdAt)
  );
  if (!valid.length) return NextResponse.json({ saved: [] });

  try {
    await prisma.chatMessage.createMany({
      data: valid.map((m) => ({
        id: m.id,
        userId: session.userId,
        role: m.role === "user" ? "USER" : "ASSISTANT",
        content: m.content.slice(0, 8000),
        mode: m.mode === "webllm" ? "WEBLLM" : "BASIC",
        createdAt: new Date(m.createdAt),
      })),
      skipDuplicates: true,
    });
  } catch {
    // Offline demo identity (no user row) or database down: the device keeps the queue.
    return NextResponse.json({ error: "Could not save messages" }, { status: 503 });
  }
  return NextResponse.json({ saved: valid.map((m) => m.id) });
}
