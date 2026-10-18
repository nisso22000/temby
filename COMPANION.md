# Companion v27 — local prototype

Open http://localhost:3000/ to update the worker; reload an existing proxied tab once if it still contains the previous helper bundle.

## Customer interface

- Uploaded circular icon, blue #075da6, rectangular DZD amount only. The amount includes service, excludes payment fees. Warm white panel, one current step, French/Arabic copy based on merchant document language. Small opening/amount animations respect reduced-motion preferences.
- Removed the manual email field, rate inputs, password tools and all-at-once checklist. Calculation details remain collapsed during shopping. Card fees appear only on the final review screen. Payment remains disabled.
- Default example rates: USD 250 DZD, EUR 275 DZD. Existing per-tab test rates remain honored. Conversion uses integer centimes and half-up rounding: merchant amount × rate, then 8% service. Card fee = 2% of the resulting subtotal.
- Separate payment fee configuration includes card 2% and proposed BaridiMob 0.5%; BaridiMob is not displayed or integrated yet.

## Cart data

- The existing DOM summary reader remains a fallback. It samples every 500 ms and waits 900 ms for a stable amount. It is not full cart validation.
- New read-only adapter looks for an existing `scdb` database on the proxy origin, never the separate database belonging to direct temu.com. It does not create or modify merchant databases, patch IndexedDB methods, replay tokens or issue extra Temu requests.
- Existing stores are inspected at startup, focus and every two seconds while visible, bounded to 800 records and bounded object traversal. Candidate payloads are normalized into allowlisted item/currency/amount fields only; session tokens and response keys are discarded.
- Recognizes the user-described `goodsSkuList` / `displayList[].goodsList` structure and nested JSON cache envelopes. Extracts product/SKU IDs, quantities, names, image links, specs, unit prices, currency, order amount, login flag and threshold/invalid-item hints. Unfamiliar structures are not guessed.
- A candidate must have a timestamp in its cache key, be less than two minutes old, have a supported explicit ISO currency, and match the visible cart amount, currency and selected quantity. Conflicting candidates, malformed prices, duplicate SKU IDs and inconsistent lists are rejected. USD-specific amounts are never interpreted as EUR amounts.
- Selected flags are respected when supplied. When absent, full-list quantities must match the visible selection count. This assumption needs live verification against Temu's count semantics.
- Until product details are matched, the UI may show a DOM estimate but does not advance as though a complete cart has been verified. Source/cache metadata is exposed only as sanitized counters in `data-cart-cache`; no raw cache records, tokens or account identifiers are logged.

## Account guidance

- Real Temu email field observed: `input[type=text]` with an Arabic email `aria-label`. The previous email-only selector missed it. The new matcher uses field semantics, requires exactly one visible matching input, and uses the native value setter plus input/change events.
- Verified live: customer-initiated test-email creation filled that real field successfully. No registration/terms submission was performed.
- Test address comes from the existing session-bound Catchmail endpoint. There is no companion email input. The generated address is displayed only after requesting a test email; customer can explicitly fill it and check incoming messages. Existing nonempty email input is not overwritten.
- A tab-local opt-in marker can resume filling after login navigation. Choosing an existing account clears that opt-in. No password capture/generation/storage or credential handoff.
- Account and shipping progression is preliminary. Cache login flags are not independently established as an authoritative authentication signal. Delivery confirmation is customer-reported; address extraction and a saved immutable order are not implemented. Final payment remains unavailable.

## Verification and limits

- 47 tests passed, including cache extraction, stale/conflicting data, currency safety, quantities/selection, credential exclusion and separate payment fees. Typecheck passed.
- Live proxied session rendered the new panel and filled Temu's real email input. Home/cart navigation repeatedly returned to login; no `scdb` database existed in that test browser session.
- Thus the `scdb` structure is implemented against the user's field description, not yet verified against an actual proxied nonempty cart. No reliability percentage, full checkout, OTP delivery or shipping completion is established.
- No Supabase, real payment integration or purchasing automation added.
