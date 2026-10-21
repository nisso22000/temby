# What changed, why, and what still does not work

This preserves the implementation inventory and explains the changes in plain English. Read the current result first; earlier sections record earlier findings.

## Current v48 result — one full-cart price source on desktop and mobile

The desktop sidebar commonly asks Temu for the full cart, while the mobile bubble asks for selected item counts. TEMBY accepts the same complete Temu cart API response on either device. The mobile count cannot supply a price: when its selected SKU quantities differ from the last confirmed full cart, TEMBY requests the complete cart through Temu's page client. A complete response from an add or delete updates immediately; a successful edit acknowledgement without a complete response triggers one full read. A saved account-scoped copy lets another page show the last confirmed cart and periodically recheck it.

The visible HTML bootstrap parser and five-second database scan are gone. This removes stale mobile cart-page state as a competing source. Live responses take priority over saved copies. Overlapping reads cannot undo a later completed edit, and logout blocks old in-flight responses. The companion shows an update warning if Temu rejects a needed read; it does not calculate a price from the bubble. Controlled desktop/mobile browser fixtures and all 100 tests pass. The physical Samsung failure and Temu's puzzles/login prompts remain unverified with this build. Do not treat this as launch approval yet.

## Current v47 result — recheck saved carts and cart edits

A new tab could keep showing the last amount saved by an older tab without checking Temu again. It now makes one fresh cart read when that saved response is at least 15 seconds old and the previous read attempt was at least 30 seconds ago. A successful edit that says only “done” now triggers a full read, including a delete with no operation number. A read only counts as complete after our worker publishes Temu's validated full cart. The controlled browser test covers a changed cart while the old tab was closed. The reported Samsung delete failure still needs a physical retest; cart reliability and puzzles remain launch checks.

A subsequently supplied real cart-page delete response already contained the complete cart and passed our validator. The acknowledgement fix above therefore does not explain that exact miss. We still need a captured trace showing where that accepted response stops on the way to the companion.

## Earlier v46 result — get the full cart through Temu's page client

The mobile homepage has a live request client we previously missed because its store location differs from the cart page. A real-phone read through that client returned the full cart from the homepage in about half a second. We now prefer that client when full cart data is needed, then validate and save its response through the existing response/database path.

For example, after removing an item, the companion asks for the whole cart and uses the total Temu returns. Overlapping changes share the work. A refusal stops that attempt, and leaving the page releases its pending read. Pages without a supported client retain the previous read path. All 97 tests and controlled desktop/mobile checks pass. The phone is disconnected today, so the integrated real-phone check is pending. This is progress toward reliability, not a launch-ready declaration.

Earlier v45 field report: cart updates remained intermittent, including adds and removals. Successful individual checks below do not establish general mobile reliability. Cart synchronization and puzzle/login behavior remain launch checks.

## Earlier v45 result — a verification change could make us discard the new price

The mobile problem was still intermittent after v44. Inspection found another code defect: we used Temu's verification ticket as part of the identity of the cart owner. If that ticket changed during a request, we treated the incoming price as belonging to someone else and discarded it.

We reproduced that failure before fixing it: four owned browser cases stayed at 0 even though the cart read returned the new price. With the correction, all four show the new amount. Verification tickets no longer define cart ownership. Real account credentials and guest cart IDs still keep carts separate; nothing changes the cookies sent to Temu.

We also corrected a misleading empty-cart case. If Temu confirms an add but then refuses the price refresh, the saved 0 now shows as stale. Ordinary fresh empty carts still get no warning. The warning survives navigation and clears after a later successful read. All 94 tests, TypeScript and the owned browser scenarios pass. The fresh Samsung session now passes after signup: adding on a product page updated the companion without visiting the cart. Guest access before signup was still obstructed by puzzles/login. Puzzles/login/429 reliability is unresolved, so this is not a launch-ready declaration.

## Earlier v44 result — mobile add could leave the old amount on screen

The customer successfully added an item in Samsung private Chrome, but TEMBY stayed at 0. That is a live update failure. Earlier tests proved initialization and retention, not this real add path.

Loaded mobile SDK code uses separate add endpoints without the operation field our refresh logic expected. We now recognize those endpoints directly. When Temu confirms a change but supplies no full cart, TEMBY reads the full cart once through the existing shared refresh. Counts and analytics do not trigger reads. Controlled fresh desktop/mobile tests pass 0 → populated updates without visiting the cart. All 93 tests and TypeScript pass. The real private-window retest is pending, so launch readiness is not established.

