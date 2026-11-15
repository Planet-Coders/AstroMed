type PvtResult = { mean: number; lapses: number; at: number };

const resultKey = (userId: string) => `aahms_pvt_summary:${userId}`;

export function savePvtResult(userId: string, result: PvtResult) {
  try {
    localStorage.setItem(resultKey(userId), JSON.stringify(result));
  } catch {
    /* storage unavailable */
  }
}

export function getPvtResult(userId: string): PvtResult | null {
  try {
    const result = JSON.parse(localStorage.getItem(resultKey(userId)) ?? "null") as PvtResult | null;
    return result && Number.isFinite(result.mean) && Number.isFinite(result.lapses) && Number.isFinite(result.at) ? result : null;
  } catch {
    return null;
  }
}
