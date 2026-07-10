/** REAL/浮点显示小数位数：undefined=不强制；0–10 */
export const DECIMAL_PLACES_MAX = 10;

export function normalizeDecimalPlaces(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(DECIMAL_PLACES_MAX, n));
}
