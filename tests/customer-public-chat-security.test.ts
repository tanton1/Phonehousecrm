import express from 'express';
import type { Server } from 'node:http';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAppCheck } from '../server/firebaseAdmin';
import { createCustomerPortalRouter } from '../server/routes/customerPortal';

describe('production public customer chat protection', () => {
  let server: Server;
  let endpoint: string;
  let windowNumber = 0;
  const originalNow = Date.now();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // Personal guest questions return an auth prompt without querying Firestore.
    app.use('/api/customer-portal', createCustomerPortalRouter({} as Firestore));
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_UNAVAILABLE');
    endpoint = `http://127.0.0.1:${address.port}/api/customer-portal/public/chat`;
  });

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_CHECK_ENFORCED', 'false');
    for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) vi.stubEnv(name, '');
    // Give each test a separate real limiter bucket without sleeping/reset APIs.
    vi.spyOn(Date, 'now').mockReturnValue(originalNow + (++windowNumber * 600_000));
    vi.spyOn(adminAppCheck, 'verifyToken').mockImplementation(async token => {
      if (token !== 'valid-app-check-token') throw new Error('INVALID_TOKEN');
      return { appId: 'phonehouse-web', token: {} } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  const ask = (token?: string) => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Firebase-AppCheck': token } : {}) },
    body: JSON.stringify({ message: 'Máy còn bảo hành không?' })
  });

  it('rejects a missing token even when global enforcement is disabled', async () => {
    const response = await ask();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'APP_CHECK_REQUIRED' });
    expect(adminAppCheck.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid App Check token', async () => {
    const response = await ask('invalid-app-check-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'APP_CHECK_INVALID' });
  });

  it('accepts a verified application without granting guest access to personal data', async () => {
    const response = await ask('valid-app-check-token');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { intent: 'AUTH_REQUIRED' } });
    expect(adminAppCheck.verifyToken).toHaveBeenCalledWith('valid-app-check-token');
  });

  it('limits public chat to 30 questions per IP per ten minutes', async () => {
    for (let index = 0; index < 30; index += 1) expect((await ask('valid-app-check-token')).status).toBe(200);
    const blocked = await ask('valid-app-check-token');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
