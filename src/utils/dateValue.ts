/** Converts Firestore Timestamp, Date, ISO text and serialized timestamp values into ISO text. */
export function toIsoDateTime(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  if (value && typeof (value as any).toDate === 'function') {
    const date = (value as any).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
  }
  if (value && typeof value === 'object') {
    const raw = value as { seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown };
    const seconds = Number(raw.seconds ?? raw._seconds);
    const nanoseconds = Number(raw.nanoseconds ?? raw._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000 + (Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0));
      return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
    }
  }
  return fallback;
}

export function invoiceDateTime(value: unknown, fallback = ''): string {
  return toIsoDateTime(value, typeof value === 'string' ? value : fallback);
}
