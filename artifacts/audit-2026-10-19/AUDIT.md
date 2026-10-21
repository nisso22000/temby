TEMBY diagnostic audit — 19 October 2026

The audit added reproducible diagnostics only. Production source, configuration, dependencies and the running customer server were not changed or restarted. Existing unrelated artifacts and contracts were left intact.

**Scope and confidence**

- All 64 existing regression tests pass. TypeScript checks pass.
- Node-based synthetic tests exercised the actual relay, cart adapter, cache and cooldown behavior.
- An isolated Edge browser exercised the full UV path with owned desktop and Pixel 7 emulation fixtures.
- Bounded fresh-session live checks covered desktop/mobile storefront loading and one mobile cart-page navigation. No customer cookies or credentials were imported; no login, purchase, cart mutation or CAPTCHA completion was performed.
- Native browser probes tested public CDN delivery from an owned local origin without UV interception. Downloaded merchant JavaScript was not executed in these probes.
- The real phone was not connected to these tools. Fresh-session tests do not establish behavior for a signed-in, populated customer cart.

**1. Client-side cart data is editable; confirmed in the browser**

On both desktop and mobile fixtures, the visible-page fallback initially read EUR 20.92 and displayed 6,040.65 DZD with the configured conversion and 5% service. Editing the visible total to EUR 0.01 changed the companion estimate to 2.89 DZD. The same DOM edit did not override a valid structured live snapshot.

Separately, modifying the structured fixture's net and its matching cross-check amount to one cent was accepted by the client parser. Consistency checks detect malformed or conflicting data, not merchant authenticity. Browser database records, messages and client code are also under the browser user's control.

Impact: client estimates, readiness flags and minimum checks must never authorize a payable quote or fulfillment. No payment implementation currently exists, so this audit did not demonstrate an actual underpayment exploit. Removing the DOM fallback alone does not establish a security boundary. A future quote needs independent server-side validation of merchant state, currency, quantities, eligibility and fees, bound to the relevant session and an expiring quote identifier.

**2. A concrete mobile cart endpoint is missed**

The live mobile cart page requested:

`/api/bg/bg-uranus-api/uranus_cart/cart_modify`

The current observer requires `/cart_modify/` with a trailing slash. It therefore rejects this bare endpoint. The desktop-style `/cart_modify/pc_side_bar` is recognized. Synthetic browser tests using valid identical payloads confirmed that the supported route produces source `response`, while the bare endpoint falls back to source `page` on the owned full-cart fixture.

Remedy: support the exact observed bare endpoint as well as known child routes, while retaining host, HTTP status, JSON, success and schema validation. Avoid broad matching of every URL containing the word cart.

**3. Mobile also encounters real merchant rejection**

The fresh mobile cart run made 72 upstream requests and stopped after cart responses were observed. It received:

- `cart_modify`: HTTP 403, `success: false`, no cart result.
- `user_cart_num`: HTTP 200, `success: true`, a different result schema without `cartListInfo`.
- `passport/token/touch`: HTTP 424 twice.
- search activation: HTTP 429 without Retry-After.
- Navigation eventually reached `login.html`.

The successful count response contains keys such as `all_amount_sum`, `sku_amount_sum`, `cart_goods_num_map` and `cart_sku_num_map`. Their names alone are insufficient evidence of payable money semantics; do not feed them into the price parser by guesswork.

The desktop storefront run also observed HTTP 200 with `success: false` from the recognized sidebar cart endpoint. Fixing route recognition cannot make a rejected response into a valid cart. These tests establish both a local compatibility defect and upstream authentication/verification failures; they do not establish their complete causal relationship or identify an IP-only cause.

**4. IndexedDB discovery defect is reproducible**

When `indexedDB.databases()` is absent, the adapter attempts only `scdb`, missing the known `https://www.temu.com@scdb` name. The synthetic test recorded the actual attempted name. Safely attempt the known scoped database without requiring enumeration, preserving the behavior that aborts accidental database creation. Cover enumeration absence, rejection, blocked/open errors, cleanup and fallback selection.

**5. Cart/minimum parsing and freshness gaps**

- Numeric `strongThreshold: 3000` becomes minimum 3000; the otherwise identical string `"3000"` becomes null. Monetary totals already accept some numeric strings, making this handling inconsistent.
- Missing/unparsed minimum means no minimum blocker. Separate unknown merchant eligibility from confirmed eligibility. A TEMBY business minimum must be a distinct policy, not presented as merchant evidence.
- `strongThreshold` is present in the existing parser and representative fixture; this audit did not obtain a successful live cart response that independently validates its business meaning and units.
- A newer-timestamp canonical cache candidate can displace a live candidate. The synthetic case selected a cached amount of 100 over the older-started live amount of 2092. Define explicit live/cache precedence and invalidation, rather than relying solely on timestamps across sources.
- Only USD/EUR are supported; a valid-looking GBP fixture is rejected. Verify actual mobile currency before expanding support.
- `invalidGoodsLines > 0` blocks Next after the click with generic wording. No selected-line attribution or exact invalidity reason is established by that aggregate field alone. Improve pre-click explanation and a cart-review action after validating its semantics.

