type OperationalEvent = {
  event: string;
  level?: 'info' | 'warn' | 'error';
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  code?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

const webhookDeduplication = new Map<string, number>();

export function redactSensitiveText(value: unknown, maxLength = 1_000): string | undefined {
  const input = String(value || '').trim();
  if (!input) return undefined;
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/([?&](?:token|key|secret|password|access_token|refresh_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/("?(?:token|secret|password|apiKey|accessToken|refreshToken)"?\s*[:=]\s*)["']?[^,"'\s}]+/gi, '$1[REDACTED]')
    .slice(0, maxLength);
}

function sanitizedEvent(input: OperationalEvent) {
  return {
    level: input.level || 'error',
    event: String(input.event || 'unknown').slice(0, 80),
    requestId: String(input.requestId || '').slice(0, 128) || undefined,
    method: String(input.method || '').slice(0, 16) || undefined,
    path: String(input.path || '').slice(0, 300) || undefined,
    status: Number(input.status || 0) || undefined,
    code: redactSensitiveText(input.code, 100),
    message: redactSensitiveText(input.message, 1_000),
    metadata: input.metadata
      ? Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [
        key,
        typeof value === 'string' ? redactSensitiveText(value, key === 'stack' ? 4_000 : 1_000) : value
      ]))
      : undefined,
    service: 'phonehouse-crm-api',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE || 'local',
    timestamp: new Date().toISOString()
  };
}

export function reportOperationalEvent(input: OperationalEvent): void {
  const event = sanitizedEvent(input);
  const logger = event.level === 'error' ? console.error : event.level === 'warn' ? console.warn : console.info;
  logger(JSON.stringify(event));

  const webhookUrl = String(process.env.OBSERVABILITY_WEBHOOK_URL || '').trim();
  if (!webhookUrl || event.level !== 'error') return;

  const fingerprint = `${event.event}:${event.code || ''}:${event.path || ''}`;
  const now = Date.now();
  const lastSent = webhookDeduplication.get(fingerprint) || 0;
  if (now - lastSent < 60_000) return;
  webhookDeduplication.set(fingerprint, now);

  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3_000)
  }).catch(error => {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'observability_webhook_failed',
      message: error instanceof Error ? error.message : String(error)
    }));
  });

  if (webhookDeduplication.size > 1_000) {
    for (const [key, sentAt] of webhookDeduplication) {
      if (now - sentAt > 3_600_000) webhookDeduplication.delete(key);
    }
  }
}
