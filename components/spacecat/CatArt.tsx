"use client";

import { useId } from "react";
import { STAGE_WIDTH, type GrowthStage } from "@/lib/spaceCat";

export type CatMood = "happy" | "hungry" | "eating" | "giggle" | "purr" | "wink";

const FUR = "#a7adb5";
const FUR_DARK = "#5d636c";
const GLOW = "#46e3ff";

/**
 * Original astronaut tabby (our own drawing, styled after Mark's reference): grey striped cat in a
 * glass helmet and a white suit with glowing cyan strips. Parts carry data-part so the screen can
 * react to taps on the tail, face or body. `compact` draws just the helmeted head with the tail
 * peeking out, for the floating button.
 */
export function CatArt({
  stage,
  mood,
  talking,
  wagging = false,
  compact = false,
  className = "",
}: {
  stage: GrowthStage;
  mood: CatMood;
  talking: boolean;
  wagging?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const w = STAGE_WIDTH[stage];
  const bodyRx = 40 * w;
  const eyesClosed = mood === "purr" || mood === "eating";
  const wink = mood === "wink" || mood === "giggle";

  const tail = (x: number, y: number, scale = 1, rot = 72) => (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${rot})`}>
      <g data-part="tail" className={`spacecat-tail ${wagging ? "spacecat-tail-fast" : ""}`}>
        <TailSegments n={8} />
      </g>
    </g>
  );

  const defs = (
    <defs>
      <radialGradient id={id("glass")} cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
        <stop offset="55%" stopColor="#d9f1ff" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#8fd3f0" stopOpacity="0.32" />
      </radialGradient>
      <radialGradient id={id("fur")} cx="45%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#c9ced5" />
        <stop offset="70%" stopColor={FUR} />
        <stop offset="100%" stopColor="#868c95" />
      </radialGradient>
      <radialGradient id={id("muzzle")} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#e3e6ea" />
      </radialGradient>
      <linearGradient id={id("suit")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="60%" stopColor="#e4e8ee" />
        <stop offset="100%" stopColor="#b9c0ca" />
      </linearGradient>
      <linearGradient id={id("metal")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#f3f5f8" />
        <stop offset="50%" stopColor="#aab2bd" />
        <stop offset="100%" stopColor="#7c8592" />
      </linearGradient>
      <radialGradient id={id("iris")} cx="50%" cy="45%" r="55%">
        <stop offset="0%" stopColor="#1b2330" />
        <stop offset="70%" stopColor="#24384a" />
        <stop offset="100%" stopColor="#5a8aa6" />
      </radialGradient>
      <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );

  const glow = `url(#${id("glow")})`;

  const head = (
    <g className="spacecat-head">
      {/* ear pods on the helmet */}
      <rect x="36" y="74" width="16" height="34" rx="8" fill={`url(#${id("metal")})`} />
      <rect x="168" y="74" width="16" height="34" rx="8" fill={`url(#${id("metal")})`} />
      <circle cx="44" cy="91" r="3" fill={GLOW} filter={glow} />
      <circle cx="176" cy="91" r="3" fill={GLOW} filter={glow} />

      <g data-part="face">
        {/* ears */}
        <path d="M66 66 L70 22 L104 50 Z" fill={`url(#${id("fur")})`} stroke="#7d838c" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M154 66 L150 22 L116 50 Z" fill={`url(#${id("fur")})`} stroke="#7d838c" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M73 54 L75 32 L94 49 Z" fill="#f2b3bd" />
        <path d="M147 54 L145 32 L126 49 Z" fill="#f2b3bd" />

        {/* head with fluffy cheeks */}
        <path
          d="M110 44 C 146 44 162 66 162 90 C 168 96 168 108 158 112 C 152 128 132 136 110 136 C 88 136 68 128 62 112 C 52 108 52 96 58 90 C 58 66 74 44 110 44 Z"
          fill={`url(#${id("fur")})`}
          stroke="#7d838c"
          strokeWidth="1.5"
        />
        {/* tabby stripes */}
        <g fill={FUR_DARK} opacity="0.85">
          <path d="M104 46 q6 14 12 0 z" />
          <path d="M92 49 q3 12 9 4 z" />
          <path d="M128 49 q-3 12 -9 4 z" />
          <path d="M58 94 q12 1 16 6 q-10 2 -16 -2 z" />
          <path d="M60 104 q10 0 13 4 q-8 2 -13 0 z" />
          <path d="M162 94 q-12 1 -16 6 q10 2 16 -2 z" />
          <path d="M160 104 q-10 0 -13 4 q8 2 13 0 z" />
        </g>
        {/* muzzle */}
        <ellipse cx="110" cy="112" rx="24" ry="17" fill={`url(#${id("muzzle")})`} />

        {/* brows: worried when hungry */}
        {mood === "hungry" ? (
          <path d="M78 72 q10 -8 18 -6 M142 72 q-10 -8 -18 -6" stroke={FUR_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M80 68 q9 -6 18 -1 M140 68 q-9 -6 -18 -1" stroke={FUR_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
        )}

        {/* eyes (left one winks) */}
        <Eye cx={90} cy={88} closed={eyesClosed || wink} sad={mood === "hungry"} iris={`url(#${id("iris")})`} />
        <Eye cx={130} cy={88} closed={eyesClosed} sad={mood === "hungry"} iris={`url(#${id("iris")})`} />

        {/* nose, mouth, whiskers */}
        <path d="M104 103 q6 -3 12 0 q-2 6 -6 7 q-4 -1 -6 -7 z" fill="#f08fa0" stroke="#d06b80" strokeWidth="1" />
        {talking || mood === "eating" ? (
          <g className="spacecat-mouth-talk">
            <path d="M98 114 q12 16 24 0 q-12 4 -24 0 z" fill="#7a2c3a" />
            <ellipse cx="110" cy="121" rx="6" ry="3" fill="#f08fa0" />
          </g>
        ) : mood === "hungry" ? (
          <path d="M100 121 q10 -6 20 0" stroke="#3a3f46" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        ) : (
          <g>
            <path d="M110 110 v3 M110 113 q-7 8 -13 2 M110 113 q7 8 13 2" stroke="#3a3f46" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M104 116 l1.5 4 l1.5 -3.5" fill="#fff" stroke="#c9ccd1" strokeWidth="0.6" />
          </g>
        )}
        <g stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity="0.9">
          <path d="M88 110 l-30 -6 M88 114 l-30 1 M88 118 l-26 7" />
          <path d="M132 110 l30 -6 M132 114 l30 1 M132 118 l26 7" />
        </g>
        {(mood === "giggle" || mood === "purr" || mood === "wink") && (
          <g fill="#f58f9f" opacity="0.6">
            <ellipse cx="74" cy="110" rx="8" ry="4.5" />
            <ellipse cx="146" cy="110" rx="8" ry="4.5" />
          </g>
        )}
      </g>

      {/* glass dome */}
      <circle cx="110" cy="88" r="68" fill={`url(#${id("glass")})`} stroke="#dfe6ee" strokeWidth="3" pointerEvents="none" />
      <path d="M62 56 a58 58 0 0 1 38 -30" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="6" strokeLinecap="round" fill="none" pointerEvents="none" />
      <path d="M150 140 a58 58 0 0 0 20 -24" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" pointerEvents="none" />
      {/* neck ring */}
      <ellipse cx="110" cy="152" rx="46" ry="11" fill={`url(#${id("metal")})`} stroke="#8a929d" strokeWidth="1.5" />
      <ellipse cx="110" cy="150" rx="40" ry="7" fill="none" stroke={GLOW} strokeWidth="2.5" filter={glow} />
    </g>
  );

  if (compact) {
    return (
      <svg viewBox="22 14 186 156" className={`spacecat-svg ${className}`} role="img" aria-label="Astronaut cat">
        {defs}
        {head}
        {tail(166, 172, 0.95, -28)}
      </svg>
    );
  }

  const legX = bodyRx * 0.48;

  return (
    <svg
      viewBox="0 0 220 280"
      overflow="visible"
      className={`spacecat-svg ${className}`}
      role="img"
      aria-label={`Astronaut cat, ${stage}, ${mood === "hungry" ? "hungry" : "content"}`}
    >
      {defs}

      {tail(110 + bodyRx - 12, 222)}

      <g className="spacecat-body" data-part="body">
        {/* legs, knee pads, silver boots */}
        {[-1, 1].map((s) => (
          <g key={s}>
            <rect x={110 + s * legX - 14} y="214" width="28" height="40" rx="12" fill={`url(#${id("suit")})`} stroke="#aab2bd" strokeWidth="1.2" />
            <rect x={110 + s * legX - 12} y="224" width="24" height="12" rx="4" fill={`url(#${id("metal")})`} />
            <path d={`M${110 + s * legX - 10} 241 h20`} stroke={GLOW} strokeWidth="2.2" filter={glow} />
            <ellipse cx={110 + s * legX + s * 3} cy="260" rx="19" ry="10" fill={`url(#${id("metal")})`} stroke="#6e7783" strokeWidth="1.2" />
          </g>
        ))}

        {/* torso */}
        <ellipse cx="110" cy="190" rx={bodyRx} ry="44" fill={`url(#${id("suit")})`} stroke="#aab2bd" strokeWidth="1.5" />
        <path d="M110 160 v66" stroke="#c3c9d2" strokeWidth="1.5" />
        {/* belt */}
        <path d={`M${110 - bodyRx + 3} 210 Q110 220 ${110 + bodyRx - 3} 210`} stroke="#b0b8c3" strokeWidth="8" fill="none" />
        <path d={`M${110 - bodyRx + 5} 209 Q110 219 ${110 + bodyRx - 5} 209`} stroke={GLOW} strokeWidth="2.5" fill="none" filter={glow} />
        <rect x="100" y="208" width="20" height="12" rx="2.5" fill={`url(#${id("metal")})`} stroke="#6e7783" strokeWidth="1" />
        {/* chest control panel */}
        <rect x="92" y="166" width="36" height="24" rx="4" fill={`url(#${id("metal")})`} stroke="#6e7783" strokeWidth="1" />
        <circle cx="99" cy="174" r="2.6" fill="#ff5a5a" />
        <circle cx="106" cy="174" r="2.6" fill="#ffd54a" />
        <circle cx="121" cy="174" r="3.2" fill={GLOW} filter={glow} />
        <path d="M97 182 h18 M97 185.5 h18" stroke="#5a626d" strokeWidth="1.3" />

        {/* left arm resting, right arm waving */}
        <g className="spacecat-arm-left">
          <path d={`M${110 - bodyRx + 8} 170 Q ${110 - bodyRx - 16} 190 ${110 - bodyRx - 8} 212`} stroke={`url(#${id("suit")})`} strokeWidth="18" strokeLinecap="round" fill="none" />
          <path d={`M${110 - bodyRx - 16} 202 l15 3`} stroke={GLOW} strokeWidth="2.5" filter={glow} strokeLinecap="round" />
          <circle cx={110 - bodyRx - 8} cy="216" r="9" fill="#eef1f5" stroke="#aab2bd" strokeWidth="1.2" />
        </g>
        <g className="spacecat-arm-right" style={{ transformOrigin: `${110 + bodyRx - 8}px 170px` }}>
          <path d={`M${110 + bodyRx - 8} 170 Q ${110 + bodyRx + 18} 156 ${110 + bodyRx + 18} 132`} stroke={`url(#${id("suit")})`} strokeWidth="18" strokeLinecap="round" fill="none" />
          <path d={`M${110 + bodyRx + 10} 143 l15 1`} stroke={GLOW} strokeWidth="2.5" filter={glow} strokeLinecap="round" />
          {/* paw with toe beans */}
          <circle cx={110 + bodyRx + 18} cy="124" r="11" fill={`url(#${id("fur")})`} stroke="#7d838c" strokeWidth="1.2" />
          <ellipse cx={110 + bodyRx + 18} cy="127" rx="4.5" ry="3.5" fill="#3a3f46" />
          <circle cx={110 + bodyRx + 12} cy="120" r="2" fill="#3a3f46" />
          <circle cx={110 + bodyRx + 18} cy="117.5" r="2" fill="#3a3f46" />
          <circle cx={110 + bodyRx + 24} cy="120" r="2" fill="#3a3f46" />
        </g>
      </g>

      {head}

      {mood === "hungry" && (
        <text x="160" y="250" fontSize="12" fill="currentColor" className="spacecat-rumble" fontFamily="monospace">
          grrr…
        </text>
      )}
      {(mood === "purr" || mood === "giggle" || mood === "wink") && (
        <text x="168" y="40" fontSize="18" className="spacecat-heart">
          ♥
        </text>
      )}
      {wagging && (
        <g className="spacecat-sparkle" fill="#ffe27a">
          <path d="M196 150 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" />
          <path d="M206 196 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" />
          <path d="M172 186 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" />
        </g>
      )}
    </svg>
  );
}

/** Nested segments: each rotates a little with a staggered delay, so the tail curls like an S. */
function TailSegments({ n }: { n: number }) {
  const seg = (i: number): React.ReactNode => {
    if (i >= n) return null;
    const r = 7.5 - i * 0.35;
    const dark = i % 2 === 1 || i === n - 1;
    return (
      <g className="spacecat-tail-seg" style={{ animationDelay: `${-i * 0.14}s` }}>
        <rect x={-r} y={-15} width={r * 2} height={17} rx={r} fill={dark ? FUR_DARK : FUR} />
        <g transform="translate(0 -13)">{seg(i + 1)}</g>
      </g>
    );
  };
  return (
    <g>
      {/* fat invisible hit area so the tail is easy to tap */}
      <rect x="-16" y={-13 * n - 8} width="32" height={13 * n + 10} fill="transparent" />
      {seg(0)}
    </g>
  );
}

function Eye({ cx, cy, closed, sad, iris }: { cx: number; cy: number; closed: boolean; sad: boolean; iris: string }) {
  if (closed) {
    return <path d={`M${cx - 10} ${cy + 1} q10 -10 20 0`} stroke="#2b3038" strokeWidth="3.2" fill="none" strokeLinecap="round" />;
  }
  return (
    <g className="spacecat-eye" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <ellipse cx={cx} cy={cy} rx="12" ry="14" fill="#ffffff" />
      <ellipse cx={cx} cy={cy + 1.5} rx="9.5" ry={sad ? 12 : 11.5} fill={iris} />
      <circle cx={cx + 3.5} cy={cy - 4} r="3.6" fill="#ffffff" />
      <circle cx={cx - 3.5} cy={cy + 5} r="1.8" fill="#ffffff" opacity="0.9" />
    </g>
  );
}
