# v23/v24 performance investigation — 18 October 2026

Main workspace production source unchanged. Comparison copies use localhost:3023 (v23) and 127.0.0.1:3024 (v24, local origin configuration adjusted). Temporary timing probes removed from source after testing. Installed workers may retain their probe/helper cache until their next normal update.

## Live browser attempts

Five homepage navigation attempts per version, alternating start order and preserving browser sessions. In-app browser, not Brave. Local hostname differs to separate cookies; environment and session differences limit causal conclusions. First navigations can include worker/helper startup; subsequent attempts reuse caches. Start order is alternating, not randomized. Both tabs can have background work running, so results are not controlled independent cold-start samples.

Recorded homepage load events (seconds):

| Attempt | v23 | v24 |
|---|---:|---:|
| 1 | 24.654 | 19.320 |
| 2 | 20.968 | 19.708 |
| 3 | 13.700 | 10.050 |
| 4 | 12.816 | unavailable |
| 5 | 2.674 | unavailable |

These are NOT time-to-usable-storefront measurements. Recorded samples had zero recommendation links and often zero loaded images; screenshot confirmed a blank page. Later pages reached login. Browser control timed out/reset once, and no v24 probe events could be recovered for attempts 4–5. Do not treat missing samples as fast or successful. No valid overall browser-speed winner can be declared.

Redacted server health snapshots contain upstream Temu 403, 424 and 429 API responses in both versions, plus an isolated v24 telemetry transport failure. Snapshots aggregate the server session history and are not exclusively scoped to these five attempts. No further live retry loop was performed. These observations do not establish why Temu returned those statuses or whether proxy/session compatibility contributed.

## Isolated rewriting CPU tests

Five rounds, alternating version order, same public 788,455-byte vendor script, parsed/re-written but never executed. Node VM on this machine; timings include runtime scheduling/JIT/GC and are NOT browser page-load timings. Vendor outputs had equal length, not verified semantic equivalence by this benchmark. Synthetic HTML uses owned markup, no merchant account data.

| Round | v23 vendor rewrite, ms | v24 vendor rewrite, ms |
|---|---:|---:|
| 1 | 2099.85 | 2342.09 |
| 2 | 1806.19 | 2000.67 |
| 3 | 1855.80 | 2109.82 |
| 4 | 2000.16 | 1952.41 |
| 5 | 2343.30 | 2566.08 |
| Median | 2000.16 | 2109.82 |

v24 slower in four of five script pairs; median difference about 110 ms (5.5%). No statistical confidence or whole-site slowdown percentage is claimed. Much of this large-script rewriting cost exists in both versions.

Other five-round medians: owned 100-card HTML rewrite v23 46.30 ms / v24 81.05 ms; helper injection v23 0.24 ms / v24 0.34 ms.

## URL normalizer isolation

Separate five-round CPU experiment with 500 owned product-style links:

| Variant | Median rewrite, ms |
|---|---:|
| v23 | 283.88 |
| v24 | 601.14 |
| v24 with only v23 URL normalizer substituted inside VM | 310.17 |

Strong evidence that v24 URL normalization adds HTML rewrite CPU cost on link-heavy content. Does not prove it explains live blank pages, all vendor-script differences, or login redirects. No rollback or production modification made.

## Next-version priorities

1. Optimize the URL-normalizer common path, retaining the narrow login return repair and its correctness tests. Check non-login URLs without repeated exception-driven URL parsing where safe; preserve unusual/encoded URL behavior.
2. Investigate reuse of transformed public immutable JavaScript. Existing server public cache saves upstream fetching, not UV browser rewriting CPU. Any transformed cache must key the original resource identity/content, engine/config version, rewrite context and local origin; exclude private/API/cookie-bearing content. Benefit on repeat parses only, not guaranteed first-visit gain.
3. Fix stage-level observation before claiming cookie latency. Relay/cookie substage probe returned no usable measurements, so this report cannot quantify cookie-commit overhead or justify reverting it.
4. Diagnose blank/loading behavior and merchant API failures against a matching direct-browser baseline before declaring storefront speed improved. Respect upstream rate limits and avoid counting login/rejection pages as successful shopping loads.

Raw artifacts: five-runs-raw.json, rewrite-profile.json, url-profile.json, v23-health.json, v24-health.json. Benchmark scripts are local investigation artifacts and are not loaded by the main application.
