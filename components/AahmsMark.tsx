/**
 * AAHMS mission mark: a crew heartbeat crossing an orbit around Mars.
 * Our own emblem (the NASA insignia can't be used in Space Apps submissions).
 */
export function AahmsMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="AAHMS mission mark">
      <defs>
        <radialGradient id="aahms-disc" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#1d3b7a" />
          <stop offset="0.6" stopColor="#0b1d45" />
          <stop offset="1" stopColor="#050b1f" />
        </radialGradient>
        <radialGradient id="aahms-mars" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffb07a" />
          <stop offset="0.55" stopColor="#e0532e" />
          <stop offset="1" stopColor="#7a1f10" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#aahms-disc)" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2" />
      {/* Stars */}
      <g fill="#ffffff">
        <circle cx="26" cy="24" r="1.1" />
        <circle cx="70" cy="18" r="0.9" />
        <circle cx="80" cy="34" r="1.2" />
        <circle cx="20" cy="70" r="0.8" />
        <circle cx="36" cy="14" r="0.7" />
      </g>
      {/* Orbit */}
      <ellipse cx="50" cy="52" rx="40" ry="14" fill="none" stroke="#9fd3ff" strokeOpacity="0.55" strokeWidth="1.4" transform="rotate(-18 50 52)" />
      {/* Mars */}
      <circle cx="66" cy="66" r="11" fill="url(#aahms-mars)" />
      {/* Crew heartbeat */}
      <path
        d="M8 52 H30 l4 -5 l4 5 h4 l3 8 l6 -34 l6 40 l4 -14 h6 l4 -4 l4 4 H92"
        fill="none"
        stroke="#fc3d21"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="50" y="88" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700" letterSpacing="2.5" fontFamily="var(--font-sans, sans-serif)">
        AAHMS
      </text>
    </svg>
  );
}
