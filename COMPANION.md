# Companion v28 — implementation and verification

Open http://localhost:3000/ to update the worker. Reload an existing proxied tab once if its document still contains older helpers. No new database or backend dependency was introduced.

## Where the data comes from

Everything is read inside the **proxied page's browser origin** (localhost:3001). The companion cannot access the separate IndexedDB belonging to direct temu.com.

Ultraviolet prefixes merchant database names: opening `scdb` from merchant code creates/opens `https://www.temu.com@scdb`. The previous reader searched only for an exact `scdb` name, then used UV's wrapped open method; passing an already prefixed name could prefix it twice. v28 receives the original `client.idb.open` method before UV installs its hooks, enumerates existing databases and opens the exact scoped name through that original method. A legacy unprefixed database is considered only if no scoped database exists. Upgrade transactions are aborted rather than creating a new cache.

The `entries` store is preferred. Reads use readonly transactions and reverse cursors, bounded to 800 records. Cache envelopes and nested JSON strings are decoded with bounded traversal. Only normalized price/item/account facts leave the adapter. Tokens, raw response keys, passwords and addresses are not retained or logged. Sanitized cache counters and record field names appear in the host element's `data-cart-cache` attribute for debugging.

## Money and discounts

| Fact | Source/rule |
| --- | --- |
| Currency | Explicit `currency` / `ckCartCcy`, or an explicit USD/EUR suffix in the cache key; cross-checked against visible amounts |
| Merchant net | `orderAmount`; USD-only `orderAmountUsd` fallback when the local field is absent, never when it is malformed |
| Merchant gross | `totalGoodsAmount`; `totalGoodsAmountUsd` is accepted only for USD |
| Discounts | `goodsDiscountAmount` plus order-level `discountAmount` / USD-only `discountAmountUsd` |
| Green saving | Shown only when explicit gross is at least net and supplied discounts reconcile with gross minus net |
| Excluded from payable discount | `marketPrice` and `totalSaveAmount`, which may describe reference/list-price savings |

Amounts must be integer minor units. EUR 2092 means EUR 20.92. Currency is never inferred from a USD-named amount field for a EUR record. Money in checkout URL parameters is not used as a price source.

The supplied real `sc_cache` shape is handled explicitly under `d.result`: currency comes from `cartListInfo.checkoutExtendMap.ckCartCcy` and `cartTransferMap.currency`; monetary values come from `discountInfo.orderAmountDto`. Its net is checked against `cartTransferMap.orderAmount` (which may be an integer string) and `orderAmountOrderCcy` when present. Failed responses and contradictory currencies/totals are rejected without recursively salvaging their children. `discountInfo.amountRocVo` is a separate USD representation and is excluded from this path. The supplied EUR values reconcile as 2899 − 807 = 2092; `totalSaveAmount: 3060` is not this discount.

Items use `baseGoodsInfo` for product identity/name and `skuInfo` for SKU, specs, `skuPrice` and **`amount` (selected quantity)**. `skuQuantity` is not used as ordered quantity. Missing/invalid item details preserve a valid monetary summary without inventing quantities. UV accessors are skipped using data-descriptor reads, and serialized secondary snapshots are excluded.

The DOM fallback now searches for explicit final-total labels on both `shopping_cart.html` and `bgt_order_checkout.html`, excluding crossed-out originals and aria-hidden animation copies. It no longer takes the first price row in the full-cart summary. Conflicting final totals, or a subtotal-only full cart, remain unavailable. On other pages the sidebar subtotal can be reconciled to an explicit cached gross/net pair. A conflicting cached net prevents blindly falling back to a larger sidebar subtotal.

Cache records can be at most 30 minutes old and must match the visible currency and amount (or a reconciled, explicitly labelled gross subtotal). Missing item-selection metadata no longer blocks preparing an account/address. Item details and monetary validity are separate; a summary estimate is not a saved, validated payable order.

DZD uses example rates USD 250, EUR 275; existing per-tab test-rate settings remain honored. Integer centimes with half-up rounding are used. The bubble is converted **net** plus 8% service. When a reconciled discount exists, the crossed-out amount and green saving compare gross/net DZD quotes including the corresponding 8% fees. Expanded detail shows converted gross, converted discount and service calculated on net. Payment-method fees stay on final review only. Card is 2%; proposed BaridiMob 0.5% is configuration only, not an available integration.

