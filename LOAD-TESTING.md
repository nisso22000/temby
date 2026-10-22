# Load testing: safe staged plan

This plan measures TEMBY without generating artificial Temu traffic or trying
to work around merchant puzzles. A passing load result is not evidence that
Temu will accept the same amount of real traffic.

## What “flow” means

The word people usually mean is **bandwidth** (bytes per second), also called
network throughput or egress. When a browser downloads a 2 MB image through
the proxy, the VPS receives roughly 2 MB from the CDN and sends roughly 2 MB to
the browser. That is about 4 MB of traffic crossing the VPS interfaces for one
2 MB asset, in addition to CPU work for TLS, rewriting, buffering, and logging.

Direct browser CDN loading changes that shape: the browser fetches eligible
public CDN assets from the CDN itself, so the VPS does not carry those bytes.
It does not apply to HTML, login, cart APIs, authenticated/signed resources, or
ordinary rewritten scripts.

## The two comparison runs

Use these exact modes, changing one deployment setting set at a time and
allowing a new browser profile for each browser-level run:

| Run | `TEMBY_DIRECT_ASSETS` | `TEMBY_FILTER_MODE` | Meaning |
| --- | --- | --- | --- |
| Baseline | `0` | `off` | CDN resources relay through TEMBY; merchant telemetry is allowed. |
| Treatment | `1` | `balanced` | Eligible public CDN resources can bypass TEMBY; only the reviewed optional telemetry patterns are blocked. |

The current live setting is the baseline. “Telemetry off” is ambiguous, so this
table uses the actual configuration names: `off` means filtering is off, not
that merchant telemetry itself is disabled.

Do not make a conclusion from a single run. Run each scenario at least three
times after a warm-up, record median values, and keep the same route mix,
virtual-user count, duration, VPS size, and Cloudflare setting. A direct-CDN
comparison needs real browser traffic because an HTTP-only load generator does
not execute the browser resource-policy code.

## Stage A: server/session capacity (safe to run now)

`scripts/load-session.mjs` creates separate opaque browser sessions, requests
only TEMBY's own `/uv/` and `/uv/boot.js` files, and writes harmless runtime
events. It never calls `/_relay`, Temu, kwcdn, or a customer account.

Run the generator from a machine **other than the VPS** for a meaningful user
network measurement. A generator running on the VPS competes for its CPU and
network, so it is useful only as a smoke check.

Example from Windows after Node 22 is installed:

```powershell
node .\scripts\load-session.mjs --base-url https://merchant.temudz.store --vus 25 --duration-seconds 30 --ramp-seconds 10 --confirm --out .\artifacts\load\session-smoke.json
```

Increase gradually: 25, 100, 250, 500, 1,000, then 2,000 virtual users. Do not
jump directly to 2,000. Stop the run if 5xx errors rise, p95 grows sharply,
or VPS memory/CPU becomes sustained rather than briefly spiky.

On the VPS, sample resource use while a separate generator runs:

```bash
scripts/capture-load-metrics.sh artifacts/load/session-100 -- sleep 120
```

For a VPS-local smoke run, replace `sleep 120` with the `node` load command.
It is intentionally not a valid 2,000-user capacity result.

## Stage B: browser resource-flow comparison

Use a separate, controlled browser-load runner and an owned fixture origin.
It must load a representative page mix—HTML, rewritten scripts, images, CSS,
fonts, and optional telemetry calls—without using Temu. Record:

- p50/p95/p99 document and resource timing;
- TEMBY/Caddy/Redis CPU and RAM;
- host RX/TX bytes and container network bytes;
- 2xx/4xx/5xx/timeout rates;
- direct-delivery success and fallback counts;
- session cookie violations (must remain zero for local static assets).

Only after Stage A is stable should we add this browser fixture. It needs a
dedicated test hostname/origin and must remain disabled from the public
production service. That avoids turning a benchmark convenience into an open
proxy path.

## Interpretation rules

- 2,000 connected sessions is not 2,000 simultaneous merchant downloads.
- A passing static/session run proves Redis and local infrastructure behavior;
  it does not prove merchant compatibility, login reliability, or CAPTCHA
  behavior.
- Compare **bytes per completed page**, not only requests/second. Direct CDN
  delivery is useful only if it reduces VPS egress without increasing failures
  or fallback double-downloads.
- The treatment may be faster, slower, or identical. Filtering can reduce work,
  but it can also affect merchant behavior; do not assume it helps.
