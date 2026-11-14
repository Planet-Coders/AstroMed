"use client";

import { useEffect, useState } from "react";
import { DEMO_SPACE_WEATHER, type SpaceWeather } from "@/lib/spaceWeather";

const POLL_MS = 5 * 60_000;

// Shared across components so the console makes one request per poll, not one per card.
let latest: SpaceWeather | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(d: SpaceWeather) => void>();

function publish(d: SpaceWeather) {
  latest = d;
  listeners.forEach((l) => l(d));
}

async function refresh() {
  inflight ??= fetch("/api/space-weather")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SpaceWeather>;
    })
    .then(publish)
    .catch(() => {
      // Our own server is unreachable (offline, LOS): keep the last reading, else show the demo dataset.
      if (!latest) publish(DEMO_SPACE_WEATHER);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Live NOAA/NASA space weather, polled every 5 minutes; null until the first reading. */
export function useSpaceWeather(): SpaceWeather | null {
  const [data, setData] = useState<SpaceWeather | null>(latest);
  useEffect(() => {
    listeners.add(setData);
    if (!latest || latest.source === "demo" || Date.now() - Date.parse(latest.fetchedAt) > POLL_MS) void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      listeners.delete(setData);
      clearInterval(id);
    };
  }, []);
  return data;
}

/** One line for the co-pilot prompt. */
export function describeSpaceWeather(d: SpaceWeather | null): string {
  if (!d) return "Space weather: no live data yet.";
  const age =
    d.source === "live" ? "live" : d.source === "cached" ? "last known" : `demo data saved ${d.fetchedAt.slice(0, 10)}, live feed unavailable`;
  return `Space weather (NOAA, ${age}): ${d.headline}; S${d.scales.S} R${d.scales.R} G${d.scales.G}${
    d.protons10MeV != null ? `, >=10 MeV protons ${d.protons10MeV.toFixed(1)} pfu` : ""
  }${d.xray.flareClass ? `, X-ray ${d.xray.flareClass}` : ""}. Advice: ${d.advice}`;
}
