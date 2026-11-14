"use client";

import { useEffect, useState } from "react";
import type { OsdrStudy } from "@/lib/osdr";

export type NasaStudiesPayload = {
  studies: OsdrStudy[];
  source: "database" | "snapshot";
};

let latest: NasaStudiesPayload | null = null;
let failed = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

async function refresh() {
  inflight ??= fetch("/api/nasa/studies")
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<NasaStudiesPayload>;
    })
    .then((data) => {
      latest = data;
      failed = false;
      publish();
    })
    .catch(() => {
      failed = latest == null;
      publish();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** One shared request for the research panel and the co-pilot. */
export function useNasaStudies() {
  const [data, setData] = useState<NasaStudiesPayload | null>(latest);
  const [error, setError] = useState(failed && latest == null);

  useEffect(() => {
    const sync = () => {
      setData(latest);
      setError(failed && latest == null);
    };
    listeners.add(sync);
    if (!latest) void refresh();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return { data, error, loading: !data && !error };
}
