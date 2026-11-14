"use client";

import { useEffect, useState } from "react";
import { getAllVitals, type VitalRecord } from "@/lib/db";
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

  return (
    <Card title="Store-and-forward queue">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-mc-muted">
          {pending.length} pending · {rows.length} total in IndexedDB
        </p>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={isSyncing}
          className="rounded bg-mc-select px-3 py-1 text-xs text-mc-on-select disabled:opacity-50"
        >
          {isSyncing ? "Syncing…" : "Sync to Earth"}
        </button>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-mc-label">
            <tr>
              <th className="pb-2">Time</th>
              <th className="pb-2">HR</th>
              <th className="pb-2">SpO₂</th>
              <th className="pb-2">Synced</th>
            </tr>
          </thead>
          <tbody className="font-mono text-foreground">
            {rows.slice(0, 50).map((r) => (
              <tr key={r.id} className="border-t border-mc-line">
                <td className="py-1.5">
                  {new Date(r.timestamp).toISOString().slice(11, 19)}
                </td>
                <td className="py-1.5">{r.heartRate}</td>
                <td className="py-1.5">{r.spo2}</td>
                <td className="py-1.5">
                  {r.synced ? (
                    <span className="text-mc-green">✓</span>
                  ) : (
                    <span className="text-amber-400">queued</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
