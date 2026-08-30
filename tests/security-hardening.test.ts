import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createRateLimit, securityHeaders } from '../server/middleware/security';
import { redactSensitiveText } from '../server/observability';

function responseStub() {
  const headers = new Map<string, string>();
  const result: any = {
    statusCode: 200,
    body: undefined,
    setHeader: vi.fn((key: string, value: unknown) => headers.set(key.toLowerCase(), String(value))),
    status: vi.fn((status: number) => {
      result.statusCode = status;
      return result;
    }),
    json: vi.fn((body: unknown) => {
      result.body = body;
      return result;
    })
  };
  return { result: result as Response, headers, raw: result };
}

async function invokeLimit(limit: ReturnType<typeof createRateLimit>, ip: string) {
  const req = { ip, socket: {}, requestId: 'request-test-0001' } as unknown as Request;
  const response = responseStub();
  let continued = false;
  await new Promise<void>((resolve, reject) => {
    const next: NextFunction = error => {
      if (error) reject(error);
      else continued = true;
      resolve();
    };
    limit(req, response.result, next);
    const poll = () => {
      if (continued || response.raw.body) resolve();
      else setTimeout(poll, 0);
    };
    poll();
  });
  return { ...response, continued };
}

describe('production security hardening', () => {
  it('sets defensive API headers', () => {
    const response = responseStub();
    const next = vi.fn();
    securityHeaders({} as Request, response.result, next);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks requests after the configured local limit', async () => {
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const limit = createRateLimit({ prefix: `test-${Date.now()}`, windowMs: 60_000, maxRequests: 2 });
      expect((await invokeLimit(limit, '203.0.113.9')).continued).toBe(true);
      expect((await invokeLimit(limit, '203.0.113.9')).continued).toBe(true);
      const blocked = await invokeLimit(limit, '203.0.113.9');
      expect(blocked.continued).toBe(false);
      expect(blocked.raw.statusCode).toBe(429);
      expect(blocked.raw.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(blocked.headers.get('retry-after')).toBeTruthy();
    } finally {
      if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
      if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    }
  });

  it('redacts credentials and personal email from telemetry', () => {
    const output = redactSensitiveText('Bearer abc.def user@example.com password=Secret123 token=abc123');
    expect(output).not.toContain('abc.def');
    expect(output).not.toContain('user@example.com');
    expect(output).not.toContain('Secret123');
    expect(output).toContain('[REDACTED]');
  });
});
