# Keeping temuby.dz while making shopping reliable

This is a decision plan, not a claim that the current puzzle/login problem is solved. It describes what is technically possible and how to choose without another speculative rewrite.

## Plain-English explanation and the latest concrete fix

Our server is a courier: your browser asks our server, and our server asks Temu. Temu sees the courier's internet connection. Sending a field containing your IP does not turn that connection into yours. Even when both devices share a home IP, the server's way of making the connection and the rewritten browser page can differ from normal Chrome. These differences are possible contributors, not a proven explanation for every puzzle.

The practical first step is to stop introducing unnecessary differences. A concrete defect was found in the installed networking library: Undici fetch replaces the browser's Sec-Fetch-Mode with its own cors value. A page-opening request originally labelled navigate could therefore be sent with inconsistent metadata. The transport now restores the mode actually supplied by the browser at final dispatch. It does not invent a browser identity or verification proof. All 86 tests pass, including real local HTTP receipt checks for navigation/background modes, cookies, POST bytes and redirects. The customer server has not been restarted to activate this source change; no reduction in Temu puzzles is claimed.

Keeping our domain in a normal browser limits what can move directly to the customer device. Ordinary public files can sometimes load directly. Reading Temu's full signed-in site requires its cooperation or an installed component with suitable access. A real remote browser is another design to evaluate if the current rewrite remains unreliable, but its connection still comes from the server and it has a running cost. Neither option is an instant invisible-proxy setting.

## The constraint we cannot remove with a server setting

A normal page on temuby.dz cannot freely read Temu's authenticated HTML, APIs, cookies or a cross-origin frame. Browser same-origin/CORS rules apply. Fetching with no-cors does not give our JavaScript a readable response. Changing the address to our domain also changes the browser origin; a rewriting proxy cannot be completely invisible to every browser API and security mechanism.

Sources: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy and https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS.

Sending an X-Forwarded-For header does not make a server connection originate from the user's IP. Merchant acceptance of forwarded headers requires its own trust configuration. To use the user's actual network, requests must actually leave through the user's device/network.

Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For.

## Feasible choices

| Design | What the user sees | Who contacts Temu | Main tradeoff |
| --- | --- | --- | --- |
| Current rewriting proxy | temuby.dz and our companion | Our server, with merchant code running in the user's browser | No installation, but origin/cookie/browser/network compatibility is difficult. |
| Current proxy with a tested browser-profile network client | temuby.dz and our companion | Our server using a different TLS/HTTP client | Can make the connection layer closer to Chrome; does not repair origins, cookie state or JavaScript context, and does not use the customer's IP. |
| Temu-supported cross-origin/API integration, if available to us | Our own interface on temuby.dz | Browser for supported direct endpoints, or our server for server APIs | Best-defined integration boundary, but requires merchant support and does not give us permission to read arbitrary Temu pages. Availability is not established. |
| Real remote browser per customer | temuby.dz showing a remote shopping surface plus our companion | That isolated remote browser | Browser executes the merchant site and makes its requests together; server IP and challenge risk remain. More CPU/RAM, input/display transport, isolation and accessibility work. |
| Customer-installed extension/local app | TEMBY business interface; merchant browsing in its genuine browser/app context | Customer's device/network | Genuine user IP and fewer rewriting differences. Requires installation; an extension alone does not promise a Temu page under our address bar. |

An Android app can brand its interface as TEMBY while a merchant WebView loads the genuine merchant origin. That is an installed app, not a normal browser page magically retaining temuby.dz for arbitrary Temu content. It needs strict origin-scoped communication and real merchant compatibility tests.

Source: https://developer.android.com/develop/ui/views/layout/webapps/webview.

## What a transparent tunnel can and cannot do

An ordinary HTTPS CONNECT tunnel can preserve the browser's TLS/HTTP connection to the destination instead of having Node terminate and recreate merchant HTTPS. Temu still sees the tunnel's outgoing network address. The browser is still visiting the destination origin, and the tunnel cannot simply inject our companion into that encrypted page. It therefore does not by itself satisfy the domain-and-companion requirement.

Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Proxy_servers_and_tunneling.

## Recommended sequence

### Step 1 — Establish the failing operation in the current proxy