## Earlier v43 result — homepage initialization without a cart-page visit

The customer's requirement is to get and update the cart during ordinary shopping, including the first visit. V42's saved-copy fix did not meet that requirement by itself. The root mobile parser bug was then established: wire responses use snake-case field names such as cart_list_info, while our code required the SDK's camel-case cartListInfo. Successful mobile API responses were being discarded.

The parser now accepts both formats using the same strict financial and item checks. When no usable snapshot exists, the worker performs a read-only full-cart API request from the current page. It does not open a cart page, create an iframe, or read visible prices. The operation and full-data flag were verified in Temu's already-loaded public SDK code. The actual request succeeded on the connected phone.

Successful full mutation replies update directly. Recognized successful partial mutation acknowledgements trigger a coalesced full read; count-only replies do not. Concurrent changes share a read, with a follow-up only for changes that finished after that read began. A refusal stops the attempt. Initial failed attempts are remembered by identity to avoid navigation-triggered retries. This adds real network work when a snapshot is missing or a change lacks a full result; it is not periodic polling.

Physical Samsung check: only TEMBY's derived copy was cleared, then the existing homepage was reloaded. It obtained a nine-selected-item EUR 423.58 response and showed 122,308.73 DZD without requesting the cart document. Login and the Temu cart were not cleared or changed. This verifies getting a snapshot from scratch on the homepage. Real-phone add/remove reconciliation and broader puzzle reliability still need live verification.

All 91 tests pass. Owned desktop/mobile startup tests pass cold homepage initialization, partial-change refresh, bounded burst reads, no count polling and no automatic refusal retry. The earlier broader cart/database/minimum/resource browser checks also pass with the new fresh-cart behavior. Evidence: artifacts/improvements-v43/startup-browser.json and physical-homepage-startup.json.

## Earlier v42 result — cart retained while browsing

The v41 result was too narrow: it proved the cart page could be read, but its worker handoff deliberately excluded other pages and survived only in memory. The customer correctly reported that the companion lost the cart when browsing. That is now corrected.

Accepted cart responses are stored in a separate browser-local IndexedDB record and restored on shopping pages for the same merchant/account. Navigation and worker restart do not erase the last confirmed cart. They also do not refresh its timestamp. Raw authentication credentials are not stored with the cart. Logout clears the record and prevents late earlier responses restoring it; a known update failure remains a warning after navigation.

On the real Samsung, the cart already held nine selected items and EUR 423.58 before the test. After updating the worker, cart refresh → homepage → existing product → product reload all showed nine items and 122,308.73 DZD with no cart issue. No cart mutation, login, puzzle solving, purchase, cookie clearing or server restart was performed. Owned desktop/mobile fixtures also verify worker-stop/restart recovery and retained failure warnings. All 90 tests pass, with final targeted checks and TypeScript passing. Evidence is under artifacts/improvements-v42/.

This fixes losing the last verified cart when leaving the cart page. It does not prove that every real-phone add/remove/quantity-change response is understood, or obtain a total before any supported snapshot exists. Those remain explicit checks, alongside puzzle/login reliability.

## Earlier v41 result — mobile cart read verified on Samsung

The companion now reads the user's populated cart on the real Samsung. After the customer signed in normally, the page held a successful cart API packet inside its initial JSON. Our old reader missed it because it only watched later API calls and scdb, and mobile had no scdb copy. The parser itself accepted the eight-item packet.

The worker now reads that known packet directly from the cart document response, checks it with the existing strict parser, and makes it available when the new companion starts. It does not read visible prices, run merchant scripts, or request another cart. Old-navigation and other-origin packets cannot seed a new page.

One local browser-worker update and ordinary cart refresh verified eight selected items, EUR 421.06 and a TEMBY estimate of 121,581.08 DZD on Samsung. No server restart, logout, cookie clearing, purchase or cart mutation was performed. The bubble also sits above the merchant's bottom checkout controls. All 88 tests and owned desktop/mobile browser checks pass. Evidence: artifacts/improvements-v41/physical-phone-cart.json and browser-verification.json.

This fixes the observed initial mobile cart read. Repeated product/add/remove/quantity-change/search/idle flows and puzzle/session reliability still need verification. The separate server header correction remains tested source code pending activation; its effect on Temu is unmeasured.

## Earlier v40 investigation — 20 October 2026

