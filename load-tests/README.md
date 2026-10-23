# TEMBY owned-fixture load tests

These tests are intentionally **not** a Temu load test. They drive TEMBY's
real relay path with generated content owned by this repository: an HTML
catalogue, 180 KB JavaScript, 30 KB CSS, a 90 KB JSON catalogue, and image
resources. They test relay handling, session state, resource rewriting and
proxy-to-browser traffic without sending synthetic traffic to a third party.

They do not copy Temu pages, JavaScript, merchant-only request formats,
security controls, CAPTCHA behaviour, or protected assets. Therefore a pass
means “TEMBY handled this stated workload”, not “Temu will accept 2,000 users.”

## Run locally

Use a non-production shell. The application refuses the fixture flag when
`NODE_ENV=production`.

```powershell
$env:NODE_ENV = 'development'
$env:TEMBY_OWNED_FIXTURES = '1'
$env:PUBLIC_APP_ORIGIN = 'http://127.0.0.1:3000'
$env:PUBLIC_MERCHANT_ORIGIN = 'http://127.0.0.1:3001'
npm run dev:fixture
```

In another shell, with Docker installed:

```powershell
docker run --rm --network host -e TEMBY_FIXTURE_CONFIRM=OWNED_FIXTURE_ONLY -e VUS=25 -e HOLD=1m -v "${PWD}:/work:ro" -w /work grafana/k6:latest run load-tests/k6/fixture-protocol.js
```

For the browser regression test, use k6 with Chromium available and keep VUs
small. Browser testing confirms the service-worker/rewrite journey; the
protocol test is the capacity test.

```powershell
docker run --rm --network host -e TEMBY_FIXTURE_CONFIRM=OWNED_FIXTURE_ONLY -e BROWSER_VUS=1 -e ITERATIONS=3 -v "${PWD}:/work:ro" -w /work grafana/k6:latest run load-tests/k6/fixture-browser.js
```

Do not run either command against `temudz.store`, `merchant.temudz.store`, or
Temu. Before any external 2,000-user capacity claim, deploy this same fixture
only to a separate owned staging environment and run k6 from a separate load
generator. Keep production fixture support disabled.

## What k6 and Grafana each do

- **k6** is the traffic generator and scorekeeper. It starts virtual users,
  follows the script, measures requests, latency percentiles, errors and bytes,
  then fails the run when a declared threshold is missed.
- **Grafana** is the dashboard. It can receive and graph the results over time,
  but it does not create traffic and is not needed to run k6.

Start with k6’s terminal/JSON output. Add Grafana only after the test scenarios
and pass/fail targets are stable; do not run the dashboard on the 4-vCPU VPS
while measuring it.

## What a merchant sees

The proxy preserves separate TEMBY sessions and separate encrypted cookie jars
for each visitor. But outbound relay requests share the VPS's public IP.
Temu can therefore see many independent browser-like sessions arriving from
one network address. No load test can promise that a third party will accept a
given traffic level. Do normal, low-volume compatibility checks; seek written
merchant permission for any large-scale test of their systems; and never try
to defeat rate limits, verification, or CAPTCHA.
