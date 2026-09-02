const text = (value: unknown) => String(value || '').trim();

export const MIN_DEVICE_RETAIL_PRICE_VND = 100_000;

export const normalizeRetailPriceKey = (value: unknown): string => text(value).toUpperCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Older inventory imports sometimes put storage, colour and the generic
 * "Máy iPhone" category inside `model`. Pricing and public catalogues need a
 * stable model identity so colours do not become separate product cards.
 */
export function canonicalDeviceModelName(device: any): string {
  const original = text(device?.model);
  if (!original) return '';

  let model = original
    .replace(/^máy\s+(?=iphone\b)/iu, '')
    .replace(/^iphone(?:\s+iphone)+\b/iu, 'iPhone');

  for (const token of [device?.storage, device?.color, device?.condition].map(text).filter(Boolean)) {
    model = model.replace(new RegExp(escapeRegExp(token), 'giu'), ' ');
  }

  model = model
    .replace(/[\s·,()/_-]+/g, ' ')
    .replace(/^iphone(?:\s+iphone)+\b/iu, 'iPhone')
    .trim();

  return model || original;
}

export function canonicalDeviceVariantKey(device: any): string {
  return [canonicalDeviceModelName(device), device?.storage, device?.condition]
    .map(normalizeRetailPriceKey)
    .join('|');
}

export function legacyDeviceVariantKey(device: any): string {
  return [device?.model, device?.storage, device?.condition]
    .map(normalizeRetailPriceKey)
    .join('|');
}

export function deviceVariantKeyCandidates(device: any): string[] {
  return [...new Set([canonicalDeviceVariantKey(device), legacyDeviceVariantKey(device)])];
}