## Timing and the previous empty-value flash

| Activity | Timing |
| --- | --- |
| DOM / interface check | Every 500 ms while the document is visible |
| IndexedDB scan | Startup, window focus, then every 2 seconds while visible |
| Accepting a changed amount | After it stays stable for 300 ms (previously 900 ms) |
| Short unreadable transition | Keep the last accepted estimate for up to 2 seconds, dim it and mark it updating; then clear it |
| Cross-tab setup signal | Native localStorage event, with cache rescans providing independent evidence |
| Catchmail message check | One customer-initiated request; no periodic polling and no WebSocket |

The cached estimate shown during an update is not treated as a new confirmed price. Continue is held while updating. Actual payments remain disabled.

## Account, email and address flow

`نكمل` starts setup; it no longer requires a verified SKU list, opens checkout, or resets setup whenever item metadata changes. Account readiness comes from the freshest unambiguous `ckCartLoginStatus` fact, independently of whether a cart amount parsed. Only status/evidence timestamp and customer-reported address readiness are shared across tabs. No email, OTP, credential, address contents or cart snapshot is stored in that shared signal. A newly served login form overrides older positive evidence. A later positive signal from another tab offers refresh in a stale login tab instead of generating another inbox. This is provisional browser evidence, not an authorization mechanism.

Address setup opens Temu's `/address.html` directly. That route was verified in Temu's shipped account-menu module (`Addresses`, href `/address.html`). The panel reopens after the navigation. No setup action clicks `SidebarCheckout` or navigates to merchant payment. On the address-book page the customer can confirm they checked the address. This remains explicitly customer-reported; address extraction and an immutable order/address snapshot are not implemented.

The test-email action requests a random session-bound address from the local server, then fills Temu's actual visible field. The field is `type=text` with an email aria-label, not `type=email`. Exactly one visible matching field is required; an existing different value is not overwritten. Native setter and input/change events notify Temu's form. Only a tab-local opt-in resumes filling after navigation. Choosing an existing account clears that opt-in.

Catchmail addresses are catch-all names: the local generation action chooses an address, it does not create an inbox through a provider API call. Checking messages goes page → service worker → local server → Catchmail. The server requests the latest message list and, if present, its plain-text details. Provider calls are serialized with at least 1.1 seconds between starts; each browser session has a 5-second check cooldown. Requests time out, bodies are bounded, email HTML is not rendered, and codes are not automatically submitted. The address association lives in server memory; restarting the server or losing the local session loses it. Public inbox/recovery limitations remain. No password capture/storage/handoff.

## Interface

The outer launcher is explicitly LTR and anchored 8px from the left edge: circle left, DZD rectangle right. Opening the RTL Arabic panel does not move the launcher to the opposite side. Only the panel's contents use Arabic direction. Colors, uploaded icon, warm panel and reduced-motion-aware animation remain.

## Evidence and remaining limits

- 53 functional tests passed and TypeScript passed. Added coverage includes the supplied nested EUR shape, selected quantity versus stock, getter avoidance, contradictory summaries, scoped/native DB access, readonly entries reads, net/gross reconciliation, EUR/USD separation, account facts independent of SKU parsing and malformed-price rejection.
- Seven real-browser DOM regressions passed for gross-before-net cart layouts, checkout totals, Arabic split prices, crossed-out originals, hidden duplicates, subtotal-only pages and conflicting totals. Run the explicitly labelled internal harness with `node --experimental-strip-types scripts/companion-reader-check.ts`; it uses an ephemeral loopback port and is never started by `npm start`.
- Live browser: the corrected reader reaches the actual scoped database and `entries` store. That test browser's store is empty, and home/cart navigation returns it to login. A sanitized regression based on the supplied EUR structure passes; a populated customer cart, cross-tab completed signup and saved address still require live comparison in the user's signed-in proxied session.
- No complete merchant checkout, payment, Supabase, purchasing automation, durable order storage or account handoff is implemented. No 100% compatibility/error-rate guarantee is established.