Later physical-phone follow-up: the customer solved the puzzle and reached an eight-item cart, but the companion still showed — DZD. Two approximately 60 KB HTTP-200 cart responses were recorded as unsupported-schema; their actual format remains unverified. A subsequent captured refresh received token HTTP 424 and cart HTTP 403 before opening login. These are separate unresolved parsing/session issues. The mobile bubble also overlapped Temu's bottom checkout bar. Its source placement now reserves 64 pixels for bottom controls plus a 12-pixel gap; desktop/mobile fixture checks passed. The physical phone has not yet verified this layout update. See the follow-up section in MOBILE-INVESTIGATION.md. This remains a launch blocker for mobile cart reliability.

The visible physical Samsung was inspected without merchant interaction. The cart was populated according to the customer, but no supported scdb snapshot existed at the inspected origin and no full cart response had reached the companion. A product/size/add action appeared successful in Temu, then a later recommended-product navigation triggered verification. The missing companion snapshot and later token/API refusals are separate findings. Read MOBILE-INVESTIGATION.md for evidence and limitations, and PROXY-ARCHITECTURE-PLAN.md for the concrete domain/browser/IP decision plan.

A separate per-session API timeline now retains successes and refusals without image/telemetry eviction. The browser observer now includes the merchant uranus_cart namespace, with the same strict full-envelope validation. Count-only replies neither create a total nor invalidate/supersede a supported full snapshot. This removes an observation coverage gap, not a verified fix for the complete mobile initialization problem. No speculative initialization request, hidden cart page, or visible-price fallback was added.

The runtime was initially kept on the existing user server/session. Later inspection confirmed the API timeline is active in that session. Browser helper changes still need to be loaded before the physical phone can verify them. No server restart, login submission or challenge interaction was performed by the agent. Optional telemetry blocking and direct CDN loading remain off by default.

## Current v39 cart diagnosis — 20 October 2026

The user's example contains seven cart lines, with one unselected sold-out SKU whose amount is zero. The previous parser discarded item details for that zero quantity, and the generic invalid-line blocker prevented continuation even though the bad line was unselected. The validated total could survive as a summary; this was not proof that the entire cart response failed.

The parser now retains unselected zero-quantity lines. It separates selected unavailable items from unselected ones. With this example it shows EUR 26.99, seven stored lines and six selected units. One identified unselected sold-out item produces a nonblocking explanation. Selected unavailable items and unexplained invalid counts still block; we do not silently ignore an unknown problem.

Accepted cart data now updates the UI immediately. The old 300 ms settling and eight-second old-estimate hold were removed. Database-only discovery still has the five-second local scan interval. Successful supported responses update directly, without waiting for that scan. Opening the cart while already there requests a local rescan instead of another navigation. Unsupported response shapes/content are logged and trigger a rescan rather than automatically declaring an existing cart broken. HTTP/merchant failures remain real update errors.

The sample also revealed cartTransferMap.lastRequestTime. Valid values now supply the cart request timestamp shared by API/database copies; local request-start/cache-key time is the fallback. serverTime is retained as diagnostic metadata, not interpreted as a unique cart revision. Candidate age and currency/total checks still apply.

Supported cart envelopes are projected to the needed fields before the bounded deep copy. Large unrelated product/UI metadata cannot consume the copy budget before the totals. Database enumeration was removed from the reading path; a hanging enumeration call can no longer prevent known-name reads. Returning from a hidden mobile tab also triggers an immediate local rescan through visibilitychange, rather than waiting for a throttled interval.

Console entries begin with [TEMBY cart]. They show request method and proxy transport, recognized endpoint path without query values, response duration/status, database candidate counts, source choice, timestamps and selected/problem counts. Cookies, tokens, raw bodies, customer item names and IDs are excluded. Database messages are emitted on changed summaries rather than on every identical scan. These logs describe intercepted merchant requests; no cart network polling was added.

Owned desktop/mobile browser tests passed the seven-line sold-out scenario and measured about 149 ms / 59 ms from fixture fetch to companion update before the final field-projection hardening. These are local fixture timings, not whole-Temu speed gains. The proposed parser was also evaluated on the connected Samsung and accepted the synthetic seven-line case. The actual phone tab was hidden and the device dozing; asynchronous real database inspection timed out. This does not establish a successful real mobile cart or a fix for product/puzzle failures.

The running local server was read without resetting it and reported directAssets=false and blockTelemetry=false. That confirms its current server settings; existing pages still need the launcher reopened and reload to load browser worker v39. No phone navigation, logout, purchase, login submission or puzzle interaction was performed.

## Current v38 corrections — 20 October 2026

