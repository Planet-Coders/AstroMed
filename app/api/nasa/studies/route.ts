import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadNasaStudies } from "@/lib/osdrStore";

/** Cached GeneLab / OSDR studies for the signed-in crew console. Does not call NASA. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await loadNasaStudies();
  return NextResponse.json(data);
}
