import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { reportOperationalEvent } from '../observability';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 180;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let distributedRateLimitWarningLogged = false;
let distributedRateLimitDisabledUntil = 0;

type RateLimitOptions = {
  prefix: string;
  windowMs: number;
  maxRequests: number;
};

function clientIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '');
}

function rateLimitSubject(req: Request): string {
  return crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
}

async function incrementDistributedBucket(
  key: string,
  windowMs: number
): Promise<{ count: number; resetAt: number } | null> {
  const baseUrl = String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '');
  if (!baseUrl || !token) return null;
  if (distributedRateLimitDisabledUntil > Date.now()) return null;

  try {
    const response = await fetch(`${baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, windowMs, 'NX'],
        ['PTTL', key]
      ]),
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) throw new Error(`UPSTASH_HTTP_${response.status}`);
    const result = await response.json() as Array<{ result?: unknown; error?: unknown }>;
    if (!Array.isArray(result) || result.some(item => item?.error)) throw new Error('UPSTASH_PIPELINE_FAILED');
    const count = Number(result[0]?.result);
    const ttl = Number(result[2]?.result);
    if (!Number.isFinite(count)) throw new Error('UPSTASH_INVALID_COUNT');
    return {
      count,
      resetAt: Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs)
    };
  } catch (error) {
    distributedRateLimitDisabledUntil = Date.now() + 30_000;
    if (!distributedRateLimitWarningLogged) {
      distributedRateLimitWarningLogged = true;
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'distributed_rate_limit_unavailable',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    return null;
  }
}

function incrementLocalBucket(key: string, windowMs: number): { count: number; resetAt: number } {
  const now = Date.now();
  const current = requestBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (requestBuckets.size > 10_000) {
    for (const [bucketKey, value] of requestBuckets) {
      if (value.resetAt <= now) requestBuckets.delete(bucketKey);
    }
  }
  return bucket;
}

export function createRateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const subject = rateLimitSubject(req);
    const windowId = Math.floor(Date.now() / options.windowMs);
    const key = `phonehouse:ratelimit:${options.prefix}:${windowId}:${subject}`;

    void (async () => {
      const bucket = await incrementDistributedBucket(key, options.windowMs)
        || incrementLocalBucket(key, options.windowMs);
      const remaining = Math.max(0, options.maxRequests - bucket.count);
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1_000));

      res.setHeader('RateLimit-Limit', String(options.maxRequests));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1_000)));
      // Preserve the older headers for clients and dashboards already reading them.
      res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (bucket.count > options.maxRequests) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMITED',
          message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
          retryAfterSeconds,
          requestId: req.requestId
        });
      }
      next();
    })().catch(next);
  };
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const incoming = String(req.headers['x-request-id'] || '').trim();
  req.requestId = /^[a-zA-Z0-9_.:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.on('finish', () => {
    console.info(JSON.stringify({
      level: 'info',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    }));
  });
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function corsAllowlist(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin || '').trim();
  const configured = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const sameOrigin = !origin || origin === `${req.protocol}://${req.get('host')}`;
  const allowed = sameOrigin || configured.includes(origin) || (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  if (!allowed) {
    return res.status(403).json({ success: false, code: 'CORS_ORIGIN_DENIED', message: 'Nguồn truy cập không được phép.', requestId: req.requestId });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id, X-Firebase-AppCheck, X-Telegram-Bot-Api-Secret-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

export const apiRateLimit = createRateLimit({ prefix: 'api', windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS });
export const sensitiveRateLimit = createRateLimit({ prefix: 'sensitive', windowMs: 10 * 60_000, maxRequests: 20 });
export const clientTelemetryRateLimit = createRateLimit({ prefix: 'client-telemetry', windowMs: 60 * 60_000, maxRequests: 30 });

export function productionErrorHandler(error: any, req: Request, res: Response, _next: NextFunction) {
  const rawCode = String(error?.code || error?.message || 'INTERNAL_ERROR').split(':')[0].trim();
  const status = Number(error?.statusCode || error?.status || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  reportOperationalEvent({
    level: 'error',
    event: 'api_unhandled_error',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status: safeStatus,
    code: rawCode
  });
  if (res.headersSent) return;
  res.status(safeStatus).json({
    success: false,
    code: rawCode || 'INTERNAL_ERROR',
    message: safeStatus >= 500 ? 'Máy chủ gặp lỗi. Vui lòng thử lại.' : String(error?.publicMessage || error?.message || 'Yêu cầu không hợp lệ.'),
    requestId: req.requestId
  });
}