- Removed Google/Facebook/Apple button hiding, its page observer and click interception. External provider hosts are still denied by the relay allowlist. This removes presentation code; it does not claim universal email/password-only enforcement.
- Removed Ghostery and its eleven installed packages. The optional three patterns now use explicit URL checks. Full-list mode and the downloader were removed.
- Optional telemetry blocking and direct CDN delivery are now **off by default**. They altered traffic before real Temu compatibility was established. They remain available only through explicit opt-in for controlled checks. Existing streaming and public caching remain active.
- A bounded live comparison of fresh sessions reached login and token/API errors with both routes off, and again with them on. The enabled sample recorded 122 local blocks and more page errors. Sessions/timing differed, both reached the diagnostic upstream budget, and direct requests bypass that budget. This is not proof of causation or a controlled speed/challenge-frequency comparison. No puzzle was solved or login submitted.
- “Session-scoped health and metrics” means diagnostic pages show only this browser session's recorded failures/request counters. Previously health combined sessions. It does not change merchant authentication, request headers, routing, or concurrency. Counts are not an anti-bot score.

The inventory below preserves what was implemented and identifies what has since been removed or made opt-in. Server-default changes require a server restart; reopening the launcher loads browser worker v38. No running user server was restarted and no user session was cleared during this work.

## Implemented

This restores the implementation inventory. Each item says what was added and why. The longer explanations below give examples and limitations. Items marked v37 describe corrections made after the first implementation.

1. **Recognize the bare mobile cart endpoint.** Previously, the detector missed the URL ending in `/cart_modify`. This permits parsing that response; it does not make a rejected Temu request succeed.
2. **Read scoped IndexedDB without database enumeration.** Try the known database names, avoid creating an absent database, bound waits, and close late connections. We still open/read/close on each five-second visible scan and on focus. There are no cart network requests from this scan.
3. **Normalize minimums and explain order blockers.** Read numeric-string thresholds and show shortfalls/problem-item warnings before the main action. In v37 the effective minimum is at least 20 USD/EUR, with any higher accepted Temu minimum applied.
4. **Order cart evidence and reject pre-logout responses.** Request-start timestamps prevent late pre-logout responses restoring old estimates. In v37 the two-minute preference window and page-price source were removed. Sign-in form appearance no longer clears cart data.
5. **Report cart-update failures.** The worker publishes bounded reason codes without sensitive response bodies. In v37 a fresh or explicitly empty cart does not become an error because a request failed. A known nonempty cart can still show a later update failure.
6. **Deliver eligible public CDN resources directly.** Browser-to-CDN delivery avoids carrying their bytes through our server. Failed eligibility/CORS checks fall back to the proxy. HTML and cart APIs remain proxied.
7. **Preserve original script integrity declarations.** A bounded registry, saved across browser-worker restarts, keeps declared protected scripts verifiable. Conflicting hashes avoid direct delivery. Arbitrary dynamic/module/frame cases are not universally verified.
8. **Avoid automatically retrying readable CDN errors through Node.** A direct CDN 429 or server error is passed through. Failed route checks pause direct probes for one minute; the first failed probe can still be followed by a proxy request.
9. **Stream more unchanged resource bodies.** CSS, media, subtitle tracks and recognized binary downloads join existing image/font streaming. This starts delivery earlier but does not remove proxy bandwidth. Rewritten pages/scripts and JSON still buffer.
10. **Share suitable simultaneous public cache fills.** Equivalent anonymous requests for a known-small, cacheable public file can share one completed download. Private, unknown-sized and partial results are excluded. Cancelled/partial content is not cached.
11. **Bound upstream concurrency and waiting work.** At most 32 active responses overall, eight per origin, and 128 queued. This protects capacity; it can also delay busy pages. Local queue overflow returns 503, not a fabricated Temu 429.
12. **Separate temporarily retained 429 responses.** Reuse a refusal only for the same session/request/body/credential context and explicit future Retry-After. Small bodies are bounded; large ones use a labelled local response. No automatic upstream retry was introduced.
13. **Optional telemetry rules, simplified in v38.** Three explicit URL patterns replace Ghostery and its general parser. Worker/server rules match the same requests. Filtering is now off by default; there is no full-list mode or downloader.
14. **Restrict third-party sign-in at the relay.** External Google/Facebook/Apple hosts remain denied. The provider-control hiding, observer and click interception were removed in v38. Merchant UI is left alone; complete email/password-only enforcement is not claimed.
15. **Scope health and metrics to the current session.** A customer sees their own diagnostic state rather than other users' aggregate state. This does not replace production operator monitoring.
16. **Separate diagnostic outcomes.** Upstream completions, public cache hits, shared downloads, retained cooldown responses, local blocks and cancellations are labelled differently. This helps distinguish actual Temu requests from local responses.
17. **Record safe cart failure metadata.** Application failures can be identified even when HTTP status is 200. Diagnostics retain reason/schema information rather than tokens, passwords, cart bodies or sensitive query values.

