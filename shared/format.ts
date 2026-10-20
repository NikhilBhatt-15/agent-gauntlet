/** ₹5,40,000 — Indian digit grouping. */
export function rupees(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/**
 * Pull a rupee amount out of free text: "58k", "58,000", "₹58000", "58 hazaar", "5.2 lakh",
 * "5 lakh 20 hazar", "4.85L". Returns the LAST amount mentioned (people end with their offer), or null.
 */
export function parseRupees(text: string): number | null {
  const t = text.toLowerCase().replace(/(?<=\d),(?=\d)/g, '');
  const re = /(\d+(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|l\b|k\b|thousand|hazaa?r|hajar|hazar)?(?:\s*(?:aur\s*)?(\d+(?:\.\d+)?)\s*(k\b|thousand|hazaa?r|hajar|hazar))?/g;
  const mult = (u: string | undefined) => {
    if (!u) return 1;
    if (u.startsWith('cr')) return 1e7;
    if (u.startsWith('la') || u === 'l') return 1e5;
    return 1e3;
  };
  let last: number | null = null;
  for (const m of t.matchAll(re)) {
    let v = parseFloat(m[1]) * mult(m[2]);
    if (m[3]) v += parseFloat(m[3]) * mult(m[4]);
    // skip things like "2BHK", "9th", "11-month", years, percentages
    const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 6);
    if (/^\s*(%|percent|bhk|th\b|st\b|nd\b|rd\b|month|mahin|km|gb|din|day|log|people|minute|min\b|saal|year)/.test(after)) continue;
    if (!m[2] && v >= 1900 && v <= 2035 && Number.isInteger(v) && !/₹|rs|rupe/.test(t.slice(Math.max(0, (m.index ?? 0) - 4), m.index))) continue;
    if (v > 0) last = Math.round(v);
  }
  return last;
}

/** Deterministic JSON with sorted keys — what the escrow signs. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}
