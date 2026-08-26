import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

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

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '');
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
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id, X-Telegram-Bot-Api-Secret-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = clientIp(req);
  const current = requestBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - bucket.count)));
  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', requestId: req.requestId });
  }
  if (requestBuckets.size > 10_000) {
    for (const [bucketKey, value] of requestBuckets) if (value.resetAt <= now) requestBuckets.delete(bucketKey);
  }
  next();
}

export function productionErrorHandler(error: any, req: Request, res: Response, _next: NextFunction) {
  const rawCode = String(error?.code || error?.message || 'INTERNAL_ERROR').split(':')[0].trim();
  const status = Number(error?.statusCode || error?.status || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  console.error(JSON.stringify({ level: 'error', requestId: req.requestId, method: req.method, path: req.path, code: rawCode }));
  if (res.headersSent) return;
  res.status(safeStatus).json({
    success: false,
    code: rawCode || 'INTERNAL_ERROR',
    message: safeStatus >= 500 ? 'Máy chủ gặp lỗi. Vui lòng thử lại.' : String(error?.publicMessage || error?.message || 'Yêu cầu không hợp lệ.'),
    requestId: req.requestId
  });
}
