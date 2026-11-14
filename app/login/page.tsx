"use client";

import { useEffect, useRef, useState } from "react";
import { WarpScene } from "@/components/login/WarpScene";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AahmsMark } from "@/components/AahmsMark";
import { LOGIN_IMAGES, toImage, type NasaImage } from "@/lib/nasaImages";

const MISSION_EPOCH = Date.UTC(2026, 0, 15);
const LAUNCH_MS = 900;
const SLIDE_MS = 7000;
// Shown straight away; the server's /api/nasa-images answer adds titles and dates.
const INITIAL_SLIDES: NasaImage[] = LOGIN_IMAGES.map(toImage);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Mission elapsed time; renders a placeholder on the server so hydration matches. */
function MissionClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now == null) return <span>MET ---/--:--:--</span>;
  const s = Math.floor((now - MISSION_EPOCH) / 1000);
  return (
    <span>
      MET {String(Math.floor(s / 86400)).padStart(3, "0")}/{pad(Math.floor(s / 3600) % 24)}:
      {pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
    </span>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [booting, setBooting] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [slides, setSlides] = useState<NasaImage[]>(INITIAL_SLIDES);
  const [slide, setSlide] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Loading screen: hold until the hero photo is ready (or 1.6 s at most).
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setBooting(false);
    };
    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = INITIAL_SLIDES[0].url;
    const cap = setTimeout(finish, 1600);
    return () => clearTimeout(cap);
  }, []);

  // Real captions and dates from the NASA Image and Video Library.
  useEffect(() => {
    let alive = true;
    fetch("/api/nasa-images?set=login")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { images: NasaImage[] } | null) => {
        if (!alive || !d?.images?.length) return;
        // Keep our own file, focus and framing; take only the library's title and date.
        setSlides(
          INITIAL_SLIDES.map((s) => {
            const m = d.images.find((i) => i.nasaId === s.nasaId);
            return m ? { ...s, title: m.title, date: m.date, center: m.center } : s;
          }),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Slideshow: advance every few seconds (paused while the sign-in panel is open).
  useEffect(() => {
    if (panelOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setSlide((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [panelOpen, slides.length]);

  // Gentle parallax: the photo drifts against the stars.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, px = 0, py = 0, raf = 0;
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const loop = () => {
      tx += (px - tx) * 0.05;
      ty += (py - ty) * 0.05;
      hero.style.setProperty("--px", tx.toFixed(3));
      hero.style.setProperty("--py", ty.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    if (panelOpen) emailRef.current?.focus();
  }, [panelOpen]);

  async function signIn(body: Record<string, unknown>) {
    setLaunching(true);
    setError("");
    const minLaunch = new Promise((r) => setTimeout(r, LAUNCH_MS));
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        setLaunching(false);
        return;
      }
      const { home } = (await res.json().catch(() => ({}))) as { home?: string };
      await minLaunch;
      // Full navigation so the new session cookie is sent fresh; if the console
      // bounces back here, the page reloads instead of spinning forever.
      // Admin and oversight accounts land on their own consoles.
      window.location.assign(home === "/admin" || home === "/oversight" ? home : "/");
    } catch {
      setError("Cannot reach mission control. Check the dev server.");
      setLaunching(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void signIn({ email: email || "crew@aahms.demo", password: password || "demo" });
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-slate-400/60 transition focus:border-[#fc3d21]/70 focus:bg-white/10 focus:outline-none";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02040b] text-white">
      <WarpScene warp={launching} planet={false} heartbeat={false} cruise={0.35} />

      <div
        ref={heroRef}
        className="pointer-events-none fixed inset-0"
        style={{ "--px": 0, "--py": 0 } as React.CSSProperties}
      >
        {/* NASA Image and Video Library photos, cross-fading with a slow Ken Burns drift */}
        {slides.map((img, i) => (
          <div
            key={img.nasaId}
            className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
              i === slide && !launching ? "opacity-100" : "opacity-0"
            }`}
            style={img.frame ? { transform: `scale(${img.frame.scale})`, transformOrigin: img.frame.origin } : undefined}
            aria-hidden={i !== slide}
          >
            <img
              src={img.url}
              alt={img.title}
              loading={i === 0 ? "eager" : "lazy"}
              className={`h-full w-full object-cover ${i === slide ? "kenburns" : ""}`}
              style={{
                objectPosition: img.focus,
                translate: "calc(var(--px) * -12px) calc(var(--py) * -8px)",
              }}
            />
          </div>
        ))}
        {/* Darken for legibility: strong at the bottom-left text, lighter at the top */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,11,0.55)_0%,rgba(2,4,11,0.25)_35%,rgba(2,4,11,0.7)_75%,rgba(2,4,11,0.95)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_35%,rgba(2,4,11,0.6)_100%)]" />
      </div>

      {/* Top bar */}
      <header
        className={`fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5 transition-opacity duration-500 md:px-10 ${
          launching ? "opacity-0" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <AahmsMark className="h-11 w-11" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-white/70 sm:inline">
            AAHMS · Edge AI
          </span>
        </div>
        <div className="flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
          <span className="hidden md:inline">
            <MissionClock />
          </span>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="min-h-10 rounded-full border border-white/25 px-4 text-[11px] font-semibold tracking-[0.15em] text-white hover:border-white/60"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Slide navigation, like the reference's section dots */}
      <nav
        aria-label="Photos"
        className={`fixed right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-3 transition-opacity md:flex ${launching ? "opacity-0" : ""}`}
      >
        {slides.map((img, i) => (
          <button
            key={img.nasaId}
            type="button"
            onClick={() => setSlide(i)}
            aria-label={`Show photo: ${img.caption}`}
            aria-current={i === slide}
            className="flex h-6 w-6 items-center justify-center"
          >
            <span
              className={`rounded-full transition-all ${
                i === slide ? "h-3.5 w-3.5 border-2 border-white" : "h-1.5 w-1.5 bg-white/50 hover:bg-white"
              }`}
            />
          </button>
        ))}
      </nav>

      {/* Photo credit */}
      <p
        className={`pointer-events-none fixed bottom-3 left-4 right-4 z-10 text-center font-mono text-[11px] leading-relaxed text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)] transition-opacity md:bottom-5 md:left-auto md:right-6 md:max-w-sm md:text-right ${
          launching ? "opacity-0" : ""
        }`}
      >
        {slides[slide]?.caption}
        {slides[slide]?.date ? ` · ${slides[slide].date.slice(0, 4)}` : ""}
        <br />
        Image: NASA Image and Video Library · {slides[slide]?.nasaId}
      </p>

      {/* Editorial headline */}
      <main
        className={`relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center transition-all duration-700 ${
          launching ? "scale-110 opacity-0" : ""
        } ${panelOpen ? "md:-translate-x-[12vw]" : ""}`}
      >
        {!booting && (
          <>
            <p className="hero-in font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 sm:tracking-[0.35em]">
              Mars transit · Crew health · 2026
            </p>
            <h1 className="mt-4 leading-none">
              <span className="hero-in block font-display text-[clamp(2.4rem,6vw,4.8rem)] italic [animation-delay:120ms]">
                <span className="text-[#fc3d21]">Healthy</span> <span className="whitespace-nowrap text-white">all the way to</span>
              </span>
              <span className="hero-in -mt-2 block text-[clamp(5rem,19vw,15rem)] font-black tracking-tight text-white [animation-delay:220ms] [text-shadow:0_0_40px_rgba(255,255,255,0.35),0_0_120px_rgba(125,180,255,0.35)]">
                MARS
              </span>
            </h1>
            <div className="hero-in mt-6 flex w-full max-w-5xl flex-col items-center justify-between gap-6 text-left [animation-delay:380ms] md:flex-row md:items-end">
              <p className="max-w-md text-[13px] leading-relaxed text-white/75">
                Twenty light-minutes from Earth, there is no ground surgeon on call. AAHMS watches every heartbeat,
                breath and dose on board, and an on-device AI co-pilot answers the crew even when the link to Earth is down.
              </p>
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="group flex min-h-11 items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-white"
              >
                Take a small step
                <span className="h-px w-10 bg-white transition-all group-hover:w-16" />
              </button>
            </div>
          </>
        )}
      </main>

      {/* Sign-in panel slides in from the right */}
      <aside
        aria-hidden={!panelOpen}
        className={`fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col justify-center border-l border-white/10 bg-[#050913] p-8 md:bg-[#050913]/90 shadow-[-30px_0_80px_rgba(0,0,0,0.6)] transition-transform duration-500 ease-out md:p-12 ${
          panelOpen && !launching ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          aria-label="Close sign in"
          tabIndex={panelOpen ? 0 : -1}
          className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 hover:text-white"
        >
          ✕
        </button>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-[#fc3d21]">Crew access</p>
        <h2 className="mt-3 font-display text-4xl italic">
          Welcome <span className="text-white/60">aboard</span>
        </h2>
        <p className="mt-2 text-sm text-white/60">Sign in to the mission console.</p>

        <form onSubmit={onSubmit} className="mt-8">
          {error && <p className="mb-4 text-sm text-red-300">{error}</p>}
          <label className="block text-xs text-white/70">
            Email
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@crew.space"
              tabIndex={panelOpen ? 0 : -1}
              className={inputClass}
            />
          </label>
          <label className="mt-4 block text-xs text-white/70">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="any password for crew in demo"
              tabIndex={panelOpen ? 0 : -1}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={launching}
            tabIndex={panelOpen ? 0 : -1}
            className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[#fc3d21] text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#ff5a3f] disabled:opacity-70"
          >
            {launching ? "Launching…" : "Launch console"}
          </button>
          <p className="mt-6 text-center text-[11px] text-white/40">Demo build · any crew email signs in · admin and oversight need their password</p>
        </form>
      </aside>

      {booting && <LoadingScreen label="Preparing mission" />}
      {launching && <LoadingScreen label="Entering mission console" />}
    </div>
  );
}
