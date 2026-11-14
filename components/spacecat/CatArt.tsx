"use client";

import { STAGE_WIDTH, type GrowthStage } from "@/lib/spaceCat";

export type CatMood = "happy" | "hungry" | "eating" | "giggle" | "purr";

/**
 * Original astronaut cat (Mark's sketch): ginger cat in a glass helmet and a cream flight suit.
 * The body widens per growth stage; the mouth moves while talking or eating.
 */
export function CatArt({
  stage,
  mood,
  talking,
  className = "",
}: {
  stage: GrowthStage;
  mood: CatMood;
  talking: boolean;
  className?: string;
}) {
  const w = STAGE_WIDTH[stage];
  const bodyRx = 38 * w;
  const armX = 100 - bodyRx - 4;
  const armX2 = 100 + bodyRx + 4;
  const closedEyes = mood === "giggle" || mood === "purr" || mood === "eating";

  return (
    <svg
      viewBox="0 0 200 250"
      className={`spacecat-svg ${className}`}
      role="img"
      aria-label={`Astronaut cat, ${stage}, ${mood === "hungry" ? "hungry" : "content"}`}
    >
      <defs>
        <radialGradient id="sc-glass" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#cfe6ff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#9cc4ee" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id="sc-suit" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fbf6ea" />
          <stop offset="100%" stopColor="#e4dac4" />
        </linearGradient>
      </defs>

      {/* tail */}
      <path
        className="spacecat-tail"
        d={`M${100 + bodyRx - 8} 205 C ${150 + bodyRx * 0.4} 210, ${168 + bodyRx * 0.3} 170, ${150 + bodyRx * 0.3} 150`}
        fill="none"
        stroke="#e2873a"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        className="spacecat-tail"
        d={`M${150 + bodyRx * 0.3} 150 l -2 -6`}
        stroke="#fff3e2"
        strokeWidth="11"
        strokeLinecap="round"
      />

      <g className="spacecat-body">
        {/* boots */}
        <ellipse cx={100 - bodyRx * 0.45} cy="232" rx="16" ry="9" fill="#5c6b80" />
        <ellipse cx={100 + bodyRx * 0.45} cy="232" rx="16" ry="9" fill="#5c6b80" />

        {/* suit body */}
        <ellipse cx="100" cy="186" rx={bodyRx} ry="46" fill="url(#sc-suit)" stroke="#b9ab8c" strokeWidth="2" />
        {/* belly panel */}
        <ellipse cx="100" cy="194" rx={bodyRx * 0.55} ry="26" fill="#f3e9d4" stroke="#d6c7a6" strokeWidth="1.5" />
        {/* chest patch */}
        <circle cx={100 - bodyRx * 0.42} cy="168" r="7" fill="#0B3D91" />
        <path d={`M${100 - bodyRx * 0.42 - 5} 169 h10`} stroke="#fff" strokeWidth="1.5" />
        <rect x={100 + bodyRx * 0.25} y="163" width="12" height="7" rx="1.5" fill="#c94c3c" />

        {/* arms */}
        <g className="spacecat-arm-left">
          <path d={`M${100 - bodyRx + 6} 168 Q ${armX - 14} 186 ${armX - 6} 204`} stroke="#e8dec8" strokeWidth="15" strokeLinecap="round" fill="none" />
          <circle cx={armX - 6} cy="206" r="8" fill="#e2873a" />
        </g>
        <g className="spacecat-arm-right">
          <path d={`M${100 + bodyRx - 6} 168 Q ${armX2 + 16} 150 ${armX2 + 14} 128`} stroke="#e8dec8" strokeWidth="15" strokeLinecap="round" fill="none" />
          <circle cx={armX2 + 14} cy="125" r="8" fill="#e2873a" />
        </g>

        {/* collar ring */}
        <ellipse cx="100" cy="142" rx="40" ry="9" fill="#9aa8bb" stroke="#6e7d92" strokeWidth="2" />
      </g>

      <g className="spacecat-head">
        {/* ears */}
        <path d="M66 70 L72 32 L96 56 Z" fill="#e2873a" stroke="#c2682a" strokeWidth="2" strokeLinejoin="round" />
        <path d="M134 70 L128 32 L104 56 Z" fill="#e2873a" stroke="#c2682a" strokeWidth="2" strokeLinejoin="round" />
        <path d="M73 60 L76 42 L88 55 Z" fill="#f6b8a8" />
        <path d="M127 60 L124 42 L112 55 Z" fill="#f6b8a8" />

        {/* head */}
        <ellipse cx="100" cy="92" rx="42" ry="38" fill="#ef9a4f" stroke="#c2682a" strokeWidth="2" />
        {/* stripes */}
        <path d="M92 56 q8 8 16 0 M88 64 q12 8 24 0" stroke="#c96f2c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M60 88 h10 M60 96 h8 M140 88 h-10 M140 96 h-8" stroke="#c96f2c" strokeWidth="3" strokeLinecap="round" />
        {/* muzzle */}
        <ellipse cx="100" cy="106" rx="20" ry="14" fill="#fff3e2" />

        {/* eyes */}
        {closedEyes ? (
          <g stroke="#2d2a26" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M76 88 q8 -8 16 0" />
            <path d="M108 88 q8 -8 16 0" />
          </g>
        ) : mood === "hungry" ? (
          <g>
            <ellipse cx="84" cy="90" rx="7" ry="9" fill="#2d2a26" />
            <ellipse cx="116" cy="90" rx="7" ry="9" fill="#2d2a26" />
            <circle cx="86" cy="86" r="2.5" fill="#fff" />
            <circle cx="118" cy="86" r="2.5" fill="#fff" />
            {/* worried brows */}
            <path d="M74 80 l14 -5 M126 80 l-14 -5" stroke="#8a4a1c" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ) : (
          <g className="spacecat-eyes">
            <ellipse cx="84" cy="89" rx="7" ry="9" fill="#2d2a26" />
            <ellipse cx="116" cy="89" rx="7" ry="9" fill="#2d2a26" />
            <circle cx="86.5" cy="85" r="3" fill="#fff" />
            <circle cx="118.5" cy="85" r="3" fill="#fff" />
          </g>
        )}

        {/* blush */}
        <ellipse cx="70" cy="104" rx="7" ry="4" fill="#f58f8f" opacity="0.55" />
        <ellipse cx="130" cy="104" rx="7" ry="4" fill="#f58f8f" opacity="0.55" />

        {/* nose + mouth */}
        <path d="M95 100 h10 l-5 5 z" fill="#e0607a" />
        {talking || mood === "eating" ? (
          <ellipse className="spacecat-mouth-talk" cx="100" cy="114" rx="6" ry="5" fill="#7a2c3a" />
        ) : mood === "hungry" ? (
          <path d="M92 116 q8 -6 16 0" stroke="#2d2a26" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M100 105 v4 M100 109 q-6 6 -10 1 M100 109 q6 6 10 1" stroke="#2d2a26" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}

        {/* whiskers */}
        <g stroke="#7b5a3c" strokeWidth="1.4" strokeLinecap="round">
          <path d="M80 106 l-22 -4 M80 110 l-22 2" />
          <path d="M120 106 l22 -4 M120 110 l22 2" />
        </g>

        {/* glass helmet over the head */}
        <circle cx="100" cy="88" r="62" fill="url(#sc-glass)" stroke="#7d93ad" strokeWidth="3" />
        <path d="M58 64 a48 48 0 0 1 30 -26" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="132" cy="44" r="4" fill="#ffffff" opacity="0.7" />
      </g>

      {mood === "hungry" && (
        <text x="150" y="214" fontSize="12" fill="currentColor" className="spacecat-rumble" fontFamily="monospace">
          grrr…
        </text>
      )}
      {(mood === "purr" || mood === "giggle") && (
        <text x="146" y="70" fontSize="16" className="spacecat-heart">
          ♥
        </text>
      )}
    </svg>
  );
}
