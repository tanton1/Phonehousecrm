type ClientErrorInput = {
  name?: string;
  message: string;
  stack?: string;
};

const recentlyReported = new Map<string, number>();

export function reportClientError(input: ClientErrorInput): void {
  if (typeof window === 'undefined') return;
  const message = String(input.message || '').slice(0, 1_000);
  if (!message) return;

  const fingerprint = `${input.name || 'Error'}:${message}`;
  const now = Date.now();
  if (now - (recentlyReported.get(fingerprint) || 0) < 60_000) return;
  recentlyReported.set(fingerprint, now);

  const payload = JSON.stringify({
    name: String(input.name || 'Error').slice(0, 100),
    message,
    stack: String(input.stack || '').slice(0, 4_000),
    path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    release: String((import.meta as any).env?.VITE_VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 100)
  });

  void fetch('/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
}
