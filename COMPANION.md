# Companion prototype (v26)

Open http://localhost:3000/ to update the worker. If an existing tab keeps the old helper bundle after an update, reload that tab once.

## Implemented

- Blue floating TEMBY control with a DZD estimate and an expandable panel inside the real proxied Temu document. Shadow DOM isolates companion styles from storefront styles.
- Reads the observed desktop sidebar subtotal and checkout selection count. Also supports the observed full shopping-cart summary markup. Unsupported, conflicting, changing or missing values display an unavailable state instead of an assumed zero. Values must remain stable for 900 ms; the reader samples every 500 ms while visible.
- Integer minor-unit calculations, with half-up rounding at each fee stage: converted cart = merchant amount × currency rate; service = 8% of converted cart; bubble = converted cart + service; card fee = 2% of bubble; card estimate = bubble + card fee.
- Example USD rate 250 DZD; EUR rate 275 DZD. Editable rates are kept in this tab's session storage. They are prototype settings, never authority for charging.
- Example: USD 100 converts to 25,000 DZD, service 2,000 DZD, bubble 27,000 DZD, card fee 540 DZD, total 27,540 DZD.
- Cart, account and checkout guidance through existing Temu controls. Account status is never inferred from the absence of a login button. Delivery confirmation is explicitly customer-reported, page-local, and cleared when the observed cart changes.
- Optional email filling when exactly one visible email field is found. Optional cryptographically generated password, explicitly filled only on customer action when exactly one visible password field exists. Passwords stay in page memory; no password capture, persistence or operator handoff.
- Catchmail disposable test inbox creation and manual message checks. The session owns a random address; no caller-supplied mailbox/message URL is accepted. Server memory and idle-session lifetime govern access continuity. Restarting loses the association. Repeated create calls reuse the session's inbox.
- Inbox checks pass through the controlling service worker to a fixed local endpoint; mailbox provider calls are serialized and spaced at least 1.1 seconds apart. Five-second per-session check cooldown, timeouts, bounded response bodies, text-only email display, no OTP/address/body logging. Latest message only. Codes are read by the customer and entered normally; no OTP interception or automatic submission.

## Verified and still open

- Existing 38 regressions plus new money/consensus and mailbox tests. See the current test command output for counts.
- Live browser: bubble and expanded panel render; empty sidebar cart reads EUR 0.00; companion cart button opens real Temu shopping cart; test inbox creation and provider check succeed, returning no messages.
- Adding a live item was blocked by product-options API application error 40002. Token-touch 424 and authentication 429 responses were also observed. These observations do not establish whether the proxy or merchant caused the failure.
- Account guidance reached a merchant security-verification page. No account was created; no OTP delivery, address saving or completed checkout has been verified.
- Nonempty cart, quantity/selection changes, discounts, currency changes and all device layouts require live comparison against Temu. No error-rate guarantee is established. Product names, variants, per-line prices and quantities are not extracted yet. The summary amount is an estimate, not a validated order.
- No saved order, payment, Supabase, purchasing automation, persistent credentials or handoff implementation.

Catchmail's public API requires no authentication; anyone knowing a mailbox address can read it. Messages expire after seven days. It is exposed as a testing option, not durable recovery for customer orders. References: https://catchmail.io/docs and https://catchmail.io/ .
