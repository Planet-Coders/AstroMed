/** Mission-point coin: a glowing cyan ring with an orange flame (original drawing). */
export function FlameCoin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#0e2a3a" stroke="#46e3ff" strokeWidth="2" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#46e3ff" strokeOpacity="0.45" strokeWidth="1" />
      <path
        d="M12 5.5c.6 2.2 3.6 3.4 3.6 6.8a3.6 3.6 0 0 1-7.2 0c0-1.5.7-2.5 1.5-3.2.1 1 .6 1.7 1.3 2 -.2-2.1.1-4 .8-5.6z"
        fill="#ff9a3c"
      />
      <path d="M12 11.2c.4 1 1.6 1.5 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.9.6-1.5 1.6-3z" fill="#ffe08a" />
    </svg>
  );
}
