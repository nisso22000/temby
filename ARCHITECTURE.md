# Architecture

The active path is browser -> UV service worker -> local Node relay -> Temu/CDN. Pages execute in the user's browser under localhost:3001/uv-service/. UV is the only active engine.

## Browser runtime helpers

- UV bundle: rewriting machinery used by dynamic page code and client hooks.
- UV client and handler: browser API interception and virtual location/cookie/storage behavior.
- Our configuration: URL normalization, native resource semantics, navigation containment, worker context and cookie-write synchronization.
- Service worker: request interception, context mapping and response transformation.
- Relay adapter: binary response decoding, legacy compatibility and local transport.

These are runtime dependencies of the current architecture, not shopping business logic. Removing them breaks proxy behavior. Production still needs an engine runtime, but its packaging, compatibility and security isolation need further work. Diagnostic logging is opt-in and records bounded metadata only. Owned regression fixtures are disabled in the normal server.

## Relay and security semantics

The Node relay validates HTTPS merchant/CDN destinations and public connection DNS answers, verifies TLS, bounds bodies, validates virtual Origin/Referer and filters local/hop-by-hop headers. Merchant Authorization and opaque page-generated values pass unchanged. No proof values are synthesized. Server HttpOnly cookies take precedence when merging virtual and server cookies. 401/403 pass through; 429 retains the original response during its per-method/URL cooldown without disabling other requests.

Original response CSP and integrity checks remain enforced. Integrity resources and stylesheets retain their original bytes. Helpers are currently inserted inline; policies that reject this remain incompatible. No cross-origin frame access is granted. Classic blob workers have owner context registration; arbitrary worker cases remain incompletely verified.

## Transport and caching

The negotiated binary envelope is a four-byte big-endian metadata length, UTF-8 JSON status/header metadata, and unencoded response bytes. The client exposes the body as a stream. Node still downloads the bounded upstream body fully before response processing; this is not end-to-end streaming.

A process-wide cache reuses only explicitly public, fresh successful kwcdn image/style/script/font responses, excluding cookies, authorization, Vary, ranges and APIs. It is capped at 32 MB of body data and 256 entries, respecting Age/Date/max-age with a one-hour maximum. Server sessions remain separate from this public cache.

## Engine migration boundary

Relay validation, binary framing, public caching, server sessions and metadata are largely engine-independent. UV subclasses, browser hook APIs, rewriting/import patches, worker integration and cookie synchronization require engine-specific replacement or revalidation. Changing engine is a separate migration, not a package rename. Scramjet is not installed or active after cleanup; the former incomplete experiment can be recovered from Git history if needed.

## Current scope

The user reports successful account creation and reaching the merchant checkout page, alongside browsing and infinite loading. This is not a completed purchase. No real cart extraction, DZD conversion/payment or purchase fulfillment logic is implemented. Local server isolation is not production multi-user isolation; session capacity and persistence require further work before public deployment.
