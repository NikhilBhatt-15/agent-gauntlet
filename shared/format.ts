export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatAttr(value: unknown, unit?: string): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (unit === '★') return `${value.toFixed(1)}★`;
    return unit ? `${value.toLocaleString('en-US')} ${unit}` : value.toLocaleString('en-US');
  }
  return String(value);
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
