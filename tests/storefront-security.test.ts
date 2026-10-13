import express from 'express';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAppCheck } from '../server/firebaseAdmin';
import { createStorefrontRouter } from '../server/routes/storefront';
import { storefrontMemoryDb } from './helpers/storefrontMemoryDb';

describe('storefront API security', () => {
  let server: Server, endpoint: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const store = storefrontMemoryDb({ catalogItems: { A: { name: 'Test', category: 'DEVICE', status: 'active' } } });
    app.use('/api/storefront', createStorefrontRouter(store.db));
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    endpoint = `http://127.0.0.1:${address.port}/api/storefront`;
  });
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_CHECK_ENFORCED', 'false');
    vi.spyOn(adminAppCheck, 'verifyToken').mockImplementation(async token => {
      if (token !== 'valid-test-token') throw new Error('invalid');
      return { appId: 'test', token: {} } as any;
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  it('allows anonymous public catalogue reads without exposing private data', async () => {
    const response = await fetch(`${endpoint}/products`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ data: { total: 1 } });
  });
  it.each(['/assistant', '/orders'])('requires App Check for %s even when global enforcement is disabled', async path => {
    const response = await fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'APP_CHECK_REQUIRED' });
  });
  it('rejects invalid App Check before creating a request', async () => {
    const response = await fetch(`${endpoint}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': 'invalid' }, body: '{}' });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'APP_CHECK_INVALID' });
  });
  it('rejects anonymous staff reads', async () => {
    expect((await fetch(`${endpoint}/staff/orders`)).status).toBe(401);
  });
  it('accepts attestation but validates the request independently', async () => {
    const response = await fetch(`${endpoint}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': 'valid-test-token' }, body: '{}' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'STOREFRONT_ORDER_INVALID' });
  });
});
