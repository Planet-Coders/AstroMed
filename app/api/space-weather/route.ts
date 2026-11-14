import { NextResponse } from "next/server";
import { getSpaceWeather } from "@/lib/spaceWeather";

/** Public space-weather snapshot (NOAA SWPC + NASA DONKI), cached server-side for 5 minutes. */
export async function GET() {
  const data = await getSpaceWeather();
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=60" } });
}
