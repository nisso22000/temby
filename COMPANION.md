# Companion v30 — behavior and verification

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

Example rates remain USD 250 / EUR 275 DZD, with existing per-tab rate settings honored. Integer minor units and half-up rounding are used. The bubble is converted Temu net plus 8% service; no payment-method fee. Expanded details expose the cart currency, actual exchange rate, net in merchant currency and DZD, service on net and estimate total. Gross, discount and savings rows are no longer displayed. The customer sees one Temu net price, its conversion and the service fee. Discount fields remain internal parser consistency checks, not inputs subtracted from the net a second time. Card 2% appears only in review; BaridiMob 0.5% remains configuration only.

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
