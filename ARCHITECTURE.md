# Architecture

The active path is browser -> UV service worker -> local Node relay -> Temu/CDN. Pages execute in the user's browser under localhost:3001/uv-service/. UV is the only active engine.

## Browser runtime helpers

- UV bundle: rewriting machinery used by dynamic page code and client hooks.
- UV client and handler: browser API interception and virtual location/cookie/storage behavior.
- Our configuration: URL normalization, native resource semantics, navigation containment, worker context and cookie-write synchronization.
- Service worker: request interception, context mapping and response transformation.
- Relay adapter: binary response decoding, legacy compatibility and local transport.

These are runtime dependencies of the current architecture, not shopping business logic. Removing them breaks proxy behavior. Helper files/composed configuration are memoized with file-signature invalidation and SHA-256 ETags; HTTP revalidation can return 304 without retransmitting unchanged bytes. Safe inline helper escaping is cached separately from per-document initialization. Failed local helper initialization can recover on a later request instead of poisoning the worker. Packaging preserves script order, CSP enforcement and executable semantics. Diagnostic logging is opt-in and records bounded metadata only. Owned regression fixtures are disabled in the normal server.

## Relay and security semantics

The Node relay validates HTTPS merchant/CDN destinations and public connection DNS answers, verifies TLS, bounds bodies, validates virtual Origin/Referer and filters local/hop-by-hop headers. Merchant Authorization and opaque page-generated values pass unchanged. No proof values are synthesized. Server HttpOnly cookies take precedence when merging virtual and server cookies. For UV, script-visible cookie absence is authoritative: stale non-HttpOnly server entries are not reintroduced after browser expiry/deletion. Legacy transports retain their fallback behavior. 401/403 pass through; 429 retains the original response during a per-method/URL cooldown only when the merchant supplies an explicit future Retry-After; no fallback minute or automatic retry is invented.

Version 24 commits response cookies in the worker before transport handoff, initializes documents from the committed script-visible cookie snapshot, suppresses UV's duplicate asynchronous write, and notifies tabs only after commitment. Script-cookie writes use the current virtual page URL after SPA navigation. The known Temu login.html from parameter is repaired only when it contains this origin's encoded proxy prefix and resolves back to the same merchant origin; unrelated query bytes and opaque fields are preserved. This does not manufacture authentication or bypass a merchant login requirement.

Original response CSP and integrity checks remain enforced. Integrity resources and stylesheets retain their original bytes. Helpers are currently inserted inline; policies that reject this remain incompatible. No cross-origin frame access is granted. Classic blob workers have owner context registration; arbitrary worker cases remain incompletely verified.

## Transport and caching

The negotiated binary envelope is a four-byte big-endian metadata length, UTF-8 JSON status/header metadata, and unencoded response bytes. Successful GET image/font responses stream from upstream through Node and the worker with backpressure and decoded-byte limits. Only complete eligible streamed bodies up to 2 MiB are accumulated for caching; larger bodies are not accumulated. HTML, scripts, styles, error responses, legacy transport and mutating requests retain full bounded-body processing. Cookie headers are processed before body delivery.

UV does not pass request signals to its transport. A worker-local WeakMap associates each request's header object with its native signal without introducing an upstream header. The relay adapter forwards it only for reads. Node aborts GET/HEAD upstream work on client disconnect, combining cancellation with the existing timeout; writes are not newly canceled by this mechanism. A failed stream closes the local body rather than appending an error envelope to already delivered bytes. Partial bodies never enter the public cache.

A process-wide cache reuses only explicitly public, fresh successful kwcdn image/style/script/font responses, excluding cookies, authorization, Vary, ranges and APIs. It is capped at 32 MB of body data and 256 entries, respecting Age/Date/max-age with a one-hour maximum. Server sessions remain separate from this public cache.

## Engine migration boundary

Relay validation, binary framing, public caching, server sessions and metadata are largely engine-independent. UV subclasses, browser hook APIs, rewriting/import patches, worker integration and cookie synchronization require engine-specific replacement or revalidation. Changing engine is a separate migration, not a package rename. Scramjet is not installed or active after cleanup; the former incomplete experiment can be recovered from Git history if needed.

## Current scope

The user reports successful account creation and reaching the merchant checkout page, alongside browsing and infinite loading. This is not a completed purchase. The companion observes supported cart JSON responses and restores snapshots from scoped IndexedDB for DZD estimates. Guided test-account preparation and manual address confirmation are implemented; actual payments and purchase fulfillment are not. See COMPANION.md for the complete state contract. Local server isolation is not production multi-user isolation; the in-memory one-hour sessions and 100-session cap are not a public multi-server design.
