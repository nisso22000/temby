# Current cart read path — v49, 22 October 2026

The mobile HAR captures exposed a routing gap: Temu sent cart responses under `/dz/api/`, while the observer required `/api/`. The observer now accepts a leading two-letter storefront locale (optionally followed by a two-letter language), preserving HTTPS, merchant-host, credential and port checks. Full responses, mutation acknowledgements and count signals all use the same route classification. No prices are inferred from counts.

The console capture also showed a validated cart publication followed by an SDK client-error report. The worker now uses its own validated publication to confirm the read, even if the page SDK returns a wrapper or throws after the response. An SDK acknowledgement without a worker publication still fails and does not issue a fallback request.

When the companion has a cart update warning on `shopping_cart.html`, its recovery action now says to refresh the page, performs one user-requested document reload, and reopens the panel. The message directs the customer to follow any Temu login/verification instructions. It does not infer why Temu refused the request or initiate authentication. Existing invalid-item review on the cart page dismisses the companion to expose the merchant controls.

Validation: 103 automated tests and TypeScript pass. `scripts/verify-cart-client.mjs` passes in isolated headless desktop and Pixel 7 contexts, including `/dz/api/` adds and counts, localized full cart replies, SDK wrappers and post-response errors, refusal without fallback, and failed-cart reload recovery. Results: `artifacts/improvements-v49/merchant-client-browser.json`. These fixtures make no live Temu requests. Physical Samsung verification and the cause of Temu's suspicious-activity/session refusals remain unresolved.

## Earlier v48 behavior

Desktop Temu often fetches a full cart for its sidebar. Mobile Temu often fetches only the number of items for its cart bubble. That number has no trustworthy price. TEMBY now uses a full, validated Temu cart API response as its only live price source on both layouts. A mobile count response is compared with the selected SKU quantities in TEMBY's last confirmed full response. If they differ, it requests the full cart through the page's Temu client. A successful full add/delete response already contains the answer and updates directly; an acknowledgement without the cart requests the full response. The saved account-scoped database is a copy of the last validated response, never an independent price calculation.

I removed HTML bootstrap cart extraction and the five-second database scan. A page may still use a saved confirmed amount while a bounded recheck is due, but it must not overwrite a newer live response. A late read cannot overwrite a completed cart edit, and a request begun before logout cannot restore the old cart afterward. If Temu refuses the full request, TEMBY keeps the prior amount with an update warning rather than guessing from the bubble. The full read and saved copy also work when there is no desktop sidebar.

Controlled desktop/mobile browser cases and all 100 tests pass. A physical Samsung add/delete and puzzle session has not yet been verified against this v48 build. Temu can still require login or a puzzle, so this is not a claim of launch-ready reliability.

## Earlier v47 behavior

A tab that opens with a saved cart now verifies it after a quiet period: at least 15 seconds since the saved response and 30 seconds since the last read attempt. This is one account-wide check shared by tabs, not a five-second merchant poll. Successful cart edits that only acknowledge the change trigger a full cart read, including an edit with no operation number. The worker accepts a page-client result as refreshed only when its own response observer has published the validated cart. The owned browser checks pass; the reported physical Samsung delete case still needs retesting.

Mobile Temu exposes its homepage client at __INITIAL_PROPS__.stores.store.$service. The cart page uses __INITIAL_PROPS__.store.$service. Our earlier inspection missed the homepage location. A real Samsung homepage read through that client returned the full EUR 87.82 cart, including seven selected units, in 519 ms without a cart-page visit. That is one measurement, not a general speed guarantee.

When a full snapshot is needed, the worker now asks the shopping page to use this existing client. It waits briefly for application initialization, asks for the full cart, and observes the response through the ordinary relay. The same amount, currency, item and identity checks apply before updating the companion and its local database. Successful full responses already supplied by Temu update directly. A partial change acknowledgement causes a coordinated full read; prices are never inferred from that acknowledgement.

The worker still shares overlapping reads. If no supported page client exists, the existing direct relay read remains available. If the page client attempted a read and it failed or Temu refused it, TEMBY does not issue a duplicate through the fallback. Navigating away releases the pending page read; a later read can use the new page. Failures and stale-zero warnings retain the previous rules. No visible price scraping, hidden cart iframe, or periodic merchant polling was added.