18. **Separate selection from availability (v39).** Unselected sold-out lines with amount zero remain readable and are excluded from order blocking when the reported problem count is fully explained. Selected or unexplained problems still block.
19. **Apply accepted updates immediately (v39).** Removed the eight-second hold and added merchant request timestamps, bounded field projection, and explicit rescans after unsupported acknowledgements.
20. **Expose safe cart console traces (v39).** Request/response, database and source-choice events explain which path supplied or rejected the estimate, without recording credentials or raw cart bodies.

21. **Retain a separate API timeline (v40).** A per-session bounded metadata ring preserves successful and refused API calls despite general resource bursts. It records no additional bodies or credentials.
22. **Observe the merchant cart namespace (v40).** Additional response paths can supply a strictly validated full cart. Count-only acknowledgements cannot stand in for totals or supersede a full snapshot. Actual mobile initialization still needs a proven contract.
23. **Preserve the browser's request mode at the actual network boundary.** The installed fetch library was changing a page-opening request's mode from navigate to cors. The transport now preserves the real supplied value while keeping the existing connection pool and fetch response handling. Real local HTTP checks and all 86 tests pass. This source fix still needs activation and merchant testing; it does not prove the puzzle problem is solved.
24. **Read the mobile cart's initial response packet (v41).** Accept the known cart API envelope embedded in the initial document JSON and hand it to the companion after startup. This fixes the observed eight-item Samsung cart without a visible-page fallback, extra merchant request or scdb dependency. Earlier-navigation snapshots cannot leak into a new page. All 88 tests pass and the actual phone shows the matching cart amount.
25. **Keep the verified cart across shopping pages (v42).** Store accepted cart facts in an account-scoped local IndexedDB record. Restore the same account's current-enough snapshot after navigation or worker restart, retain later failure warnings, and clear it on explicit logout. A late pre-logout response cannot restore the record. Physical Samsung homepage/product/reload and owned restart checks pass; this adds no merchant polling.
26. **Accept mobile wire field names (v43).** Normalize the observed snake-case API and camel-case SDK/database envelopes through the same validation, rejecting conflicting aliases. This addresses the successful mobile responses incorrectly marked unsupported.
27. **Initialize from the current shopping page (v43).** Use the verified read-only full-cart API when no usable snapshot exists, and after recognized successful partial cart changes. Coalesce overlapping work, do not poll from count replies, and stop rather than automatically retry a refusal. The phone cold-homepage test and owned desktop/mobile change tests pass.
28. **Catch separate mobile add requests (v44).** Successful single/operate_cart, batch/add_cart and remove_and_add replies request full cart data when they lack a snapshot, even without cart_modify_type. Fresh empty-cart regression tests pass on desktop/mobile; the reported Samsung private-window failure still needs a real retest.
29. **Keep verification tickets separate from cart ownership (v45).** A changing verification proof no longer makes the worker discard the same cart's new total. Before/after tests reproduce and correct the silent-zero failure for guests and signed-in desktop/mobile browsers. A refused refresh after a confirmed add marks a saved zero as stale; unchanged fresh empty carts remain warning-free. Publication/discard traces now show where a handoff stops. Physical fresh-session confirmation now passes after signup; guest access before authentication remains unresolved.
30. **Read the whole cart through the existing page client (v46).** Recognize the different homepage/cart store locations and prefer their normal read client. Keep validation and local storage in the existing worker flow. Bound initialization and pending reads, release page departures, and avoid duplicate requests after refusal. The source was demonstrated on the phone; integrated desktop/mobile tests pass, while the integrated physical-phone check is pending.
31. **Recheck old saved carts and confirm edit acknowledgements (v47).** A returning tab makes a bounded full read after its saved response has aged. A successful cart edit that only says “done” triggers the same full read even when the operation number is absent or new. Failed edits and count endpoints do not. A page-client result only counts as refreshed once the worker publishes a validated response. Owned browser checks pass; the customer's actual Samsung delete failure still needs confirmation.

