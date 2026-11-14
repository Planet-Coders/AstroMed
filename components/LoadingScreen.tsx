import { AahmsMark } from "@/components/AahmsMark";
import { LOADING_IMAGE, localUrl } from "@/lib/nasaImages";

/**
 * Full-screen loading state: the AAHMS mark breathing inside a spinning
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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#02040b] transition-opacity duration-500 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* NASA Image and Video Library: Viking view of Mars, slowly drifting behind the mark */}
      <div
        className="kenburns absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${localUrl(LOADING_IMAGE.nasaId)})`, backgroundPosition: LOADING_IMAGE.focus }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(2,4,11,0.35)_0%,rgba(2,4,11,0.85)_60%,#02040b_100%)]" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(11,61,145,0.3),transparent_55%)]" aria-hidden />
      <div className="relative h-52 w-52">
        {/* Orbit ring with a satellite riding it */}
        <div className="orbit-spin absolute -inset-6 rounded-full border border-sky-300/20" aria-hidden>
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200 shadow-[0_0_12px_4px_rgba(125,211,252,0.7)]" />
        </div>
        <AahmsMark className="logo-breathe absolute inset-0 h-full w-full" />
      </div>
      <div className="relative flex flex-col items-center gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-sky-100/80">{label}</p>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-sky-300 to-transparent" />
        </div>
      </div>
      <p className="absolute bottom-4 right-6 font-mono text-[11px] text-white/75">Image: NASA/JPL · Viking, Mars</p>
    </div>
  );
}
