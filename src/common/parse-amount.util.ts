// Strips thousands separators (e.g. "14,000") before parsing so a comma
// doesn't silently truncate the value via parseFloat/Number ("14,000" → 14 or NaN).
export function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
