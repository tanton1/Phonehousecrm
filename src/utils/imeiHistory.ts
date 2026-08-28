export const OPEN_IMEI_HISTORY_EVENT = 'phonehouse:open-imei-history';

export function normalizeClickableImei(value: unknown): string {
  const normalized = String(value || '').replace(/\D/g, '');
  return normalized.length >= 5 && normalized.length <= 15 ? normalized : '';
}

export function extractLabeledImei(value: unknown): string {
  const text = String(value || '');
  const label = /IMEI(?:\s*\/\s*Serial)?/i.exec(text);
  if (!label || label.index == null) return '';
  const remainder = text.slice(label.index + label[0].length).trim().replace(/^[:#]\s*/, '');
  if (/^\.{2,}/.test(remainder)) return '';
  const candidate = /^(\d{5,15})(?!\d)/.exec(remainder)?.[1] || '';
  return normalizeClickableImei(candidate);
}

export function openImeiHistory(imei: string): void {
  const normalized = normalizeClickableImei(imei);
  if (!normalized || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_IMEI_HISTORY_EVENT, { detail: { imei: normalized } }));
}