Controlled desktop/mobile browser tests pass initialization with delayed page-client availability, add/remove down to zero, refusal without another request, client errors, navigation during an unfinished read and later recovery. All 97 tests and TypeScript pass. On 21 October the phone was disconnected, so the integrated v46 change has not yet been validated on the physical phone. Standalone product pages that expose neither supported store location still use the existing fallback. Puzzles/login and the reported intermittent misses remain launch checks.

# Earlier cart correction — v45, 20 October 2026

The saved-cart identity used to include verifyAuthToken, which is a verification proof. A changed proof could cause a valid incoming total to be discarded as another account's data. It now uses meaningful authentication credentials/account IDs, or the guest cart ID when not authenticated. Verification, challenge and CSRF proofs are excluded from this local identity calculation; they continue to pass to Temu normally. Empty credential cookies do not establish an account, and a remembered user ID alone does not restore a signed-in cart after logout.

This exact discard was reproduced in owned desktop/mobile browsers, for guests and signed-in users. Before the fix, all four cases stayed at 0 after a verification cookie changed during the read. Afterward, all four display the updated DZD amount without visiting the cart. This establishes the code defect and correction, not the cause of every earlier phone failure. The phone retest now passes after signup: the customer added on a product page without visiting the cart, and both the capture and customer report confirm the new amount. This does not establish reliable guest access before login.

After an accepted cart change, a refused refresh also marks a previously confirmed empty amount as stale. That warning survives navigation and clears after a later accepted read. Ordinary fresh empty carts remain warning-free. Warning freshness compares local observation times, avoiding the phone/server clock offset seen in the capture. Worker traces now distinguish a parsed response, successful publication, and discard reasons.

# Earlier cart correction — v44, 20 October 2026

The Samsung private-window report exposed a gap: the amount initialized to 0, but a successful add did not refresh it. Loaded mobile SDK code uses single/operate_cart and batch/add_cart without our expected cart_modify_type field. Successful replies from these routes and remove_and_add now request a full validated cart if the reply itself lacks it. No count polling, price arithmetic or visible-page reading was added. Fresh desktop/mobile browser tests pass empty → populated updates while remaining on a product page. The exact physical private-window case still needs confirmation.

# Earlier cart behavior — v43, 20 October 2026

You do not need to open the cart page first. When there is no usable cart record, the companion asks Temu for the full cart through its read-only API. It stays on the current shopping page. The response supplies the real total and selected items; nothing is calculated from a cart count or visible page prices.

The mobile bug was a field-name mismatch: Temu sends cart_list_info and order_amount over the network, while its SDK/database copy uses cartListInfo and orderAmount. The reader now handles both spellings, rejects conflicting aliases and retains the existing currency/total checks. Both formats feed the same local database.

After a successful cart change, a full response updates immediately. If the recognized change returns only a partial acknowledgement, one shared full-cart read supplies the missing total. Overlapping changes can require one follow-up read if they completed after the first read began. There is no periodic merchant polling or automatic retry of a refusal. Count-only replies do not cause extra reads. A failed initial read is remembered for that identity so ordinary navigation does not repeat it; a later successful change can initiate another read.

During an actual pending read, the existing estimate is marked as updating and Next is disabled until the read finishes. This has no fixed settling delay. On return to a visible tab the companion asks the worker for local state, which also clears a stale pending indicator after a worker restart. No extra merchant read is needed when that state is usable.

The query uses the merchant SDK's observed NORMAL_RENDER=1 and FullSkuData=2, with no item IDs, quantities, selection edits or fabricated proof values. The real Samsung homepage obtained a cart after only TEMBY's saved copy was cleared, without opening/requesting shopping_cart.html. Owned desktop/mobile tests also exercise changes and refusals. A real-phone add/remove test and visual reconciliation after those changes remain unverified.

# Earlier cart behavior — v42, 20 October 2026

The companion retains the last validated cart across shopping pages using the browser-local temby-cart-state IndexedDB database. The worker keeps one connection while alive, writes on accepted responses and reads on companion startup; this adds no merchant polling. Merchant scdb remains a second input.

The saved record is scoped to merchant origin and a SHA-256 digest of authentication/session cookie identity. Raw credentials are not stored in the cart record or logged. Unknown identity does not restore a saved account's cart. Explicit logout clears the record with a persisted time barrier, preventing a late earlier response from restoring it. A later failed cart update remains a warning after navigation. Original merchant/request timestamps and the existing age checks are retained rather than reset on page visits.

