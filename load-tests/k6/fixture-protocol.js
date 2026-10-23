// Protocol-level capacity test for the explicitly enabled, local owned
// fixture. This is intentionally unable to target public domains or Temu.
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.TEMBY_TEST_BASE_URL || 'http://127.0.0.1:3001';
const parsed = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
  throw new Error('This fixture test accepts only localhost. Do not point it at Temu or a public service.');
}
if (__ENV.TEMBY_FIXTURE_CONFIRM !== 'OWNED_FIXTURE_ONLY') {
  throw new Error('Set TEMBY_FIXTURE_CONFIRM=OWNED_FIXTURE_ONLY after starting the local fixture server.');
}
const relay = `${base.replace(/\/$/, '')}/_relay`;
const fixture = 'https://fixture.temby.invalid';

export const options = {
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '30s', target: Number(__ENV.VUS || 25) },
        { duration: __ENV.HOLD || '1m', target: Number(__ENV.VUS || 25) },
        { duration: __ENV.RAMP_DOWN || '15s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.99'],
  },
};

function relayGet(path, destination) {
  return http.post(relay, JSON.stringify({
    url: `${fixture}${path}`,
    method: 'GET',
    destination,
    engine: 'ultraviolet',
    headers: { accept: '*/*' },
  }), { headers: { 'content-type': 'application/json', origin: base }, tags: { endpoint: path, destination } });
}

export default function () {
  const documentResponse = relayGet('/load/catalog', 'document');
  check(documentResponse, { 'catalog relay returns 200': (r) => r.status === 200 && JSON.parse(r.body).status === 200 });
  const apiResponse = relayGet('/load/catalog.json', 'empty');
  check(apiResponse, { 'catalog API returns 200': (r) => r.status === 200 && JSON.parse(r.body).status === 200 });
  for (let index = 0; index < 4; index += 1) {
    const image = relayGet(`/load/media/${index}.svg`, 'image');
    check(image, { 'fixture image returns 200': (r) => r.status === 200 && JSON.parse(r.body).status === 200 });
  }
  sleep(Number(__ENV.THINK_SECONDS || 1));
}
