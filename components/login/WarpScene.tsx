"use client";

import { useEffect, useRef } from "react";

/** Direction the scene's light comes from, shared with the login card's glass sheen. */
export const LIGHT_DIR = { x: 0.55, y: 0.35 };

/**
 * Login backdrop: flying through a 3D starfield toward Mars, with a crew
 * heartbeat trace pulsing across the horizon. Stars are plain points projected
 * from 3D (a few hundred per frame), the planet and heartbeat are CSS/SVG, so
 * it stays light. The pointer steers the vanishing point; `warp` engages
 * hyperspace for the sign-in transition. Holds still for prefers-reduced-motion.
 */
export function WarpScene({
  warp = false,
  planet = true,
  heartbeat = true,
  cruise = 1.2,
}: {
  warp?: boolean;
  planet?: boolean;
  heartbeat?: boolean;
  /** Base forward speed when idle. */
  cruise?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warpRef = useRef(warp);
  const cruiseRef = useRef(cruise);

  useEffect(() => {
    warpRef.current = warp;
    cruiseRef.current = cruise;
  }, [warp, cruise]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const COUNT = 520;
    const DEPTH = 1000;
    const stars = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * DEPTH,
      pz: 0,
      tint: Math.random() < 0.12 ? "#c4920a" : Math.random() < 0.2 ? "#8a6a10" : "#5c5346",
    }));
    stars.forEach((s) => (s.pz = s.z));

    let w = 0, h = 0, raf = 0, last = 0;
    let px = 0, py = 0, cx = 0, cy = 0, speed = 1.2;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 30) return; // ~30 fps is smooth enough here and halves the cost
      last = now;

      const target = warpRef.current ? 38 : still ? 0 : cruiseRef.current + Math.hypot(px, py) * 0.6;
      speed += (target - speed) * (warpRef.current ? 0.06 : 0.04);
      cx += (px * w * 0.12 - cx) * 0.05;
      cy += (py * h * 0.12 - cy) * 0.05;

      // Trails: translucent clear leaves streaks at warp speed. Color follows the active theme.
      const wash = getComputedStyle(document.documentElement);
      const wr = wash.getPropertyValue("--warp-r").trim() || "244";
      const wg = wash.getPropertyValue("--warp-g").trim() || "239";
      const wb = wash.getPropertyValue("--warp-b").trim() || "228";
      ctx.fillStyle = `rgba(${wr},${wg},${wb},${speed > 6 ? 0.35 : 1})`;
      ctx.fillRect(0, 0, w, h);

      const ox = w / 2 - cx, oy = h * 0.42 - cy;
      const f = Math.min(w, h) * 0.9;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed * 4;
        if (s.z < 1) {
          s.x = (Math.random() - 0.5) * 2000;
          s.y = (Math.random() - 0.5) * 2000;
          s.z = DEPTH;
          s.pz = DEPTH;
          continue;
        }
        const sx = ox + (s.x / s.z) * f;
        const sy = oy + (s.y / s.z) * f;
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;
        const near = 1 - s.z / DEPTH;
        ctx.globalAlpha = Math.min(1, near * 1.4);
        ctx.strokeStyle = s.tint;
        ctx.lineWidth = 0.4 + near * 2;
        const qx = ox + (s.x / s.pz) * f;
        const qy = oy + (s.y / s.pz) * f;
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(sx + 0.1, sy + 0.1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const onMove = (e: PointerEvent) => {
      px = (e.clientX / w - 0.5) * 2;
      py = (e.clientY / h - 0.5) * 2;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-background" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="theme-loading-glow absolute inset-0" />

      {/* Mars on approach, lower right */}
      {planet && (
      <div
        className={`absolute -bottom-[38vmin] -right-[22vmin] h-[90vmin] w-[90vmin] rounded-full transition-transform duration-[1200ms] ease-in ${
          warp ? "scale-125" : ""
        }`}
        style={{
          background:
            "radial-gradient(circle at 30% 28%, #f6a46b 0%, #d9653b 22%, #8f2f1c 52%, #3a120b 74%, #120504 100%)",
          boxShadow: "0 0 90px 20px rgba(249,115,22,0.22), inset -40px -50px 120px rgba(0,0,0,0.75)",
        }}
      >
        {/* Albedo features: dark maria and a bright polar cap */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(ellipse_18%_10%_at_42%_44%,rgba(60,18,10,0.55),transparent),radial-gradient(ellipse_26%_12%_at_58%_58%,rgba(60,18,10,0.45),transparent),radial-gradient(ellipse_14%_9%_at_30%_62%,rgba(70,22,12,0.4),transparent),radial-gradient(ellipse_22%_8%_at_36%_10%,rgba(255,235,220,0.55),transparent)]" />
        <div className="absolute -inset-[2px] rounded-full shadow-[inset_8px_10px_24px_rgba(255,190,150,0.35)]" />
      </div>
      )}

      {/* Crew heartbeat across the horizon */}
      {heartbeat && (
      <svg className={`absolute left-0 top-[64%] h-24 w-full transition-opacity duration-500 ${warp ? "opacity-0" : "opacity-70"}`} viewBox="0 0 1200 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="beat-fade" x1="0" x2="1">
            <stop offset="0" stopColor="#3ddc97" stopOpacity="0" />
            <stop offset="0.5" stopColor="#3ddc97" stopOpacity="1" />
            <stop offset="1" stopColor="#3ddc97" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="heartbeat-trace"
          d="M0 60 H260 l14 -6 l10 6 h30 l8 10 l12 -58 l12 70 l10 -22 h40 l18 -10 l20 10 H640 l14 -6 l10 6 h30 l8 10 l12 -58 l12 70 l10 -22 h40 l18 -10 l20 10 H1200"
          fill="none"
          stroke="url(#beat-fade)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      )}
    </div>
  );
}
