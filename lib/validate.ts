/** Small input helpers for the admin APIs: trimmed strings with a length cap. */

export function str(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function optStr(value: unknown, max = 500): string | null {
  const s = str(value, max);
  return s || null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Group codes double as the console's crew id, so keep them short and URL-safe. */
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,15}$/;

export function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
