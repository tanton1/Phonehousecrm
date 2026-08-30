const target = String(process.argv[2] || process.env.PHONEHOUSE_PUBLIC_URL || '').replace(/\/$/, '');

if (!target || !/^https:\/\//i.test(target)) {
  console.error('Usage: npm run verify:production -- https://phonehousedn.vercel.app');
  process.exit(1);
}

const requiredPageHeaders = [
  'content-security-policy',
  'permissions-policy',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options'
];

async function fetchWithTimeout(path) {
  return fetch(`${target}${path}`, {
    redirect: 'follow',
    headers: { Accept: path.startsWith('/api/') ? 'application/json' : 'text/html' },
    signal: AbortSignal.timeout(15_000)
  });
}

const failures = [];

const page = await fetchWithTimeout('/');
if (!page.ok) failures.push(`GET / returned ${page.status}`);
const html = await page.text();
if (!/PhoneHouse CRM/i.test(html)) failures.push('Production HTML is missing PhoneHouse branding.');
for (const header of requiredPageHeaders) {
  if (!page.headers.get(header)) failures.push(`Production page is missing ${header}.`);
}

const health = await fetchWithTimeout('/api/health');
if (!health.ok) failures.push(`GET /api/health returned ${health.status}`);
const healthBody = await health.json().catch(() => null);
if (healthBody?.status !== 'ok') failures.push('Health response is not status=ok.');

const ready = await fetchWithTimeout('/api/ready');
if (!ready.ok) failures.push(`GET /api/ready returned ${ready.status}`);
const readyBody = await ready.json().catch(() => null);
if (readyBody?.status !== 'ready') failures.push('Readiness response is not status=ready.');

const unauthenticated = await fetchWithTimeout('/api/users/me');
if (unauthenticated.status !== 401) failures.push(`GET /api/users/me without token returned ${unauthenticated.status}, expected 401.`);
if (!(unauthenticated.headers.get('content-type') || '').includes('application/json')) {
  failures.push('Unauthenticated profile endpoint did not return JSON.');
}

if (failures.length) {
  failures.forEach(failure => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log(`Production verification passed: ${target}`);
