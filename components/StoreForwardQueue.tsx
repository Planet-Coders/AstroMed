"use client";

import { useEffect, useState } from "react";
import { deliveryState, getAllVitals, type VitalRecord } from "@/lib/db";
import { Card } from "./ui/Card";
import { useSync } from "./SyncContext";

export function StoreForwardQueue() {
  const [rows, setRows] = useState<VitalRecord[]>([]);
  const { syncNow, isSyncing } = useSync();

  useEffect(() => {
    const load = () => void getAllVitals().then(setRows);
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const pending = rows.filter((r) => !r.synced);
  const time = (ms: number) => new Date(ms).toISOString().slice(11, 19);

  return (
    <Card title="Store-and-forward queue">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-mc-muted">
          {pending.length} pending · {rows.length} total in IndexedDB
        </p>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={isSyncing || pending.length === 0}
          title={pending.length === 0 ? "Nothing waiting to send" : undefined}
          className="rounded bg-mc-select px-3 py-1 text-xs text-mc-on-select disabled:opacity-50"
        >
          {isSyncing ? "Syncing…" : "Sync to Earth"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-mc-label">
        <span className="text-amber-400">Queued</span> on this device · <span className="text-mc-link">✓ Sent</span> to Earth, no
        confirmation yet · <span className="text-mc-green">✓✓ Confirmed</span>: Earth received and stored it
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-mc-label">
            <tr>
              <th className="pb-2">Time</th>
              <th className="pb-2">HR</th>
              <th className="pb-2">SpO₂</th>
              <th className="pb-2">Delivery</th>
            </tr>
          </thead>
          <tbody className="font-mono text-foreground">
            {rows.slice(0, 50).map((r) => (
              <tr key={r.id} className="border-t border-mc-line">
                <td className="py-1.5">
                  {new Date(r.timestamp).toISOString().slice(11, 19)}
                </td>
                <td className="py-1.5">{Math.round(r.heartRate)}</td>
                <td className="py-1.5">{Math.round(r.spo2 * 10) / 10}%</td>
                <td className="py-1.5">
                  {(() => {
                    const st = deliveryState(r, isSyncing);
                    if (st === "confirmed")
                      return <span className="text-mc-green">✓✓ Confirmed by Earth{r.confirmedAt ? ` ${time(r.confirmedAt)}` : ""}</span>;
                    if (st === "sending") return <span className="text-mc-link">Sending…</span>;
                    if (st === "sent")
                      return <span className="text-mc-link">✓ Sent {r.sentAt ? time(r.sentAt) : ""} · awaiting confirmation</span>;
                    return <span className="text-amber-400">Queued</span>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
