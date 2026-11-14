import { CircularProgress } from "./CircularProgress";

export function Gauge({
  value,
  max = 100,
  label,
  sublabel,
  size = 128,
}: {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const pct = (value / max) * 100;
  const progressClass =
    pct > 70
      ? "stroke-red-400"
      : pct > 40
        ? "stroke-amber-400"
        : "stroke-emerald-400";

  return (
    <div className="flex flex-col items-center gap-2">
      <CircularProgress
        size={size}
        strokeWidth={8}
        percent={pct}
        progressClassName={progressClass}
      >
        <div className="font-mono text-xl leading-none text-foreground">
          {value}
          <span className="text-sm text-mc-label">/{max}</span>
        </div>
        <div className="mt-1 max-w-[90px] text-[10px] leading-tight text-mc-muted">
          {label}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-[10px] text-mc-green">{sublabel}</div>
        )}
      </CircularProgress>
    </div>
  );
}
