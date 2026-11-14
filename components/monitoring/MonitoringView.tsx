"use client";

import { AlertsPanel } from "./AlertsPanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { useMonitoring } from "./useMonitoring";

/** Time series or alerts for one crew member, from the given monitoring endpoint. */
export function MonitoringView({ url, show, canResolve }: { url: string; show: "series" | "alerts" | "both"; canResolve: boolean }) {
  const { data, setDays, reload, loading, error } = useMonitoring(url);
  if (error && !data) return <p className="text-sm text-mc-red">{error}</p>;
  if (!data) return <p className="text-sm text-mc-label">Loading monitoring data…</p>;
  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-xs text-mc-red">{error}</p>}
      {show !== "series" && (
        <section className="flex flex-col gap-2">
          {show === "both" && <h3 className="mc-label">Health alerts</h3>}
          <AlertsPanel alerts={data.alerts} rules={data.rules} canResolve={canResolve} onChanged={reload} />
        </section>
      )}
      {show !== "alerts" && (
        <section className="flex flex-col gap-2">
          {show === "both" && <h3 className="mc-label">Monitored metrics</h3>}
          <MonitoringPanel data={data} onDays={setDays} loading={loading} />
        </section>
      )}
    </div>
  );
}
