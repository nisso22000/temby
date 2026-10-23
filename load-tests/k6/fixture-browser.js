// Browser-level regression test: it drives the real service worker and
// rewriting client. Keep this deliberately small; browser VUs are expensive.
import { browser } from 'k6/browser';
import { check } from 'k6';

const base = __ENV.TEMBY_TEST_BASE_URL || 'http://127.0.0.1:3001';
const parsed = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('Browser fixture test accepts only localhost.');
if (__ENV.TEMBY_FIXTURE_CONFIRM !== 'OWNED_FIXTURE_ONLY') throw new Error('Set TEMBY_FIXTURE_CONFIRM=OWNED_FIXTURE_ONLY.');

export const options = {
  scenarios: {
    browser_fixture: {
      executor: 'shared-iterations',
      vus: Number(__ENV.BROWSER_VUS || 1),
      iterations: Number(__ENV.ITERATIONS || 3),
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: { checks: ['rate==1.0'] },
};

export default async function () {
  const page = await browser.newPage();
  try {
    await page.goto(`${base.replace(/\/$/, '')}/uv/?fixture=1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => location.pathname.startsWith('/uv-service/'), { timeout: 30000 });
    await page.goto(`${base.replace(/\/$/, '')}/uv-service/${encodeURIComponent('https://fixture.temby.invalid/load/catalog')}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#status', { timeout: 30000 });
    const status = await page.locator('#status').textContent();
    check(status, { 'owned fixture rendered through TEMBY': (value) => value.includes('Loaded 180') });
  } finally {
    await page.close();
  }
}