## 1. How the companion reads the cart

The companion shows an estimate. It does not maintain another real Temu cart or add up product-change amounts.

It now uses only two sources:

1. A copy of a successful Temu cart response. We read the current total, currency, and supported item data. This replaces the previous estimate; we do not calculate old total + new product price.
2. Supported saved cart records in Temu's browser database, called IndexedDB/scdb. Temu controls when it writes these records. Our code does not update scdb after every API request.

The two-minute live-response preference has been removed. Accepted complete responses and database records are ordered by timestamp; equal conflicting records are rejected. A matching live record wins a tie. In v39, valid merchant lastRequestTime is used when present. Otherwise live time means our recorded request-start time and saved time comes from Temu’s cache key. Neither is a verified server cart revision, so a newer cache write is not absolute proof of a newer server cart. The existing 30-minute age bound remains a local stale-data limit, not a Temu guarantee. No page text is used for totals, currency, quantities, or selection.

What I changed:

- Recognize the URL ending in /cart_modify, as well as its child routes. The previous detector missed the bare URL found during a mobile observation. This URL recognition alone did not fix real mobile cart access.
- Open the known browser database even when the browser cannot list database names. Bound waits and close connections. This fixes a database-reading problem; it does not prove that usable cart data exists.
- Check saved data every five visible seconds, previously every two. This reduces local work but can slow that fallback. It does not send a Temu cart request every five seconds.
- Prefer recent live responses over saved-data timestamps, and reduce repeated visible-page reads.
- Accept minimums represented as integer strings. The v37 effective minimum is now max(20 USD/EUR, accepted Temu minimum). Examples: Temu EUR 10 → EUR 20; Temu EUR 30 → EUR 30; missing Temu value → EUR 20. A later higher reported minimum updates this rule.

Recognizing a URL was only one part of the mobile problem. Temu still needs to return a successful response in a format we understand. Our owned mobile test pages supplied the expected format themselves. They did not prove that a signed-in real Temu cart works on the user's phone.

## 2. What the logout change really does

“Cart restoration after logout” was misleading wording. I did not add a feature that restores products after logout.

I added a rule to stop an old estimate reappearing after the companion thinks the user logged out. It clears the companion's remembered cart, account status, and address-confirmation flag. It does not delete Temu cart products or the actual shipping address.

Example: a cart request starts, the user logs out, and that old response arrives late. The companion rejects it because the request started before logout. The cutoff is remembered across tabs and reloads through local storage.

I chose this under the general improvement task. It was not a separately requested feature, and I should have explained its effects.

**v37 correction:** showing a sign-in form no longer clears cart observations. It can still reset account/address preparation, because a sign-in form is evidence about setup. Recognized explicit logout clicks still clear old cart observations and reject responses started before logout. The visible-page fallback has been removed entirely at the user’s request.

## 3. Warnings and actions

| Situation | What the user sees and can do |
| --- | --- |
| Below a known minimum | Shortfall warning; main button becomes Continue shopping and opens the homepage, or closes the companion when already there. |
| Temu reports problem cart lines | General warning; main button opens the cart. |
| A cart response fails or cannot be understood | Update warning; remaining estimate is dimmed; main button opens the cart. |
| Temu minimum is unknown | Apply the requested TEMBY minimum of EUR 20 or USD 20. A higher minimum is applied if Temu later reports it. |

Example: cart EUR 20.92, minimum EUR 30 means EUR 9.08 is missing.

invalidGoodsLines is Temu's reported number of problem cart lines. In v39, explicit unavailable reasons are retained where supported, and selected versus unselected problem lines are distinguished. We do not automatically remove or repair them.

A fresh visitor with no accepted cart data gets a neutral shopping invitation, not a cart-update warning. Explicit successful empty carts also do not get that warning. A failure warning requires a known nonempty cart and a later failed request. Merely seeing a total on the page does not change this state.

“Recovery” means a button to inspect the cart or continue shopping. It is not automatic repair. A newer supported successful response clears the update error. In v39, unsupported shapes/content are diagnostic observations and trigger a local database rescan; they no longer create that update warning by themselves.

The minimum is read from result.checkoutLayerTrackInfo.strongThreshold when present and accepted. Missing, malformed, or conflicting merchant values remain unknown, while the requested TEMBY minimum still applies. This field is a technical dependency, not independently verified payment authority. The cart total comes from Temu's reported order amount after the discounts represented there, before TEMBY's conversion and fees.

## 4. Direct loading, streaming, and buffering

