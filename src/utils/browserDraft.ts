const DEFAULT_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface BrowserDraftEnvelope<T> {
  version: 1;
  savedAt: number;
  value: T;
}

/**
 * Local, device-scoped draft storage for operational forms. Drafts are never
 * treated as posted business data; the server remains authoritative when a
 * receipt or invoice is submitted.
 */
export function readBrowserDraft<T>(key: string, maxAgeMs = DEFAULT_DRAFT_MAX_AGE_MS): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as BrowserDraftEnvelope<T>;
    if (envelope?.version !== 1 || !Number.isFinite(envelope.savedAt)) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - envelope.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return envelope.value ?? null;
  } catch (error) {
    console.warn(`[Draft storage] Không thể đọc nháp ${key}:`, error);
    return null;
  }
}

export function writeBrowserDraft<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: BrowserDraftEnvelope<T> = {
      version: 1,
      savedAt: Date.now(),
      value
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch (error) {
    console.warn(`[Draft storage] Không thể lưu nháp ${key}:`, error);
  }
}

export function removeBrowserDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[Draft storage] Không thể xóa nháp ${key}:`, error);
  }
}

export function browserDraftKey(flow: string, userId?: string, branchId?: string): string {
  const safe = (value: string | undefined, fallback: string) => String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `phonehouse:draft:v1:${safe(flow, 'form')}:${safe(userId, 'anonymous')}:${safe(branchId, 'unassigned')}`;
}
