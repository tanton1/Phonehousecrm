export type InventoryConditionBucket =
  | 'ALL'
  | 'NEW_SEAL'
  | 'LIKE_NEW_99'
  | 'GRADE_98'
  | 'GRADE_95'
  | 'DISPLAY'
  | 'OTHER';

export const INVENTORY_CONDITION_OPTIONS: Array<{
  id: InventoryConditionBucket;
  label: string;
  shortLabel: string;
}> = [
  { id: 'ALL', label: 'Tất cả ngoại hình', shortLabel: 'Tất cả' },
  { id: 'NEW_SEAL', label: 'New Seal', shortLabel: 'New Seal' },
  { id: 'LIKE_NEW_99', label: 'Like New / 99%', shortLabel: 'Like New / 99%' },
  { id: 'GRADE_98', label: '98%', shortLabel: '98%' },
  { id: 'GRADE_95', label: '95%', shortLabel: '95%' },
  { id: 'DISPLAY', label: 'Máy trưng bày', shortLabel: 'Trưng bày' },
  { id: 'OTHER', label: 'Ngoại hình khác', shortLabel: 'Khác' }
];

function searchable(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyInventoryCondition(value: unknown): Exclude<InventoryConditionBucket, 'ALL'> {
  const condition = searchable(value);
  if (!condition) return 'OTHER';
  if (/\bnew\s*seal\b|\bseal\s*100\b|\bmay\s*moi\b/.test(condition)) return 'NEW_SEAL';
  if (/trung\s*bay|display|demo/.test(condition)) return 'DISPLAY';
  if (/like\s*new|\b99\s*%?\b|keng/.test(condition)) return 'LIKE_NEW_99';
  if (/\b98\s*%?\b/.test(condition)) return 'GRADE_98';
  if (/\b95\s*%?\b/.test(condition)) return 'GRADE_95';
  return 'OTHER';
}

export function inventoryConditionLabel(value: unknown): string {
  const bucket = classifyInventoryCondition(value);
  return INVENTORY_CONDITION_OPTIONS.find(option => option.id === bucket)?.shortLabel || 'Khác';
}

export function inventoryConditionTone(bucket: InventoryConditionBucket): string {
  switch (bucket) {
    case 'NEW_SEAL': return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'LIKE_NEW_99': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'GRADE_98': return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'GRADE_95': return 'border-orange-200 bg-orange-50 text-orange-800';
    case 'DISPLAY': return 'border-violet-200 bg-violet-50 text-violet-800';
    default: return 'border-zinc-200 bg-zinc-50 text-zinc-700';
  }
}