| Method | Route | Effect |
| --- | --- | --- |
| Direct loading | CDN to browser | Our server carries none of that resource's bytes. |
| Streaming | CDN through our server to browser, in pieces | Browser receives bytes before the whole file arrives. Our bandwidth is still used. |
| Buffering | CDN/Temu through our server, preparing the complete body before forwarding | Used by current rewriting and response-processing paths. |

Direct loading now attempts public HTTPS resources on kwcdn.com and its subdomains: images, CSS, fonts, audio, video, and subtitle tracks. Scripts qualify only with an existing integrity hash, which lets the browser verify the exact expected file contents. Ordinary scripts remain proxied and rewritten.

Requests with authorization or certain signed/authentication query parameters are excluded. Direct attempts omit cookies and authentication headers. The response must be browser-readable, have a suitable content type, and pass public-cache checks.

If these checks fail, the resource falls back to the proxy. Direct probes for that host/resource category then pause for one minute. **The first failed direct attempt plus proxy fallback can mean two requests.** A readable CDN 429 or server error is returned without automatically retrying through our proxy.

HTML pages, login, and cart APIs are not made direct. Direct resources use the user's browser connection. This does not establish a solution to puzzles or login rejection.

Proxy streaming now covers successful GET responses for unchanged CSS, images, fonts, audio/video, subtitle tracks, and certain binary files. Partial media responses keep their range information.

HTML, ordinary JavaScript, JSON, errors, write requests, and legacy transport still buffer. The relay retains its 12 MiB decoded-body limit and 25-second upstream deadline. This is not unrestricted large-video support.

Small public resources may also be collected during streaming for caching. Partial downloads are not cached. Suitable simultaneous requests for one small public file can share a completed download.

A local slow-CSS experiment reduced first body delivery from about 217 ms to 45 ms. That is one artificial resource test, not a measured whole-Temu-page speed gain.

## 5. Third-party sign-in

The relay denies external Google, Facebook and Apple integration hosts because its allowlist permits only Temu, kwcdn.com, and their subdomains. The provider UI is no longer modified: buttons can remain visible and an attempted external flow is refused by the relay. Temu-hosted variants and phone login are not comprehensively excluded.

## 6. Optional filtering without Ghostery

The allowlist permits Temu subdomains. These explicit optional patterns can block selected requests inside that allowed space:

```
pftk.temu.com and its subdomains
thtk.temu.com and its subdomains
Temu paths starting /api/adx/
```

The checks run in the worker and server only when filtering is explicitly enabled. There is no list parser or installed Ghostery dependency. Documents/iframes are not blocked by this optional filter. Default filtering is off because optional-for-advertising does not prove irrelevant-to-verification. No full-list option remains.

## 7. Request pressure, 429, and /_relay

I added limits of 32 active upstream responses overall, eight per origin, and 128 queued requests. Excess local capacity returns 503. These limits can protect our server but can also delay busy-page resources. They do not establish why Temu returns 429.

When Temu supplies an explicit future Retry-After with a 429, the proxy can temporarily reuse a bounded refusal for the same session/request context instead of repeating it upstream. Different request bodies and credentials are distinguished. No automatic upstream retry was added.

Many /_relay entries are expected because different proxied URLs use that one local endpoint. The count alone does not prove a request loop. The underlying URLs, timing, and responses must be checked.

## 8. What was actually verified

- Historical v36 checks recorded 82 passing functional tests. Historical v37 had 77 passing functional tests and passing TypeScript checks; obsolete page-dependent tests/assertions were replaced with response/database behavior checks. The count change is not a speed or reliability score.
- Current owned desktop/mobile browser fixtures pass fresh-visitor failure handling, ignored visible totals, explicit empty carts, database-only recovery, live response updates, minimum shortfall, failed-update recovery, public resources, browser-worker restart, telemetry blocking, and, in v38, provider controls remaining untouched. There were no uncaught page errors.
- Live Temu checks still encountered 403, 424, 429, and a login redirect.
- A populated signed-in real mobile cart was not successfully established. The user's mobile cart remains broken.

Current v38 evidence is under artifacts/improvements-v38/. Previous v37 evidence is under artifacts/improvements-v37/. Historical v36 evidence is under artifacts/improvements-v36/; the earlier audit is under artifacts/audit-2026-10-19/. These are previous checks, not a new successful physical-phone test today. Neither the code nor the IP has been cleared as a cause.

## 9. Before launch

