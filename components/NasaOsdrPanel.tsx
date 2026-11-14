"use client";

import { Card } from "./ui/Card";
import { doseTone, exerciseTone, formatOsdrMean, hasBiomarkers, hrvTone, type OsdrStudy, type OsdrTone } from "@/lib/osdr";
import { useNasaStudies } from "@/lib/useNasaStudies";

const TONE: Record<OsdrTone, string> = {
  green: "text-mc-green",
  amber: "text-mc-amber",
  red: "text-mc-red",
};

export type NasaOsdrPanelProps = {
  name: string;
  hrv: number;
  exerciseMinutes: number;
  exerciseTarget: number;
  /** Cabin sensor dose rate in mSv/h. Never a value from an OSDR file. */
  doseRate: number;
};

function compared(props: NasaOsdrPanelProps, study: OsdrStudy): { label: string; value: string; tone: OsdrTone } {
  if (study.signal === "hrv") {
    const shown = Math.round(props.hrv);
    return { label: `Compared with ${props.name}’s HRV`, value: `${shown} ms`, tone: hrvTone(shown) };
  }
  if (study.signal === "exercise") {
    const pct = props.exerciseTarget > 0 ? Math.round((props.exerciseMinutes / props.exerciseTarget) * 100) : 0;
    return {
      label: `Compared with ${props.name}’s exercise`,
      value: `${props.exerciseMinutes}/${props.exerciseTarget} min (${pct}%)`,
      tone: exerciseTone(props.exerciseMinutes, props.exerciseTarget),
    };
  }
  return {
    label: "Compared with cabin dose rate",
    value: `${props.doseRate.toFixed(3)} mSv/h`,
    tone: doseTone(props.doseRate),
  };
}

function StudyColumn({ study, crew }: { study: OsdrStudy; crew: NasaOsdrPanelProps }) {
  const live = compared(crew, study);
  return (
    <article className="flex min-w-0 flex-col rounded-md border border-mc-line bg-mc-inset p-3">
      <p className="font-mono text-xs font-semibold text-foreground">{study.id}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-mc-label">{study.theme}</p>
      <h4 className="mt-2 text-sm font-semibold leading-snug text-foreground">{study.title}</h4>
      <div className="mt-3 rounded-md border border-mc-line bg-mc-panel px-3 py-2.5">
        <p className="text-[11px] font-medium text-mc-muted">{live.label}</p>
        <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${TONE[live.tone]}`}>{live.value}</p>
      </div>
      <details className="group mt-3 border-t border-mc-line pt-2">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-mc-muted hover:text-foreground">
          <span>
            Study details & transformed CSV
            {study.metrics.length > 0 && (
              <span className="font-normal text-mc-label"> · {study.metrics.length} means</span>
            )}
          </span>
          <span className="shrink-0 transition group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="mt-2 space-y-3 pb-1">
          <p className="text-xs leading-relaxed text-mc-soft">{study.note}</p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mc-label">Transformed CSV</p>
            {study.metrics.length ? (
              <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto text-xs leading-relaxed text-mc-soft">
                {study.metrics.map((metric) => (
                  <li key={`${metric.fileName}-${metric.group}-${metric.biomarkerId}`}>
                    {metric.group}: {metric.label} {formatOsdrMean(metric.mean)}
                    {metric.unit ? ` ${metric.unit}` : ""} · n={metric.n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-mc-label">No group means in the transformed file.</p>
            )}
          </div>
          <footer className="border-t border-mc-line pt-2 text-[11px] leading-relaxed text-mc-label">
            <p>
              {study.organism} · {study.mission}
            </p>
            <ul className="mt-1 space-y-0.5">
              {study.files.map((file) => (
                <li key={file.name} className="truncate">
                  {file.url ? (
                    <a href={file.url} target="_blank" rel="noreferrer" className="text-mc-link hover:underline">
                      {file.name}
                    </a>
                  ) : (
                    file.name
                  )}
                </li>
              ))}
            </ul>
            <a
              href={study.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-mc-link hover:underline"
            >
              OSDR study page
            </a>
          </footer>
        </div>
      </details>
    </article>
  );
}

/** Three open NASA studies beside one crew member’s live console readings. */
export function NasaOsdrPanel(props: NasaOsdrPanelProps) {
  const { data, error, loading } = useNasaStudies();
  const active = data ? hasBiomarkers(data.studies) : false;

  return (
    <Card
      title={
        <span className="text-sm font-semibold normal-case tracking-normal text-foreground">NASA OSDR research</span>
      }
      action={
        data ? (
          <span className="flex flex-wrap justify-end gap-1.5">
            {active && (
              <span className="rounded border border-mc-green/40 bg-mc-green/10 px-2 py-1 text-[11px] font-semibold text-mc-green">
                AI Co-pilot Knowledge Base Active
              </span>
            )}
            <span className="rounded border border-mc-line bg-mc-inset px-2 py-1 text-[11px] font-semibold text-mc-soft">
              {data.source === "database" ? "Local baseline" : "Stored snapshot"}
            </span>
          </span>
        ) : null
      }
    >
      <p className="text-sm leading-relaxed text-mc-soft">
        Three open NASA GeneLab / OSDR spaceflight studies, cached on this server, set next to {props.name}’s live console
        readings. The comparison is a demo analog. It is not a medical reading and not a claim that the crew sample matches
        the mouse assay.
      </p>
      {loading && <p className="mt-4 text-sm text-mc-label">Loading study baselines…</p>}
      {error && <p className="mt-4 text-sm text-mc-red">OSDR baselines could not be loaded.</p>}
      {data && (
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
          {data.studies.map((study) => (
            <StudyColumn key={study.id} study={study} crew={props} />
          ))}
        </div>
      )}
    </Card>
  );
}
