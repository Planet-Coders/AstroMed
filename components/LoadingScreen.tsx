import { AstroMedMark } from "@/components/AstroMedMark";
import { LOADING_IMAGE, localUrl } from "@/lib/nasaImages";

/**
 * Full-screen loading state: the AstroMed mark breathing inside a spinning
 * orbit ring, with a status line and an indeterminate progress bar. Plain
 * markup + CSS so it can render on the server (route fallbacks) and the client.
 */
export function LoadingScreen({
  label = "Loading mission console",
  fading = false,
}: {
  label?: string;
  fading?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background transition-opacity duration-500 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* NASA Image and Video Library: Viking view of Mars, slowly drifting behind the mark */}
      <div
        className="kenburns absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: `url(${localUrl(LOADING_IMAGE.nasaId)})`, backgroundPosition: LOADING_IMAGE.focus }}
        aria-hidden
      />
      <div className="theme-loading-veil absolute inset-0" aria-hidden />
      <div className="theme-loading-glow absolute inset-0" aria-hidden />
      <div className="relative h-52 w-52">
        {/* Orbit ring with a satellite riding it */}
        <div className="orbit-spin absolute -inset-6 rounded-full border border-mc-cyan/40" aria-hidden>
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mc-cyan shadow-[0_0_12px_4px_rgba(196,146,10,0.45)]" />
        </div>
        <AstroMedMark className="logo-breathe absolute inset-0 h-full w-full" />
      </div>
      <div className="relative flex flex-col items-center gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-mc-muted">{label}</p>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-mc-line-strong">
          <div className="loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-mc-cyan to-transparent" />
        </div>
      </div>
      <p className="absolute bottom-4 right-6 font-mono text-[11px] text-mc-muted">Image: NASA/JPL · Viking, Mars</p>
    </div>
  );
}
