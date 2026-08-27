import crypto from 'crypto';

export const MAX_VND_AMOUNT = 100_000_000_000;

export function parseVnd(
  value: unknown,
  options: { allowZero?: boolean; field?: string; max?: number } = {}
): number {
  if (
    !['number', 'string'].includes(typeof value)
    || (typeof value === 'string' && !/^\d+$/.test(value.trim()))
  ) {
    throw new Error(`${options.field || 'MONEY_AMOUNT'}_INVALID`);
  }
  const amount = Number(value);
  const allowZero = options.allowZero === true;
  const max = options.max ?? MAX_VND_AMOUNT;
  if (
    !Number.isFinite(amount)
    || !Number.isSafeInteger(amount)
    || (allowZero ? amount < 0 : amount <= 0)
    || amount > max
  ) {
    throw new Error(`${options.field || 'MONEY_AMOUNT'}_INVALID`);
  }
  return amount;
}

export function requireFinanceIdempotencyKey(bodyValue: unknown, headerValue: unknown): string {
  const rawHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const key = String(bodyValue || rawHeader || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  }
  return key;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function financePayloadHash(operationType: string, payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(stableValue({ operationType, ...payload }));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function assertFinanceIdempotencyRecord(
  existing: Record<string, any> | undefined,
  expected: { operationType: string; payloadHash: string; actorUid: string }
): void {
  if (!existing) return;
  if (
    existing.type !== expected.operationType
    || existing.payloadHash !== expected.payloadHash
    || existing.creatorUid !== expected.actorUid
  ) {
    throw new Error('IDEMPOTENCY_KEY_CONFLICT');
  }
}
