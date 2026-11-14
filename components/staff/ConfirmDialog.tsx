"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * In-page confirmation dialog for the ground consoles, in the Mission Console style.
 * Replaces window.confirm / prompt, which look out of place and are blocked in some
 * embedded browsers. `ask` resolves true when confirmed, false when cancelled.
 */

type Ask = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** When set, the confirm button stays off until this exact text is typed. */
  typeToConfirm?: string;
};

const ConfirmContext = createContext<((a: Ask) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm requires ConfirmProvider");
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback(
    (a: Ask) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setOpen({ ...a, resolve });
      }),
    []
  );

  const close = useCallback(
    (ok: boolean) => {
      open?.resolve(ok);
      setOpen(null);
    },
    [open]
  );

  useEffect(() => {
    if (!open) return;
    (open.typeToConfirm ? inputRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const blocked = !!open?.typeToConfirm && typed.trim().toLowerCase() !== open.typeToConfirm.toLowerCase();

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className={`w-full max-w-md rounded-lg border bg-mc-panel px-6 py-5 shadow-2xl shadow-black/60 ${
              open.danger ? "border-mc-red/60" : "border-mc-line-strong"
            }`}
          >
            <h2 id="confirm-title" className={`text-[15px] font-semibold ${open.danger ? "text-mc-red" : "text-foreground"}`}>
              {open.title}
            </h2>
            <div className="mt-2 text-sm leading-relaxed text-mc-muted">{open.body}</div>
            {open.typeToConfirm && (
              <label className="mt-4 flex flex-col gap-1.5 text-xs text-mc-label">
                Type <span className="font-mono text-foreground">{open.typeToConfirm}</span> to confirm
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !blocked) close(true);
                  }}
                  aria-label="Confirmation text"
                  className="min-h-10 rounded-md border border-mc-line-strong bg-mc-inset px-3 font-mono text-sm text-foreground focus:border-mc-select focus:outline-none"
                />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="min-h-9 rounded-md border border-mc-line-strong px-4 text-xs font-medium text-mc-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                disabled={blocked}
                onClick={() => close(true)}
                className={`min-h-9 rounded-md px-4 text-xs font-semibold text-white disabled:opacity-40 ${
                  open.danger ? "bg-mc-red/80 hover:bg-mc-red" : "bg-mc-nasa hover:bg-mc-nasa-edge"
                }`}
              >
                {open.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