First demonstrate stable login and a populated real Temu cart on real mobile devices, including changes, discounts, reload, logout, and login again. The sign-in-based cart clearing has been removed. Unsupported real response formats and session continuity still need investigation before adding more optimizations.

Browser contents, database records, and companion messages are editable and remain estimates. Before taking money, the server needs an independently validated, expiring quote. Completed payment/order storage and fulfillment are not implemented.

Hosted deployment also needs protected per-user access and durable sessions. Current server sessions live in memory; restarting loses merchant-cookie sessions and test inbox associations. Account recovery and confirmed shipping details still need a finished design.

## 10. Current switches and activation

- `TEMBY_DIRECT_ASSETS=1`: opt into experimental direct public CDN delivery. Default is off.
- `TEMBY_FILTER_MODE=balanced`: opt into the three explicit patterns. Default is off.
- `TEMBY_FILTER_MODE=off`: leave merchant telemetry untouched.
- Full-list mode is no longer supported; invalid modes fail startup rather than silently applying something else.

Server setting/default changes require restart. Restart loses in-memory merchant sessions. Reopen the launcher and reload existing proxied tabs to load browser worker v38. The running server was not restarted during this work.

## 11. Are the constants production settings?

No benchmark establishes these as optimal production values. They are bounded starting points. Some also affect correctness or user experience, so increasing them blindly is not appropriate.

| Current value | Purpose and tradeoff |
| --- | --- |
| Database scan every 5 visible seconds | Local fallback discovery; changes stored only in the database can take several seconds to appear. Opens and closes on each scan. |
| Database open 1.5 seconds; read transaction 2 seconds | Bounds stalled storage work; very slow devices may need measurement. |
| At most 800 scanned records and 12 retained candidates | Bounds browser work; a much larger/different database needs compatibility testing. |
| Cart candidate maximum age 30 minutes | Avoid indefinitely displaying old data; does not certify freshness before payment. |
| UI checks 500 ms; accepted updates are immediate | The 300 ms settling and eight-second hold were removed in v39. No amount is dimmed merely because a fresh visit has no cart data. |
| Upstream 32 total, 8 per origin, queue 128 | Shared process capacity, not a per-user fairness policy. A busy user can affect others. |
| Relay 12 MiB and 25 seconds | Bounds work; excludes some large/slow resources. |
| Public server cache 32 MiB, 256 entries, at most one hour | Existing cache remains. Direct browser requests use browser/CDN caching instead. Cached TTL also respects the remaining merchant freshness. |
| Share known-small cache fills up to 2 MiB | Bounds the completed data followers wait for. Unknown sizes are not shared. |
| Server sessions one hour idle, at most 100 | Local prototype limits; durable hosted sessions and user access controls remain unfinished. |

The optional direct resource path does not delete the old server cache. A direct hit bypasses it; a qualifying relay fallback or proxied public resource can still use it. Authenticated cart/API data is not put in this shared public cache.

## 12. Proxy connections and human verification

For proxied pages and APIs, the browser connects to TEMBY and TEMBY makes a separate HTTPS connection to Temu. Temu sees the server connection. Merchant JavaScript still runs in the user's browser and generates browser/session signals that the proxy attempts to preserve.

When the server runs on the same home connection as the browser, their public IP may be the same. A hosted server normally uses the host's public IP. Direct public resources separately connect from the user's browser to the CDN.

Connection characteristics, headers, cookies/tokens, timing, and browser behavior can all matter to verification systems. We have not established Temu's exact reason for the puzzles. Broken session continuity and rate patterns remain possible code-related causes; IP reputation is also a possibility. The server being a middleman alone does not prove which one caused the rejection.

## 13. Fixes still due

- Verify mobile cart add/remove/quantity changes and repeated navigation after the successful v41 initial cart read.
- Investigate login/puzzle/403/424/429 behavior with controlled session and request comparisons.
- Check repeated relay requests for actual loops, duplicate work, or resource leaks.
- Validate direct loading and filtering against real storefront/login behavior before relying on their performance gains.
- Verify permitted email/password login flows; external provider requests are denied and provider-button hiding was removed.
- Measure capacity, memory and latency before tuning defaults for hosted traffic.
- Complete durable sessions, trusted quotes, account recovery, address handling, payment and fulfillment before accepting real orders.

This list preserves the outstanding work; the cart corrections do not silently mark it completed.

Final v39 browser recheck after parser hardening and visibility recovery: desktop 38 ms, mobile 32 ms. Both desktop/mobile cases passed with no uncaught page errors. These are owned fixture timings.
