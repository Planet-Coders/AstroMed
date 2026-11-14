import { NextResponse } from "next/server";
import { getNasaImages } from "@/lib/nasaImages";

/** Public: curated NASA Image and Video Library photos, e.g. /api/nasa-images?set=login. */
export async function GET(request: Request) {
  const set = new URL(request.url).searchParams.get("set") === "loading" ? "loading" : "login";
  const images = await getNasaImages(set);
  return NextResponse.json({ images }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
