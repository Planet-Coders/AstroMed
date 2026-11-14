"use client";

import Link from "next/link";
import type { Role } from "@prisma/client";

const LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/admin", label: "Admin console", roles: ["SUPER_ADMIN"] },
  { href: "/oversight", label: "Crew oversight", roles: ["SUPER_ADMIN", "OVERSIGHT"] },
];

/** Header for the ground consoles (super admin and oversight), in the Mission Console style. */
export function StaffHeader({
  user,
  active,
  subtitle,
}: {
  user: { name: string; role: Role };
  active: "/admin" | "/oversight";
  subtitle: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-mc-line bg-mc-header px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        <svg width="32" height="32" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="16.5" fill="#0B3D91" stroke="#2A5BC0" />
          <ellipse cx="18" cy="18" rx="15" ry="6" fill="none" stroke="#FFFFFF" strokeOpacity=".55" transform="rotate(-24 18 18)" />
          <path d="M7 19h6l2-5 3 9 2.5-6H29" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <h1 className="text-[15px] font-bold tracking-[0.06em]">AAHMS</h1>
          <p className="text-[11px] text-mc-label">{subtitle}</p>
        </div>
      </div>

      <nav aria-label="Ground consoles" className="flex rounded-lg border border-mc-line-strong bg-mc-panel p-[3px]">
        {LINKS.filter((l) => l.roles.includes(user.role)).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active === l.href ? "page" : undefined}
            className={`flex min-h-8 items-center rounded-md px-3 text-xs ${
              active === l.href ? "bg-mc-nasa font-semibold text-white" : "font-medium text-mc-muted hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <div className="text-right text-xs leading-tight">
          <div className="font-medium">{user.name}</div>
          <div className="font-mono text-[11px] text-mc-label">{user.role === "SUPER_ADMIN" ? "SUPER ADMIN" : "OVERSIGHT"}</div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.assign("/login");
          }}
          className="min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-medium text-mc-muted hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
