/** The dashboard ranges: 7, 14 or 30 days (anything else falls back to 14). */
export function parseDays(url: string): 7 | 14 | 30 {
  const d = Number(new URL(url).searchParams.get("days"));
  return d === 7 || d === 30 ? d : 14;
}
/** UTC mission day, "YYYY-MM-DD". */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
