import type { ReactNode } from "react";

export type TabItem = { id: string; label: string; badge?: ReactNode };

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Workspace views"
      className="flex flex-wrap gap-1 self-start rounded-lg border border-mc-line bg-mc-panel p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
          className={`flex min-h-11 items-center gap-2 rounded-md px-4 text-[13px] font-medium transition ${
            active === tab.id
              ? "bg-mc-select text-mc-on-select"
              : "text-mc-muted hover:bg-mc-raised hover:text-foreground"
          }`}
        >
          {tab.label}
          {tab.badge != null && (
            <span className={`rounded px-1.5 font-mono text-[11px] ${active === tab.id ? "bg-black/10 text-mc-on-select" : "bg-mc-raised text-mc-link"}`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