The physical Samsung retained the current nine selected items and EUR 423.58 total through cart → homepage → existing product → product reload. Owned desktop/mobile fixtures also stop/restart the worker and confirm the cart survives, while unit checks cover account isolation, logout and denied storage. This is last-confirmed cart retention, not proof that every add/remove/quantity-change path has been captured. An initial full snapshot still requires a supported response or database record.

# Earlier cart behavior — v41, 20 October 2026

The cart reader accepts supported cart API responses, the same API packet embedded as JSON in the initial shopping_cart.html response, and supported scdb records. It never reads visible prices. For the initial document, only window.rawData.store.apiStore.cartModifyData is supported; scripts are parsed as JSON and never executed. Existing success, currency, totals and item validation remains in force. A bounded worker handoff delivers the initial response after companion startup and rejects snapshots from earlier navigations or other merchant origins. No new merchant fetch is introduced.

Physical Samsung verification after the customer's normal login and one ordinary cart refresh showed eight selected items, EUR 421.06 and 121,581.08 DZD including the configured 5% service charge. The same scenario passes owned desktop/mobile browser fixtures without scdb or a subsequent cart API call. Broader authentication/challenge behavior is not established by this successful read. Earlier behavior notes follow.

# Earlier cart behavior — v39, 20 October 2026

Response/database only. Supported envelopes retain unselected sold-out zero-quantity items. Effective blockers use selected unavailable lines plus unexplained problem counts; a fully explained unselected sold-out line is a nonblocking notice. Validated financial totals remain separate from optional item details.

Accepted updates apply immediately: the old settling/eight-second hold is removed. Merchant cartTransferMap.lastRequestTime is used when valid, with request-start/cache-key fallback. Supported envelopes are projected before copying to avoid losing totals behind large product metadata. Known database names are opened directly with bounded waits, without enumeration. Polling remains local every five visible seconds; no extra merchant cart fetch is added. Unsupported response shape/content triggers a local rescan and diagnostic trace, not an automatic broken-cart warning. Opening an already-open full cart requests a local rescan.

[TEMBY cart] console entries expose safe path/method/transport, response status and duration, database candidates, source choice, totals and selection/problem counts. No cookies, tokens, raw response bodies, names or product IDs are logged. Current limitations and physical Samsung observations are in LAUNCH-READINESS.md. Historical behavior below is superseded where it conflicts.

# Current cart behavior — v37, 20 October 2026

The cart amount now comes only from complete supported successful cart responses and matching supported IndexedDB envelopes. The visible-page monetary reader was removed. Newest accepted timestamps decide response/database precedence; the old two-minute live preference was removed. Equal conflicting observations are rejected. Cache timestamps and local request-start timestamps are observations, not verified server revisions. The 30-minute age limit remains.

The effective order minimum is max(20 USD/EUR, accepted merchant minimum). The original merchant minimum remains separate. A fresh visit without accepted cart data is a neutral browsing state. Failed requests do not produce a cart warning until there is a known nonempty cart and the failure is newer than it. A newer accepted response/database observation clears that warning. Sign-in form appearance changes setup readiness but no longer clears cart observations; recognized explicit logout still invalidates older observations.

The database reader opens, scans and closes every five visible seconds and on focus. It is local storage work, not network cart polling. Desktop/mobile owned fixture evidence is in artifacts/improvements-v37/. Real Temu mobile cart/authentication remains unresolved. See LAUNCH-READINESS.md for the complete implementation inventory and limitations.

The notes below describe historical revisions. Statements about visible-page cart reading or live/cache preference are superseded by this section.

# Companion — current v36 behavior and historical notes

V36 recognizes the mobile bare `/cart_modify` endpoint as well as its child routes. Merchant HTTP/application failures and unsupported response shapes produce bounded reason codes; a failed update offers cart review rather than silently treating the old estimate as current. A later successful supported response clears that warning. No extra cart requests are introduced.

Minimums normalize integer strings as well as integers. Known shortfalls and invalid-item warnings appear before clicking; the action offers more shopping or cart review. An unknown minimum is labelled for confirmation and does not claim confirmed eligibility. Recent live snapshots outrank cache write timestamps for two minutes. Snapshot timestamps use request start; recognized logout/login invalidation persists a cutoff across tabs/reloads so earlier responses and cached records cannot restore the old cart. This remains client evidence, never payment authority.