**6. Concurrent cache misses duplicate upstream work**

Twenty simultaneous identical requests for one eligible public image produced twenty upstream calls and a peak of twenty header-stage calls in flight. A subsequent warm request made zero additional upstream calls.

This proves missing in-flight coalescing, not that every real page is downloading twenty copies of one image. Add coalescing only for eligible equivalent public reads. Do not deduplicate arbitrary POSTs, authenticated APIs or requests with different response variants. Handle subscriber cancellation so one canceled reader does not terminate every subscriber.

The source also has no explicit application-level concurrency ceiling. Introduce bounded scheduling carefully, with navigation/critical resources prioritized and cancellation of abandoned reads. Node sockets and actual body concurrency need separate measurement; the recorded live peak of six is header-stage concurrency, not a whole-response memory measurement.

**7. Cooldown identity and observability defects**

Two POSTs to the same URL with bodies `first` and `different` were tested. The first upstream response was a 429 with Retry-After. The second never reached upstream and received the first POST's retained body. The key includes method and full URL, not body or authentication-state generation.

Two client-visible 429s generated only one recorded failure event. This explains why browser counts cannot be compared directly with existing health counts.

Remedies: define cooldown scope deliberately, distinguish replays from upstream calls, account for body/session-state differences when retaining operation-specific responses, and impose a byte budget. The current maximum is sixteen retained bodies per session, each potentially near the 12 MiB response limit. WeakMap lifetime management is present; this is a memory-budget concern rather than proof of an unbounded leak. Never solve this by automatically retrying login/cart writes.

**8. Direct browser delivery is distinct from streaming**

Direct: browser -> public CDN. The TEMBY relay carries no request/body for that resource.

Streaming: browser -> TEMBY -> CDN, progressively. TEMBY still carries the traffic and maintains connections.

Confirmed native browser probes:

- An observed public stylesheet from `static.kwcdn.com` returned CORS-readable HTTP 200 and loaded through a native stylesheet element from the owned local origin, with no UV relay interception.
- A public script sample from `static.kwcdn.com` returned CORS-readable HTTP 200 with `Access-Control-Allow-Origin: *`. It was not executed. This proves delivery feasibility, not that it can safely skip UV rewriting.
- The direct local fixture generated zero relay calls during its benchmark.

Actual public image/font/media delivery was not covered by these particular native probes. It remains a candidate requiring category-specific validation, not a measured universal capability.

Implement one resource-routing policy with `direct`, `relay-stream`, `relay-buffer` and `blocked` decisions. Consider origin, destination, public/authenticated state, credentials, transformation requirements, CORS, CSP, integrity and range semantics. Public images/styles/fonts/media and untouched downloads are candidates. HTML and rewritten JavaScript generally remain in the transformation pipeline. A direct request's browser cookies/IP/referrer differ from the Node relay's state. Do not weaken merchant security policy to force direct loading. Avoid duplicate fallback requests for mutations.

**9. Streaming benchmark: earlier delivery, not a page-speed promise**

A 512 KiB owned fixture emitted four paced chunks; three samples were taken per path. Medians:

| Current path | First payload bytes | Complete body |
| --- | ---: | ---: |
| Image streaming | 62 ms | 212 ms |
| CSS buffering | 217 ms | 222 ms |
| JavaScript buffering | 198 ms | 203 ms |
| JSON buffering | 226 ms | 242 ms |
| Direct local fixture | 55 ms | 201 ms |

These small local samples demonstrate the mechanisms, not a statistically established Temu speedup. Different content categories were used with the same paced body. A direct path removes relay bandwidth even when complete-download time barely changes. Streaming chiefly advanced byte availability here; it did not make upstream generate the whole response sooner.

CSS is a strong additional streaming candidate because the existing worker preserves stylesheet bytes. Executable rewriting requires complete inputs today. Large media/downloads also need deliberate range and size handling: the current generic 12 MiB decoded limit and 25-second overall upstream timeout are not a general media transport design.

**10. Established tracking lists match significant observed traffic**

The current EasyPrivacy list was fetched and contains rules for `pftk.temu.com`, `thtk.temu.com`, and Temu's `/api/adx/` paths. They match the following observed upstream calls:

