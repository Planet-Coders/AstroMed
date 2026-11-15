"use client";

import { useEffect, useState } from "react";

/** Unread Earth replies for the sidebar badge (astronauts only). Peeks, so nothing is marked read. */
export function useHotlineUnread(enabled: boolean, open: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/hotline?peek=1", { cache: "no-store" });
        if (r.ok && alive) setUnread(((await r.json()) as { unread: number }).unread);
      } catch {
        /* offline: keep the last count */
      }
    };
    void check();
    const id = setInterval(check, open ? 4000 : 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, open]);
  return enabled && !open ? unread : 0;
}