IndexedDB discovery safely attempts the known scoped database without enumeration, aborts accidental creation, closes late/blocked opens and bounds reads. Recovery scans run every five visible seconds and on focus. DOM price reads are invalidated by relevant changes, navigation, resize/focus and a two-second recovery interval; the lightweight UI timer remains 500 ms. Visible DOM totals remain estimates only.

Google/Facebook/Apple sign-in controls are hidden in recognized login/dialog contexts and their external destinations are denied. Email entry remains in Temu. Unsupported merchant control variants and native phone-based login have not been comprehensively validated.

The sections below describe earlier revisions where timing or wording differs; the v36 behavior above supersedes them. See LAUNCH-READINESS.md for release evidence and unmet real-user requirements.

## Scope

TEMBY remains the existing Ultraviolet rewriting proxy. There is no replacement storefront, Supabase, remote purchasing browser, order database or payment integration. Address entry and confirmation remain manual at the user’s request. Test fixtures run only through the separate internal regression script, never normal startup.

Open http://localhost:3000/ to activate `/uv/sw.js?v=30`. Reload an already-open proxied document to replace its injected helpers.

## Cart data and timing

The worker observes the successful JSON responses **already requested by Temu** under HTTPS Temu `/api/.../cart_modify/...` routes. It reads a bounded clone (2 MiB maximum), requires `success: true` plus the known `result.cartListInfo` schema, and publishes only normalized cart/account facts to controlled tabs of the same virtual merchant origin. It neither issues another cart request nor exposes raw response tokens. The original response remains available to Temu unchanged. A response from an older-started request cannot replace one from a newer-started request. Early messages are queued until the companion has initialized.

The live response is authoritative while the screen and IndexedDB catch up. IndexedDB remains a navigation/startup fallback: original/native open, exact `https://www.temu.com@scdb`, `entries`, readonly reverse cursor, at most 800 records per scan. It is checked at startup/focus and every two seconds while visible. This is a local read, not a Temu network request. Direct temu.com browser storage is separate and inaccessible to this reader.

Money paths for the supplied canonical response:

| Fact | Source |
| --- | --- |
| Currency | `cartListInfo.checkoutExtendMap.ckCartCcy`, `cartTransferMap.currency`; reject contradictions |
| Net | `discountInfo.orderAmountDto.orderAmount`, checked against `orderAmountOrderCcy` and `cartTransferMap.orderAmount` when supplied |
| Gross | `discountInfo.orderAmountDto.totalGoodsAmount` |
| Reduction | `goodsDiscountAmount` plus `discountAmount`, when supplied and reconciling with gross minus net |
| Product identity/name | `baseGoodsInfo` |
| SKU, selected quantity, unit price, specs | `skuInfo.skuId`, **`skuInfo.amount`**, `skuInfo.skuPrice`, `skuInfo.skuSpec` |
| Account evidence | `ckCartLoginStatus` |
| Excluded | Separate USD `amountRocVo` for EUR carts, reference-price `totalSaveAmount`, stock `skuQuantity`, tokens, UV accessors and secondary serialized snapshots |

Cached records must be under 30 minutes old. With a visible total, cached currency/amount must match, allowing a labelled sidebar gross subtotal that reconciles to net. Without a total, a successful unambiguous canonical response can restore the estimate; generic nested money cannot. The customer-facing cached-cart wording has been removed. A readable DOM final-total fallback exists on full cart/checkout pages. A summary estimate is never a saved payable quote.

The page/UI check runs every 500 ms while visible. Changes settle for 300 ms. During an unreadable transition the last estimate is held, with amount-only dimming and an updating message, for up to eight seconds; thereafter it is cleared. The icon/blue background remain solid. Only short-lived transitions are concealed, not indefinite data loss.

## Customer states and buttons

| State | Visible behavior | Main button |
| --- | --- | --- |
| Initial loading / amount updating | Loading/updating text; no invented empty cart | Waits; cannot advance |
| Zero selected quantity, or zero amount without a known positive quantity | Empty-cart explanation | Returns to browsing; never starts setup |
| No accepted snapshot after initial four-second grace | Says the cart needs checking | Opens Temu’s cart directly if its cart button is unavailable |
| Nonempty readable cart | DZD estimate, items when known, collapsed calculations | Starts/resumes setup |
| Account evidence missing | Default guided new-email setup; existing-account alternative | Prepares/fills email, then returns the customer to Temu |
| Signed in | Account preparation is skipped | Address guidance, or review if previously confirmed |
| Address page | Temu address book plus explicit customer confirmation | Customer edits manually; confirmation advances to review |
| Review | Estimate and final-review card fee | Payment remains disabled |