| Bounded run | Requests matching those rules | Observed upstream requests |
| --- | ---: | ---: |
| Desktop storefront | 23 | 100 |
| Mobile storefront | 44 | 100 |
| Mobile cart navigation | 31 | 72 |

These are observed request counts, not transfer-byte percentages or measured speed gains. The two storefront runs exhausted a 100-request budget; subsequent synthetic 503s contaminated later page-error/telemetry behavior. Do not use their console-error counts as a merchant compatibility baseline. The cart run stopped naturally after cart responses, without exhausting the budget. Matching a maintained list makes these sensible controlled-blocking candidates; it does not prove zero application side effects.

Use a maintained compatible network-rule engine with exceptions and original virtual URLs/resource context. The existing host allowlist permits all Temu/kwcdn subdomains, so it permits this first-party tracking traffic. EasyPrivacy/EasyList/uBlock lists are not interchangeable with a host security allowlist. Start with measured network filtering, not unsupported scriptlets or cosmetic rules.

Sources: https://easylist.to/easylist/easyprivacy.txt ; https://github.com/easylist/easylist/blob/master/easyprivacy/easyprivacy_specific.txt

**11. Additional architecture and performance observations**

- `/_relay` is one transport POST per proxied upstream request. Its POST method does not imply an upstream mutation. Large counts alone are expected; measure original destinations, initiators, duplicates and cancellation.
- The injected helper sources total approximately 855,078 bytes before escaping. `companion-icon.js` alone is 320,260 bytes. They are fetched/cached by the worker and inserted into generated documents; this is not a claim of another 855 KiB server download on every navigation. Repeated document parsing/execution and in-memory representation remain costs worth profiling. A much smaller purpose-sized icon is an obvious asset improvement, subject to visual/CSP verification.
- The companion polls page state every 500 ms and scans up to 800 IndexedDB records every two visible seconds. Work is bounded but should move toward targeted observation and less frequent recovery scans. This audit did not measure real-phone CPU/battery use.
- Server sessions last one idle hour and are in memory. Restart loses merchant cookie jars while browser storage survives. Address readiness is a customer confirmation, not independent order-address validation. These are pre-production reliability boundaries.
- Merchant service workers, shared workers and WebSockets remain unsupported. Preserved CSP can conflict with injected helpers. Compatibility should be improved from reproduced failures; do not claim indistinguishability from direct browsing.
- Third-party sign-in is not disabled: the allowlist still permits the three explicit Google/Facebook/Apple integration hosts, and no comprehensive email/password-only UI/network policy exists.

**Recommended implementation order**

1. Fix observed mobile endpoint recognition and IndexedDB discovery; add focused regression cases.
2. Add redacted source/rejection diagnostics for cart responses and request outcomes, including HTTP-200 application failures, cooldown replays and cache hits. Investigate token/cookie/origin continuity with a successful customer-cart comparison.
3. Normalize validated minimum representations, represent unknown eligibility, and define live/cache/session invalidation explicitly. Preserve a server-authority boundary for future quotes.
4. Correct cooldown identity/budgets and add eligible public-read coalescing plus carefully prioritized concurrency control.
5. Enforce email/password-only sign-in deliberately, including usable UI behavior.
6. Introduce resource routing, first enabling verified direct public resources and additional unchanged-body streaming behind measurable switches.
7. Trial maintained network blocking with exceptions and repeat the browsing/search/cart/login matrix. Optimize helper/icon size and polling based on profiles.

**Reproduction and evidence**

Commands:

```
npm test
npm run typecheck
node --import tsx scripts/audit-diagnostics.mjs
node --import tsx scripts/audit-browser.mjs
node --import tsx scripts/audit-browser.mjs --live --cart-only
node --import tsx scripts/audit-assets.mjs
```

The browser scripts use the installed bundled Playwright package and local Edge. Live modes perform real bounded browsing and should not be run repeatedly while verification is active. All test listeners close after execution. The customer server is separate.

Evidence files in this directory: `synthetic-results.json`, `browser-synthetic-results.json` (corrected UTF-8 fixture), `browser-results.json` (initial budget-limited storefront observations), `browser-live-cart-results.json`, `direct-assets-results.json`, `summary.json`, `helper-sizes.json`, and `existing-server-health.json`. Earlier browser-run synthetic fallback timing/encoding observations are superseded by `browser-synthetic-results.json`. Browser-reported `serviceWorker: false` inside proxied pages describes UV's virtualized page API; successful source `response` proves the underlying worker pipeline ran. It must not be interpreted as absence of the controlling native worker.

Open questions: successful populated mobile cart schema/minimum semantics, challenge causes for the user's actual session/IP, real-phone behavior, real-user blocking side effects, and end-to-end speed/CPU/bandwidth gains after implementation. No universal compatibility or CAPTCHA elimination is established.
