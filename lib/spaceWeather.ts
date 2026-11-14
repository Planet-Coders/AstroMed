/**
 * Live space weather for the radiation hazard.
 *
 * Primary feed: NOAA Space Weather Prediction Center (SWPC) JSON, no key needed,
 * fast and built for operational traffic. Secondary: NASA DONKI solar flare and
 * solar energetic particle (SEP) event lists, best effort, because DONKI often
 * returns 503s on the developer tier. Results are cached on the server for a few
 * minutes. If NOAA can't be reached, the last good reading is returned; if there
 * has never been one, a real NOAA reading saved in lib/data/space-weather-snapshot.json
 * is shown as demo data (clearly labelled) so the console never breaks mid-demo.
 *
 * GOES satellites sit near Earth; we use them as the reference for the solar
 * environment the transit vehicle is flying through.
 */

import type { RiskLevel } from "@/lib/risk";
import snapshot from "@/lib/data/space-weather-snapshot.json";

export type SpaceWeather = {
  fetchedAt: string;
  /** live: just fetched · cached: last good reading · demo: the saved dataset, NOAA unreachable. */
  source: "live" | "cached" | "demo";
  /** NOAA scales now: R = radio blackout (flares), S = solar radiation storm, G = geomagnetic storm. */
  scales: { R: number; S: number; G: number };
  /** Probabilities for today (%), from NOAA's forecast. */
  forecast: { flareMinor: number | null; flareMajor: number | null; radiationStorm: number | null };
  protons10MeV: number | null; // particle flux units (pfu)
  xray: { flux: number | null; flareClass: string | null };
  kp: number | null;
  alerts: { issued: string; title: string }[];
  donki: { flares30d: number; sep30d: number; latestFlare: string | null; latestSep: string | null } | null;
  level: RiskLevel;
  headline: string;
  advice: string;
};

const NOAA = "https://services.swpc.noaa.gov";
const TTL_MS = 5 * 60_000;

let cache: { at: number; data: SpaceWeather } | null = null;