A zero amount with an unknown count is handled as empty rather than falling through to account setup; explicitly selected positive quantities remain nonempty even if a promotion makes the price zero. Returning from setup stays in cart inspection until Continue is chosen again. The old generic welcome fallback is no longer used for loading/unreadable states.

Continue is blocked when Temu reports invalidGoodsLines > 0, or the cart net is below its reported strongThreshold minimum. No payment is implemented.

Signed-in evidence is the freshest unambiguous `ckCartLoginStatus`, independent of item parsing. Shared browser readiness contains only account status/evidence timestamp and customer-reported address confirmation, valid for 30 minutes when loaded. A newly served visible login form can invalidate older evidence; a newer positive signal offers refresh rather than another inbox. This is browser evidence, not an authorization mechanism or proof of the account’s email/password. It does not verify the saved address or snapshot an address for an order.

## Email, password and verification

Continue, or reaching an empty visible login form in the default new-account mode, prepares a random session-bound Catchmail address and filling one unambiguous visible Temu email field. Existing different values are preserved. Native setters plus input/change events notify the merchant form. The existing-account mode persists per tab, disables generation/filling, clears only values generated by the companion if still unchanged, and offers a return to new-account preparation.

If the new-account path presents one visible password field (excluding `autocomplete=current-password`), the companion can generate and fill a 16-character mixed-case alphanumeric password using browser cryptographic randomness. It does not submit it. The masked copy tool is available in the companion. The generated password stays in the current document’s memory/DOM only: **not server storage, logs, payment metadata, localStorage or sessionStorage**. Customer-entered passwords are not captured. Refresh/navigation can lose the generated value; the customer is prompted to copy and retain it. Password handoff to the operator is not implemented.

Email creation chooses a catch-all name locally; it does not create an inbox through the provider API. Checking messages remains customer-initiated: page → worker → local server → Catchmail latest-message list, then plain-text detail if present. There is no OTP polling, WebSocket, code submission, registration submission, terms acceptance or CAPTCHA solving. Existing provider limits remain: five-second per-session check cooldown, global queue with at least 1.1 seconds between provider calls, ten-second provider timeout and 25-second page timeout. Email HTML is never rendered. These remain test inboxes, not a production recovery-email arrangement.

## Money and layout

Example rates remain USD 250 / EUR 275 DZD, with existing per-tab rate settings honored. Integer minor units and half-up rounding are used. The bubble is converted Temu net plus 5% service; no payment-method fee. Expanded details expose the cart currency, actual exchange rate, net in merchant currency and DZD, service on net and estimate total. Gross, discount and savings rows are no longer displayed. The customer sees one Temu net price, its conversion and the service fee. Discount fields remain internal parser consistency checks, not inputs subtracted from the net a second time. Card 2% appears only in review; BaridiMob 0.5% remains configuration only.

The launcher stays at the left edge, circle left / amount right. Product lists scroll independently inside a bounded panel, calculations remain collapsed by default, and the action footer stays outside the content scroller. Short screens and expanded details retain a body-scroll fallback. Custom thin scrollbars and reduced-motion behavior remain.

## Server sessions

Sessions are in memory only, with a one-hour sliding idle expiry and a 100-session cap. Server requests renew the session cookie; merely reading IndexedDB does not. Restarting the server loses merchant cookie jars and test-inbox associations. Browser virtual storage persists separately. There is no Windows key or disk session restoration.

## Rate limits and cross-origin fix

The relay no longer invents a 60-second pause after a 429 without `Retry-After`. It returns the original 429 unchanged; a later customer/Temu request can reach upstream again. It respects an explicit future merchant `Retry-After`. The separate CSP-report forwarder retains a reporting-only fallback cooldown to avoid report storms; it does not block customer APIs. No automatic retry, CAPTCHA bypass or request flood was introduced. Temu may still demand login or challenges; this change does not establish their trigger or remove them.

