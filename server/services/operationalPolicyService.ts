export type OperationalPolicyKind = 'sales' | 'customerCare' | 'retailPricing';

export function getVietnamPolicyDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

function generatedPolicyId(kind: OperationalPolicyKind, version: unknown): string {
  const suffix = String(version || 'LEGACY').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40) || 'LEGACY';
  return `${kind.toUpperCase()}_${suffix}`;
}

export function normalizeOperationalPolicyVersions(kind: OperationalPolicyKind, stored: any): any[] {
  if (Array.isArray(stored?.versions)) return stored.versions.map((item: any) => ({ ...item, id: kind }));
  if (!stored || !stored.name || !stored.version) return [];
  return [{
    ...stored,
    id: kind,
    policyId: stored.policyId || generatedPolicyId(kind, stored.version),
    effectiveFrom: stored.effectiveFrom || '1970-01-01',
    effectiveTo: stored.effectiveTo || '',
    isActive: stored.isActive === true
  }];
}

export function selectEffectiveOperationalPolicy(versions: any[], date = getVietnamPolicyDate()): any | undefined {
  return [...versions]
    .filter(policy => policy?.isActive === true && policy.effectiveFrom <= date && (!policy.effectiveTo || policy.effectiveTo >= date))
    .sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)))[0];
}

export function operationalPolicyPeriodsOverlap(left: any, right: any): boolean {
  if (left?.isActive !== true || right?.isActive !== true) return false;
  const leftEnd = left.effectiveTo || '9999-12-31';
  const rightEnd = right.effectiveTo || '9999-12-31';
  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}
