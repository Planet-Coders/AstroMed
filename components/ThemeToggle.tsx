"use client";

import { useEffect, useState } from "react";

const KEY = "aahms_theme";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode can block storage; the choice still applies for this view.
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  return (
    <div
      className={`inline-flex rounded-md border border-mc-line-strong bg-mc-panel p-0.5 ${className}`}
      role="group"
      aria-label="Color theme"
    >
      {(["light", "dark"] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => {
            applyTheme(id);
            setTheme(id);
          }}
          className={`min-h-8 rounded px-2.5 text-[11px] font-semibold ${
            theme === id ? "bg-mc-select text-mc-on-select" : "text-mc-muted hover:text-foreground"
          }`}
        >
          {id === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