Use the connected physical Samsung and a desktop mobile viewport. Record one user action at a time: initial load, product open, size selection/add, search, cart open. Retain successful API metadata as well as failures; images/telemetry must not push that sequence out of diagnostics. Record no raw credentials, proof values or cart bodies.

Keep separate conclusions for:

- Merchant operation succeeded but companion missed it.
- Merchant returned an application failure inside HTTP 200.
- Merchant returned HTTP 403/424/429.
- Our own relay denied a host or failed a request.
- Verification page appeared after a later navigation.

Do not interpret an undocumented numeric merchant code as a known bot reason.

### Step 2 — Audit genuine state continuity

Compare the genuine browser request context with what the relay forwards: original URL/method/body, mapped Origin/Referer, actual browser headers, cookie domain/path/expiry ordering, response-cookie commitment and redirects. Check whether navigation or a second tab changes the local session unexpectedly. Use safe equality/count/change metadata; never fabricate proof tokens or log their values.

Test one existing successful session and, separately, one fresh guest session. A fresh browser context has different merchant state, so two such visits alone do not prove an IP or transport cause. Only the customer handles any challenge/login. Stop on refusals instead of retrying repeatedly.

### Step 3 — Complete mobile cart observation

The current observer recognizes cart_modify. A mobile add can succeed while no full supported cart response has been observed and no scdb snapshot has been written. A cart-count response alone cannot establish the total or selected lines.

V40 correction: the observer now also inspects the merchant uranus_cart namespace. It accepts only the existing supported full envelope. This removes a path filter; the actual mobile initialization/add response still needs to be established.

Capture the actual successful mobile add and cart-read contracts. Then recognize the additional proven response paths and normalize their supported schema. Establish an initial complete snapshot and refresh it on successful cart operations without periodic merchant polling. If a separate initial read is necessary, identify a legitimate read-only merchant operation first; deduplicate it, bound it, and stop on refusal. Do not invent a total from item count or price sums, or silently navigate a hidden cart page that could trigger another challenge.

### Step 4 — Decide whether to retain the current proxy

Retain it only after the physical phone can perform repeated product/search/add/cart/reload flows, preserve a customer-completed verification session, and show a matching companion estimate. Known failures need clear behavior; passing our own fixture pages is insufficient.

If state/rewriting defects explain failures, repair them with reproduced cases. If genuine browser-versus-server connection differences remain the blocker, do not keep adding header impersonation switches.

Before a full rebuild, make one isolated transport experiment: compare the current client against a maintained browser-profile TLS/HTTP client with the same legitimate request context. curl_cffi documents browser TLS/JA3 and HTTP/2 profile support, and impers is its JavaScript-family alternative. No such dependency has been installed or enabled here. First validate safety constraints, proxy host/DNS checks, body/cookie fidelity, cancellation, compression and streaming on owned fixtures; then make a bounded merchant comparison without retrying refusals. Treat a lower challenge count in one session as inconclusive, and do not claim the library reproduces the entire user browser.

Primary references: https://github.com/lexiforest/curl_cffi and https://github.com/lexiforest/impers . The installed Undici code already supports HTTP/2 by default; simply enabling HTTP/2 is not an established missing fix.

### Step 5 — Prototype one alternative before rebuilding

If browser-only access under temuby.dz is mandatory, the next alternative to evaluate is one isolated real remote-browser session with TEMBY displayed around it. Merchant scripts, cookies and requests must all belong to that same browser. Merely replacing Node fetch with browser fetch while keeping half the session in the customer browser can introduce another mismatch.

Measure interaction latency, memory per active customer, normal shopping correctness and whether customer-completed verification persists. No guarantee of fewer challenges is made. Do not migrate or scale without these measurements.

If the user's genuine IP is mandatory, evaluate a customer-installed component instead, and explicitly accept its installation and mobile-support tradeoffs. This is a product decision, not a backend flag.

## Launch acceptance

Require physical Samsung success and desktop success for initial browsing, product/variant selection, adding/removing/changing quantity, selected/unselected sold-out lines, cart initialization, search, reload, multiple tabs and idle/resume. Follow a customer-completed challenge with several normal operations and verify it is not immediately lost. Compare merchant totals with the companion. Record API and local errors separately.

Payment remains a separate gate: durable sessions, trusted server quotes, account recovery, confirmed shipping and fulfillment must be completed before accepting real orders.
