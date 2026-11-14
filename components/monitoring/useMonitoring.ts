"use client";

import { useCallback, useEffect, useState } from "react";
import type { MonitoringData } from "./types";
import { HEALTH_REPORTS_SYNCED } from "@/lib/outbox";

/** Loads monitoring for the chosen range, with polling and refresh after a health report sync. */
export function useMonitoring(url: string) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      fetch(`${url}?days=${days}`)
        .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error ?? `Could not load (${r.status})`)))))
        .then((d: MonitoringData) => {
          if (!alive) return;
          setData(d);
          setError("");
        })
        .catch((e: Error) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    };
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener(HEALTH_REPORTS_SYNCED, reload);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener(HEALTH_REPORTS_SYNCED, reload);
    };
  }, [url, days, tick, reload]);

  return { data, days, setDays, reload, loading, error };
}
