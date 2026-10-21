# Localhost Temu proxy

Run `npm start` from this directory and open http://localhost:3000/. The entry opens the UV launcher on localhost:3001; browsing stays under /uv-service/. There is no outer iframe, remote browser or system proxy.

Node 22.19 or newer is required. Dependencies are installed with `npm ci --ignore-scripts`. Stop with Ctrl+C. Restart after server-source changes; restarting clears the in-memory server cookie jars. Ports default to 3000/3001, with PORT and MERCHANT_PORT overrides. Both listeners bind to loopback.

## Current implementation

Ultraviolet 3.2.10 is the only installed rewriting engine. Its browser helpers keep navigation, requests, cookies, storage and workers in the virtual merchant context. The local Node relay preserves page-generated end-to-end headers and server cookies. Binary response transport removes response base64 encoding, with the JSON protocol retained for older open clients. A bounded public-static CDN cache stores eligible resources (32 MB / 256 entries, maximum one hour within upstream freshness). Account/cart/search APIs are excluded.

Version 22 streams successful image/font bodies without waiting for complete upstream downloads, propagates abandoned GET/HEAD cancellation, reuses helper packaging with file-change invalidation and ETag validation, and caches safe helper escaping. Executable/document rewriting and mutating requests retain the conservative paths. Only complete public streamed bodies up to 2 MiB are collected for caching; larger assets stream without accumulating a full cache copy. Limits and original response bytes remain enforced.

The user reports successful browsing, infinite loading, account creation and reaching the checkout page. A completed purchase has not been established. No DZD bubble, real cart extraction, local payment checkout or purchasing workflow is implemented.

This is a tested UV development baseline, not a public-production certification. The server is still loopback-only, capped at 100 in-memory sessions, with local diagnostics that must not be exposed as-is. Public hosting, durable sessions and multi-user origin/isolation design remain separate work. The v22 browser automation runtime was unavailable; fresh real-browser validation remains pending despite passing functional HTTP/client tests.

## Development checks

- `npm test`: active proxy, transport, isolation and compatibility regressions.
- `npm run typecheck`: TypeScript validation.
- http://localhost:3000/diagnostics: local-only request metadata.
- `node --import tsx scripts/context-check-server.ts`: isolated owned-test server on 3940/3941. Only that explicitly enabled server serves the synthetic fixture origin; normal npm start disables it.

Old Scramjet, plain-proxy and legacy /_p implementations, the unused business UI/cart demo, and historical probing scripts have been removed. Recovery remains available in Git commits faaeab7 and 1f548eb. Do not use old experiment URLs.

See ARCHITECTURE.md and PROXY-LIMITS.md for current behavior. TEST-REPORT.md retains dated historical observations; its newest entries supersede earlier implementation descriptions. No performance benchmark was run for v21.