async function getJson<T>(url: string, timeoutMs = 4000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** GOES 0.1-0.8 nm flux (W/m²) → flare class, e.g. 2.4e-7 → "B2.4". */
export function flareClass(flux: number): string {
  const classes: [string, number][] = [["X", 1e-4], ["M", 1e-5], ["C", 1e-6], ["B", 1e-7], ["A", 1e-8]];
  for (const [c, base] of classes) if (flux >= base) return `${c}${(flux / base).toFixed(1)}`;
  return "A0.0";
}

/** NOAA S-scale from ≥10 MeV proton flux: S1 ≥ 10 pfu … S5 ≥ 100 000 pfu. */
export function sScaleFromProtons(pfu: number): number {
  return pfu >= 1e5 ? 5 : pfu >= 1e4 ? 4 : pfu >= 1e3 ? 3 : pfu >= 1e2 ? 2 : pfu >= 10 ? 1 : 0;
}

function assess(s: number, r: number, flareMajor: number | null): Pick<SpaceWeather, "level" | "headline" | "advice"> {
  if (s >= 3)
    return {
      level: "RED",
      headline: `S${s} solar radiation storm in progress`,
      advice: "Go to the storm shelter now and stay until the all-clear. Postpone EVA and work in lightly shielded modules.",
    };
  if (s >= 1)
    return {
      level: "YELLOW",
      headline: `S${s} solar radiation storm`,
      advice: "Elevated proton flux. Wear dosimeters, limit time in lightly shielded modules and have the shelter ready.",
    };
  if (r >= 3 || (flareMajor ?? 0) >= 25)
    return {
      level: "YELLOW",
      headline: r >= 3 ? `R${r} flare activity` : `${flareMajor}% chance of a major flare today`,
      advice: "Large flares can be followed by particle storms within hours. Review shelter procedures and keep EVA flexible.",
    };
  return {
    level: "GREEN",
    headline: "Quiet Sun",
    advice: "No solar radiation storm. Background galactic cosmic radiation only.",
  };
}

// DONKI changes slowly and is often down, so remember its answer (or its failure) for longer
// than the NOAA cache; otherwise every refresh would wait on its timeout.
let donkiCache: { at: number; data: SpaceWeather["donki"] } | null = null;
const DONKI_TTL_MS = 30 * 60_000;
const DONKI_FAIL_TTL_MS = 10 * 60_000;

async function loadDonki(): Promise<SpaceWeather["donki"]> {
  if (donkiCache && Date.now() - donkiCache.at < (donkiCache.data ? DONKI_TTL_MS : DONKI_FAIL_TTL_MS)) {
    return donkiCache.data;
  }
  const data = await fetchDonki();
  donkiCache = { at: Date.now(), data };
  return data;
}

async function fetchDonki(): Promise<SpaceWeather["donki"]> {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  const q = `startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}&api_key=${key}`;
  try {
    const [flr, sep] = await Promise.all([
      getJson<{ classType?: string; peakTime?: string }[]>(`https://api.nasa.gov/DONKI/FLR?${q}`, 2500),
      getJson<{ eventTime?: string }[]>(`https://api.nasa.gov/DONKI/SEP?${q}`, 2500),
    ]);
    const lastF = flr.at(-1);
    const lastS = sep.at(-1);
    return {
      flares30d: flr.length,
      sep30d: sep.length,
      latestFlare: lastF ? `${lastF.classType ?? "?"} at ${lastF.peakTime ?? "?"}` : null,
      latestSep: lastS?.eventTime ?? null,
    };
  } catch {
    return null; // DONKI is often 503 on the developer tier; NOAA carries the alerting.
  }
}

async function loadLive(): Promise<SpaceWeather> {
  type Scale = { Scale: string | null; MinorProb?: string | null; MajorProb?: string | null; Prob?: string | null };
  type Scales = Record<string, { R: Scale; S: Scale; G: Scale }>;
  type Goes = { time_tag: string; flux: number; energy: string }[];

  const [scales, protons, xrays, kp, alerts, donki] = await Promise.all([
    getJson<Scales>(`${NOAA}/products/noaa-scales.json`),
    getJson<Goes>(`${NOAA}/json/goes/primary/integral-protons-6-hour.json`).catch(() => null),
    getJson<Goes>(`${NOAA}/json/goes/primary/xrays-6-hour.json`).catch(() => null),
    getJson<{ kp_index: number }[]>(`${NOAA}/json/planetary_k_index_1m.json`).catch(() => null),
    getJson<{ issue_datetime: string; message: string }[]>(`${NOAA}/products/alerts.json`).catch(() => null),
    loadDonki(),
  ]);

  const now = scales["0"];
  const today = scales["1"];
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

  const p10 = protons?.filter((p) => p.energy === ">=10 MeV").at(-1)?.flux ?? null;
  const xr = xrays?.filter((x) => x.energy === "0.1-0.8nm").at(-1)?.flux ?? null;
  // Use whichever is worse: NOAA's official S-scale or the one implied by the latest proton flux.
  const s = Math.max(num(now?.S.Scale) ?? 0, p10 != null ? sScaleFromProtons(p10) : 0);
  const r = num(now?.R.Scale) ?? 0;
  const g = num(now?.G.Scale) ?? 0;
  const flareMajor = num(today?.R.MajorProb);

  return {
    fetchedAt: new Date().toISOString(),
    source: "live",
    scales: { R: r, S: s, G: g },
    forecast: { flareMinor: num(today?.R.MinorProb), flareMajor, radiationStorm: num(today?.S.Prob) },
    protons10MeV: p10,
    xray: { flux: xr, flareClass: xr != null ? flareClass(xr) : null },
    kp: kp?.at(-1)?.kp_index ?? null,
    alerts: (alerts ?? []).slice(0, 3).map((a) => ({
      issued: a.issue_datetime,
      title:
        a.message
          .split(/\r?\n/)
          .find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT|EXTENDED WARNING|CANCEL)/.test(l.trim()))
          ?.trim() ?? "Space weather message",
    })),
    donki,
    ...assess(s, r, flareMajor),
  };
}

/** A real NOAA reading saved with the app, shown as demo data when the live feed can't be reached. */
export const DEMO_SPACE_WEATHER = { ...snapshot, source: "demo" } as SpaceWeather;

export async function getSpaceWeather(): Promise<SpaceWeather> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const data = await loadLive();
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // Keep the console working through outages and LOS: last good reading, else the saved demo dataset.
    return cache ? { ...cache.data, source: "cached" } : DEMO_SPACE_WEATHER;
  }
}
