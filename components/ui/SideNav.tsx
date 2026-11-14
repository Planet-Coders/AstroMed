import type { ReactNode } from "react";
import type { TabItem } from "./TabBar";

/** Small line icons for each dashboard section, keyed by tab id. */
const ICONS: Record<string, ReactNode> = {
  telemetry: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  body: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v7m0 0-3 7m3-7 3 7M6 10l6-2 6 2" />
    </>
  ),
  check: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="m9 12 2 2 4-4M9 4V3h6v1" />
    </>
  ),
  monitoring: <path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-6" />,
  missions: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  habitat: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1" />
    </>
  ),
  pvt: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M10 2h4" />
    </>
  ),
  queue: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />,
};

function Icon({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[id] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

/**
 * Dashboard navigation: a vertical sidebar on large screens, a horizontally
 * scrollable strip on smaller ones so nothing overflows.
 */
export function SideNav({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav aria-label="Workspace views" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <ul className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-mc-line bg-mc-panel p-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:p-2">
        {tabs.map((tab) => {
          const on = active === tab.id;
          return (
            <li key={tab.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-[13px] font-medium transition ${
                  on
                    ? "bg-[#16223b] text-white lg:shadow-[inset_3px_0_0_0_var(--color-mc-nasa-edge)]"
                    : "text-mc-muted hover:bg-mc-raised hover:text-foreground"
                }`}
              >
                <Icon id={tab.id} />
                <span className="flex-1">{tab.label}</span>
                {tab.badge != null && (
                  <span className="rounded bg-[#13284d] px-1.5 font-mono text-[11px] text-mc-link">{tab.badge}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
