import { describe, expect, it } from 'vitest';
import {
  assertFinanceIdempotencyRecord,
  financePayloadHash,
  parseVnd,
  requireFinanceIdempotencyKey
} from '../server/utils/financeIntegrity';

describe('Finance money and idempotency invariants', () => {
  it.each([Infinity, 'Infinity', NaN, 'NaN', 10.5, '10.5', '', true, null, Number.MAX_SAFE_INTEGER + 1, 100_000_000_001, 0, -1])(
    'rejects invalid VND value %s',
    value => expect(() => parseVnd(value)).toThrow('MONEY_AMOUNT_INVALID')
  );

  it('accepts only safe integer VND values within the business ceiling', () => {
    expect(parseVnd('1500000')).toBe(1_500_000);
    expect(parseVnd(0, { allowZero: true, field: 'ACTUAL_BALANCE' })).toBe(0);
  });

  it('requires a bounded Firestore-safe idempotency key', () => {
    expect(requireFinanceIdempotencyKey('FIN:PAY:001', undefined)).toBe('FIN:PAY:001');
    expect(() => requireFinanceIdempotencyKey('', undefined)).toThrow('IDEMPOTENCY_KEY_REQUIRED');
    expect(() => requireFinanceIdempotencyKey('bad/key', undefined)).toThrow('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('replays only when operation, actor and canonical payload hash all match', () => {
    const payloadHash = financePayloadHash('PAYMENT', { fundId: 'FUND-1', amount: 500_000, notes: 'Chi phí' });
    const record = { type: 'PAYMENT', creatorUid: 'USER-1', payloadHash, status: 'COMPLETED' };
    expect(() => assertFinanceIdempotencyRecord(record, { operationType: 'PAYMENT', actorUid: 'USER-1', payloadHash })).not.toThrow();
    const changedHash = financePayloadHash('PAYMENT', { fundId: 'FUND-1', amount: 600_000, notes: 'Chi phí' });
    expect(() => assertFinanceIdempotencyRecord(record, { operationType: 'PAYMENT', actorUid: 'USER-1', payloadHash: changedHash }))
      .toThrow('IDEMPOTENCY_KEY_CONFLICT');
  });
});