UV rewrote allowed operations such as cross-origin `window.postMessage` into an illegal lookup of `__uv$setSource` on the target Window. The targeted AST workaround applies only to noncomputed `frame.contentWindow.postMessage(...)` calls. It looks up the source helper from our realm. Ordinary window/location/top/parent accesses keep their previous rewrite; other `__uv$setSource` call shapes are not claimed fixed. Same-origin objects retain UV behavior; a cross-origin Window facade delegates only to native operations. Native prohibited access still throws. Regression tests reproduce the original failure and verify the permitted message succeeds, the receiver is correct and object expressions evaluate once. A real browser opaque sandbox frame passes this check. A broader member-expression change stalled the live storefront comparison and was narrowed before release. The targeted version reaches the rendered Temu login form. The exact earlier Temu click still requires comparison; this is not a guarantee for every frame/popup interaction. The main storefront remains a top-level proxied page, not an iframe.

The Chrome DevTools `/.well-known/appspecific/com.chrome.devtools.json` warning is workspace discovery. Merchant CSP remains intact.

## Verification

Functional tests and TypeScript are checked for this revision. Coverage includes nested EUR fields, selection quantities, discounts, live-message isolation/order/body preservation, empty states, password generation, explicit versus invented 429 cooldowns, native window boundaries, one-hour session expiry and session-bound inboxes. The internal browser harness checks DOM totals, 20-item scrolling, empty-cart browsing and guided account setup without submission; synthetic pages are labelled and separate from Temu.

The final targeted live check reached Temu’s rendered login form; a logged-in populated cart, completed registration, and the customer’s original failing click still need live comparison. Browser tests also verified default email/password filling on a synthetic login form, existing-account cleanup, and the timed transition from loading to unavailable. No completed real merchant purchase, actual payment, full registration, durable operator credential handoff or universal compatibility claim is made.

## Account-flow and cache clarification (v33)

Canonical successful cache records may now supply the net without agreement from the rendered subtotal; current visible currency must still agree, ambiguity and 30-minute freshness checks remain. Existing successful cart responses continue to be observed without new Temu requests. Without any readable cart evidence, show a neutral shopping invitation, not an error or a confirmed zero.

Account setup now offers generated test account or existing customer account. The generated option prepares both a random mailbox and a visible, copyable proposed password immediately. The password is in document memory only; reload loses it. Showing it does not mean Temu has accepted/set it. Filling preserves nonempty merchant fields and excludes current-password fields. Existing-account entry stays in Temu, with no personal-password capture.

Opening cart/login and filling no longer explicitly collapse the panel. The login opener checks for an existing visible email field before clicking the merchant sign-in/register button. After clicking it checks once after 1.2 seconds for the field; it does not submit. Without a matched sign-in control it navigates to login.html. Modal/page detection uses one visible unambiguous email field, so OTP-only screens and unusual forms remain limitations. Collapsed contextual hints are proposed, not implemented.

## v34 workflow polish

Normal cart heading/intro are used even before cart evidence exists; missing price remains a dash, not a fabricated zero. Next on a known eligible cart goes directly to the first incomplete setup step. Account setup opens the merchant login and prepares generated test credentials with an existing-account alternative. Address page uses the primary action for manual saved-address confirmation instead of navigating to itself. Commission is 5% of converted merchant net. Minimum warnings are high-contrast and include the reported threshold and net. Copy controls use labelled icons and neutral one-line credential fields. No collapsed guide is implemented.

## v35 corrections

Account setup prepares generated credentials automatically, including direct login-page entry; the existing-account choice is removed. Old per-tab existing-account preference is ignored. Credentials remain test-only, not an implemented fulfillment handoff. Neutral inputs now sit on pale postal stationery backgrounds. Minimum warning includes the exact shortfall in merchant currency. Empty/unavailable carts use the browse action label; known nonempty carts use Next.

An explicit autofill click recognizes password-only screens and may fill a single empty current-password field with the generated password; passive autofill still excludes current-password fields. No nonempty password is overwritten. Missing/ambiguous fields produce guidance. A proposed password is not evidence that Temu set it.

Recognized logout clicks invalidate account/address preparation immediately and clear the active cart snapshot. Reappearing login fields/sign-in controls invalidate old positive evidence; newer merchant authentication facts can correct this if logout fails. Detection remains limited to recognized controls and same-origin DOM.
