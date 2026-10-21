# Mobile cart investigation — 20–21 October 2026

## 21 October v48: why desktop and mobile differed

The user's sidebar/bubble observation matches the inspected traffic. Desktop can naturally receive a full sidebar cart; mobile's `user_cart_num` reply gives selected SKU quantities but no payable amount. Both layouts can use Temu's full cart API. TEMBY now uses the count only to detect that its saved full response is stale, then requests a full response through the page client. The user's pasted complete `/cart_modify` delete response is accepted directly. HTML bootstrap cart extraction and the five-second database scan were removed because they could compete with newer live responses. The full response remains the price authority; the account-scoped database stores only validated copies.

The browser fixture covers desktop and mobile, direct full delete responses, changed versus matching bubble counts, an overlapping old read versus a completed edit, and returning to an old tab. All 100 tests pass. No v48 physical Samsung add/delete session has yet been run, so real-device reliability and puzzle/login behavior are open launch checks.

## 21 October follow-up: saved amounts and delete acknowledgements (v47)

The customer later supplied an actual successful `/api/bg/bg-uranus-api/uranus_cart/cart_modify` response from a cart-page delete or quantity edit. It already contains `cart_list_info.goods_sku_list`, `discount_info.order_amount_dto`, `cart_transfer_map` and `checkout_layer_track_info`. The current adapter accepts that exact response as USD 16.72, three SKU lines and five selected units, with zero invalid lines. Therefore, the missing-operation acknowledgement path below does **not** explain this particular failed delete. The remaining loss is between observing, publishing, storing and displaying that complete response; a synchronized trace of those stages is needed to identify which one failed. The adjacent `user_cart_num` response contains quantities and selection but no authoritative payable total. The `shopping_cart?scene=shopping_cart` response in the paste is recommendations with a zero suggestion price, not the actual full cart.

The customer reported two remaining failures: a new tab in an older browser kept the old amount after cart edits, and a Samsung private cart-page delete left the companion unchanged until a later homepage add. The first has a direct code cause: the worker returned a saved snapshot and skipped its read forever. V47 now rechecks a saved snapshot after 15 seconds of age and a 30-second read-attempt cooldown shared by tabs. The second has a plausible code cause: successful edit replies that contain no full cart and no recognized operation did not always trigger a full read. V47 recognizes an explicit successful cart-operation acknowledgement on the Temu cart API, and accepts a page-client read only when the worker actually publishes validated full cart facts. Failed replies and count/tracking responses remain excluded.

The owned browser fixture passes a delete acknowledgement without an operation number and a returning mobile tab whose cart changed while the old tab was closed. The actual Samsung delete response during the reported failure was not captured, so this is **not yet a confirmed physical fix**. The local server was stopped after tests so the customer can start it manually.

## Earlier v46 work: use the live homepage client for full cart reads

The customer's request to find mobile's full data led to inspection beyond the cart-page store. The homepage's live store is __INITIAL_PROPS__.stores.store, whereas the cart uses __INITIAL_PROPS__.store. Both expose a merchant postRisk client. The old capability probe checked only the cart location and therefore missed the homepage service. Bounded structured-state discovery found no complete canonical packet in the inspected homepage graph; this is not proof that no other cache exists. The cart's rawData bootstrap copy was visibly older than its current live store, so it must not be treated as automatically current.

A separate diagnostic homepage tab was opened while preserving the customer's cart tab. One read-only NORMAL_RENDER=1 / FullSkuData=2 request through the homepage's own postRisk client succeeded in 519 ms, returned EUR 87.82, two lines and seven selected units, and was accepted by the existing validator. Evidence: artifacts/mobile-session-investigation/homepage-sdk-cart-read-*.json. A separate diagnostic product tab redirected to login before a usable product client was found; standalone product-client availability remains unverified. No cart mutations, signup, login or challenge interactions were performed by the agent. The diagnostic tab IDs are recorded in runtime-cart-sources-*.json for cleanup when the phone reconnects.

V46 now negotiates page-client reads over a bounded MessageChannel. Only the current controller can ask the companion to perform the fixed read-only operation. The page invokes its existing client; only availability/validation results cross this channel. The response itself is still observed, validated and saved through the existing relay/worker path. No credential extraction or new trust in arbitrary page price text is introduced. Hydration wait is bounded. A client refusal/error/timeout cannot trigger an automatic duplicate fallback request. Page departure releases its port; joined work can use the newer page. Pages without a supported client retain the prior relay fallback for compatibility.

All 97 tests and TypeScript pass. The owned-browser test rejects any full read missing the page-client marker, then verifies delayed initialization, add/remove to empty, refusals without duplicate reads, client failure/recovery and leaving an unfinished read. Both desktop and mobile pass. Existing no-client fallback startup, burst sharing and stale-empty-cart scenarios also pass. Evidence: artifacts/improvements-v46/merchant-client-browser.json and artifacts/improvements-v46/fallback-startup-browser.json. On 21 October no Android device was connected, so the integrated v46 phone check remains pending. The local server had stopped and was started with the current source; no running authenticated server was restarted.

## Earlier v45 field report: cart sync remains intermittent

After the successful post-signup v45 add, the customer reported missed removals and adds, followed by working removals. This overrides any interpretation of that one success as broad reliability. The active phone worker was verified to contain the identity correction. The Android browser exposed another debugger socket, chrome_devtools_remote_14665; the default socket stopped responding. The passive capture was reconnected without navigating or changing the cart.

The available page history confirms two removals published and selected new totals (EUR 182.64 → 166.29 → 87.82). The current merchant SDK store and one authorized read-only full-cart probe both returned EUR 87.82 with seven selected units; no mismatch was reproduced in that comparison. Owned desktop/mobile tests now exercise three removals down to an empty cart, with both count and visible amount changing. These passing attempts do not identify the remaining intermittent failure. No further production cart fix is claimed from this investigation; a failed add/removal with its complete request-to-widget timeline is still required. Passive capture is active for a bounded run.

## Current v45 correction: verification proof mistaken for cart identity

The customer reported v44 remained intermittent, especially before a cart-page visit. Passive capture followed tab and worker lifetimes without merchant interactions. One accepted single/operate_cart response was followed by an accepted full cart_modify_page response, but the page had no corresponding selected trace until shopping_cart.html was opened. The old response trace happened before publication, so it did not establish that the update reached the page. Added traces now report publication and each explicit discard branch.

Read-only inspection of cookie names used for the cart identity found AccessToken, api_uid, user_uin and verifyAuthToken. The old broad auth/token regex included the verification proof and empty account cookies. Its proof value could rotate while the account/cart remained the same. Owned-browser reproduction changed only this proof during a delayed full read: guest/authenticated × desktop/mobile all discarded the valid result with identity-changed-during-request and stayed at 0. After the fix, the same four cases display 7,218.75 DZD. Evidence: artifacts/improvements-v45/identity-rotation-before.json and identity-rotation-after.json. The precise discard reason for the earlier physical failure was not recorded, so that historical event is not claimed as a proven proof-rotation instance.

Cart identity now excludes verification/challenge/CSRF proofs and empty values. Real authentication credentials plus account identifiers take precedence over a guest API ID; the guest API ID takes precedence over a separate device fingerprint. A remembered account ID without credentials cannot restore a signed-in cart. Merchant cookies are still forwarded normally, and no proof values are retained in diagnostics.

A second correction carries the accepted-change time into refresh failures. A refused read after an accepted add can no longer leave a saved zero looking current. Owned fresh desktop/mobile tests verify the warning persists on navigation without retries and clears after the next accepted change/read. They retain the warning-free ordinary fresh-cart case and use a 400 ms merchant clock offset similar to the capture. All 94 tests and TypeScript pass.

Before v45's identity change, the customer's final existing-session add passed: full read and publication were captured and the customer confirmed the companion updated. This was after a cart-page visit, so it does not prove cold-start reliability. The corrected v45 worker was installed without navigating, clearing merchant data, or restarting the server; the later fresh-session phone test passed after the customer completed signup. On target 2267, an accepted add was followed by publication of EUR 3.86 and the companion showed one selected item / 1,114.58 DZD. The customer confirmed no cart-page visit; captured snapshots for that target contain no cart page. This confirms the signed-in case after signup, not challenge-free guest browsing. The capture also contains merchant cart_modify reads refused with HTTP 403/error 40001 even when the merchant request carried its own verification header. Puzzles, login recovery without another cart mutation, and broader 429 reliability remain open.

## Earlier v44 correction: missed mobile mutation routes

The customer confirmed that Temu successfully added an item in Samsung private Chrome while the companion stayed at 0 DZD. V43's initialization and retention checks did not verify this real mutation path. Read-only inspection of already-loaded mobile SDK scripts found /uranus_cart/single/operate_cart and /uranus_cart/batch/add_cart. Our observer recognized their URL family but only requested a fresh snapshot if the body contained cart_modify_type. These separate routes do not require that field. This is a confirmed code gap; the exact private-window request body was not captured.

V44 explicitly recognizes these routes and remove_and_add, also present in the loaded SDK. Only a successful response missing a full accepted snapshot triggers the existing coalesced full read. Failed replies, counts and tracking do not trigger reads. Tests now start with a confirmed empty cart and perform all three mutation routes without an operation field, checking new quantities after each on desktop/mobile and no cart-document requests. All 93 tests and TypeScript pass. Physical private-window retest is pending; Chrome's USB target list exposed only the regular proxy tab during inspection. No merchant cart mutation was performed by the agent.

## Earlier v43 outcome: the missing wire format and initial API read

V42 only retained a snapshot; it could not create one at the start of browsing. The customer correctly rejected that as the intended final behavior. Inspection of the already-loaded mobile SDK established NORMAL_RENDER=1 and FullSkuData=2, with the latter selecting /api/bg/bg-uranus-api/uranus_cart/cart_modify_page. The SDK also defines mutation types 2/3/4/5/6/11/13/14. No mutation operation was invoked on the real phone.

A bounded read-only API probe succeeded with HTTP 200, success=true, error_code=1000000. Its result keys were snake-case: cart_list_info, cart_transfer_map, discount_info and related fields. The old reader only accepted camel-case cartListInfo, explaining the successful raw mobile responses being marked unsupported. The SDK's initial-document copy had already converted those keys. The normalizer now projects either spelling through its existing financial checks; conflicting aliases fail closed. We did not recover the older bodies, so this identifies the observed successful wire contract rather than claiming byte-for-byte reconstruction of every earlier response.

Two earlier background cart-document probes returned small HTML without a supported cart packet. Those are not counted as successful reads or as refusal evidence. The production initializer uses the successful read-only API, not a background document load. It supplies no item IDs/quantities/selection changes or fabricated proof tokens.

The worker initializes from a full API read when no usable saved snapshot exists. A recognized successful partial mutation acknowledgement causes a shared refresh; full replies update directly. It performs no count-triggered or timer-based merchant polling. A failed initialization is remembered for the identity, and refusals are not automatically retried. Changes completed during a read can schedule one subsequent read; overlapping notifications otherwise share the work.

At 16:53:51 UTC the existing Samsung homepage was brought forward. The local worker was updated, only TEMBY's derived cart record was cleared, and the homepage was reloaded once. By 16:53:54 UTC it displayed nine selected items, EUR 423.58 and 122,308.73 DZD, with source=response and no issue. No cart-page request/navigation, login, challenge action or cart mutation was performed in this verification. Its prior saved display had shown ten items/EUR 425.49; the new value comes from the fresh API. We do not treat the old saved display as an oracle. The current merchant cart UI was not independently revisited to reconcile that difference during this test. Evidence: artifacts/improvements-v43/physical-homepage-startup.json.

The first capture is also preserved as physical-homepage-startup-2026-10-20T16-53-51-053Z.json. After the final pending-state and strict alias checks, a second cold-homepage verification at 17:07 UTC again cleared only TEMBY's derived copy, stayed on the homepage and obtained nine selected items/EUR 423.58. Its before/after values matched. The latest physical-homepage-startup.json and a timestamped copy record this run. No cart mutation or challenge interaction was performed. Tests verify that Next is disabled during a pending changed-cart read; the state is released on completion instead of a fixed delay.

The full suite passed 91 tests; focused alias/ambiguity checks and TypeScript passed after the final alias validation. Owned desktop/mobile tests independently confirm cold homepage initialization with zero shopping_cart.html requests, successful partial-change refresh, burst coalescing, no count polling and no refusal retry. Physical mutation-response reconciliation remains unverified. Another existing phone tab was later observed at verification; this cart-read correction does not establish that the separate puzzle problem is fixed.

## Earlier v42 outcome: the cart follows browsing

The customer correctly identified that v41 only handed the initial snapshot to the cart page. The worker used an in-memory map, the read handler required shopping_cart.html, and it rejected any snapshot older than the new navigation. That could not retain a cart on product/home pages. The earlier broad statement that the mobile cart worked overstated the tested scope.

V42 stores validated response facts in temby-cart-state IndexedDB, scoped to merchant origin and a digest of authentication/session identity. The worker reads this local record on companion startup regardless of shopping path; it opens one database connection per worker lifetime, with bounded failures and a memory fallback. New accepted full snapshots replace the record. Original timestamps and the existing age checks are preserved. A failed update remains a warning on later pages. Explicit logout persists an invalidation barrier and clears the record; a late earlier response cannot restore it. Identity mismatch or unknown identity does not restore another account's record. Cookie values are used only in memory to derive the digest and are never saved in this record or diagnostics.

Physical verification at 16:24 UTC found nine selected items and EUR 423.58 already present before the agent test. One worker update and cart refresh were followed by homepage navigation, opening an existing cart item's product, and a product reload. Each page showed nine selected items, EUR 423.58 and 122,308.73 DZD, with source=response and no issue. No cart mutations, login, challenge interaction or purchase were performed. The signed-in server session was preserved. Evidence: artifacts/improvements-v42/physical-phone-cart.json.

Owned desktop/mobile fixtures also verify leaving the cart without another cart API response, worker-stop/restart survival and persistence of later failure warnings. The full suite passed 90 tests; final targeted persistence tests and TypeScript passed after the warning-retention addition. A test-port collision was avoided by choosing available ports for the affected compatibility fixture, leaving the unrelated listener untouched. Evidence: artifacts/improvements-v42/browser-verification.json.

This proves browsing retention for the tested cart, not live add/remove/quantity-change detection for every real merchant response. An initial full snapshot is still required before there is an amount to retain. Earlier findings below remain historical evidence.

## Earlier v41 outcome: the populated mobile cart is readable

After the customer signed in normally, read-only inspection found the canonical successful cart packet at rawData.store.apiStore.cartModifyData. The same packet is present as JSON in the initial cart document script, following window.rawData=. Its eight selected lines total EUR 421.06. The existing normalizer accepted it, including the transfer-map currency despite absent ckCartCcy. Only anonymized item IDs and required numeric/cart fields were saved as a fixture; no names, account fields or original IDs were retained.

The fix observes shopping_cart.html responses and parses only the known initial JSON packet, without evaluating scripts or scraping visible prices. Existing cart validation is reused. A bounded worker cache allows the newly-created companion to request the snapshot locally after its listener exists. The reply is restricted to the matching cart origin and current navigation start. No additional merchant request is made.

Initial attempts to update the phone worker through the page returned a cannot-start-worker error without refreshing the cart. The browser debugging ServiceWorker.updateRegistration operation then allowed activation. One ordinary cart refresh at 16:06:21 UTC produced source=response, eight selected items, EUR 421.06 and 121,581.08 DZD by 16:06:24 UTC, with no cart issue. The bubble bottom was y=566 in a 641-pixel viewport, above the merchant checkout bar. The server was not restarted and the existing signed-in session was preserved. This replaces the earlier blanket statement that no agent navigation occurred: this final verification performed the single authorized cart refresh, with no login/challenge/cart mutation or checkout action.

All 88 tests pass. Owned desktop/mobile browser fixtures confirm initial-document-only cart initialization with no scdb or later cart API request, alongside earlier cart behaviors. Physical evidence is artifacts/improvements-v41/physical-phone-cart.json. This is a verified initial-read fix; it does not prove reliable repeated mutations or reduced challenge frequency. The earlier approximately 60 KB unsupported cart API responses were not recovered and their schemas remain unknown; this fix addresses the observed initial document path rather than claiming those responses have been understood.

## Follow-up: eight-item cart, completed puzzle, then login

A later offline transport audit reproduced a separate compatibility defect: Undici fetch overwrites browser Sec-Fetch-Mode values, including navigate, with cors. The source now preserves the actual supplied mode at final dispatch, with a receiving-server regression test. This is a proven metadata correction, not a proven cause or fix for the observed cart/login refusals. The running phone session was not reset or server restarted. An accepted mobile cart response is still needed before extending the parser to an additional schema; the current phone is on login. A fresh passive capture was prepared and the customer was asked to sign in normally and open the cart once, stopping on another challenge/refusal.

The customer solved the existing puzzle and opened the cart, reporting eight items. The companion still displayed — DZD. Temu's total was covered by our bubble. Pressing the merchant's Commander button opened login; the customer went back.

Read-only inspection then confirmed the cart page was visible and the companion's source was unavailable. Neither known scdb database was available at that origin. This does **not** mean that Temu's cart was empty. The existing API timeline retained two HTTP-200 cart_modify responses: 61,785 bytes at 15:34:58 UTC and 60,488 bytes at 15:37:11 UTC. Both were marked unsupported-schema. Their full JSON shapes were not captured, so we cannot yet identify the missing mobile contract or assume those responses contain a usable total.

The first ten-minute passive capture expired before these actions. It contains no events and is not evidence that no requests occurred. A new capture was started before one customer-requested refresh. It recorded token/touch HTTP 424, cart_modify HTTP 403 and navigation to login at 15:39:24 UTC. Local session diagnostics confirmed the cart refusal came from the merchant relay response, with error 40001, rather than our host allowlist. Search activation also returned 429. The proprietary codes do not establish the root cause. No login submission was requested or automated.

The mobile footer overlap was measured on the Samsung: a 55-pixel fixed merchant bar started around y=588 in a 641-pixel viewport; the companion extended down to y=630. The source now places the mobile bubble 76 pixels above the viewport bottom, plus the device safe-area inset, and reduces panel height accordingly. This reserves a 64-pixel bottom-control area with a 12-pixel gap. Desktop placement is unchanged. Owned desktop/mobile browser checks passed, including an assertion that the mobile bubble clears that area. This source change has not yet been confirmed loaded on the physical phone and does not fix cart parsing or session refusals.

The follow-up session already exposed the separate API timeline, so the earlier instruction below that it still needed a server restart describes the earlier observation only. No server restart was performed during this follow-up. Temporary USB debugger forwarding needed restoration; future captures must verify connection continuity as well as elapsed recording time.

## What the customer reported

The merchant cart already contained seven items. On the phone, a product opened, a size was selected, and Temu showed an immediate successful add. The companion still showed no DZD amount. Opening a recommended product afterwards led to a puzzle; the customer stopped without solving it.

This is not evidence of an empty merchant cart. It separates a missing companion snapshot from a later merchant verification refusal.

## Read-only phone observations

- Samsung connected through ADB with localhost ports 3000/3001 forwarded.
- Chrome tab visible; worker v39 activated; cart console tracing present and the page-total fallback absent.
- The homepage session successfully received goods-list, cart-count and other API responses. Its initial retained health report had no failures. A successful numeric merchant code such as 1000000 was not treated as a failure by itself.
- Neither known scdb database existed at the inspected physical browser origin. Native enumeration also found no scdb name. This says there was no supported saved cart copy there, not that the merchant cart was empty.
- The companion had no supported full snapshot, no accepted total and no cart-update error. It could not calculate a quote from the cart-count response.
- The customer action capture recorded add-cart at 14:44:52 Algeria time, then a later control click at 14:45:37 and navigation. Token-touch returned 424/error 40001 around 14:45:38. The subsequent local health snapshot included search-activation 429/error 40002 and an opt request 403/error 40001. It also showed an obtain_captcha request.
- A later frame inspection confirmed the main document was a merchant verification page.
- Current verification-page console history showed no supported cart snapshot. This does not recover all messages from the previous product document.

The initial capture did not retain the successful add's response. It recorded the click and later failure sequence. The helper now also understands relay-envelope responses for future controlled captures. We did not ask the customer to repeat an action while stopped at the puzzle, replay a write request, solve a challenge, or log in.

## What the pasted diagnostic report establishes

| Event | Evidence | Interpretation |
| --- | --- | --- |
| SKU lookup/integration | HTTP 200, application error 40002, retained as a failure | Network transport completed but the operation failed at application level. It is not proof of poor internet. |
| Search | HTTP 403, error 40001, relay outcome | A merchant refusal reached the proxy. |
| Token touch | HTTP 424, error 40001, three retained occurrences | A token/session-related endpoint failed; the proprietary error meaning is not established. |
| Login-history query | HTTP 429, error 40002 | A merchant refusal/rate-limit response; the exact cause is not established. |
| Google/Facebook/Apple hosts | Local allowlist 403 | Intentional TEMBY restriction, separate from merchant refusals. |

The upstream count of 658 is cumulative for that local session. It is not a count attributable to one quick-add click. The retained 100 general events span about one minute and include 46 pftk plus 15 thtk requests. Those were forwarded successfully in this sample, not locally telemetry-blocked. Image/telemetry traffic pushed earlier API events out of the general ring.

There were no click markers in the pasted report. It cannot prove which failures happened solely because the homepage opened versus a particular later action. The later physical-phone capture provides a separate action/navigation sequence, not retroactive markers for the pasted report.

## What changed in v40

1. A separate per-session API timeline keeps the latest 100 API metadata events, including successes. General images/telemetry cannot erase it. No raw bodies, query values or credentials are added. It appears as apiTimeline in the diagnostic screen after the server code is activated.
2. Cart observation now includes the validated merchant uranus_cart API namespace, rather than only cart_modify. Strict response schema/currency/amount checks still decide whether a response can provide a snapshot. No additional merchant request or polling is introduced.
3. Count-only/acknowledgement responses from the additional paths do not fabricate a total, raise a full-cart error, or advance the full-snapshot ordering watermark. A supported full snapshot from another family route can be accepted. Fixture coverage includes merge and count-only responses; this does not prove the actual mobile add uses merge.
4. Read-only debugging helpers capture safe phone state, temporary action timing and API response summaries. Temporary event listeners are removed when the capture ends. No merchant interaction is performed by those helpers.

The v40 source changes do not establish an initial complete mobile snapshot. That is still required. Initializing through a legitimate read-only merchant operation may be needed; its actual contract must first be observed. We did not add speculative request bodies, manufacture proof headers, read visible prices, or create a hidden cart page.

## What remains unknown

- The exact successful mobile add response and full-cart initialization operation/schema.
- Whether the verification failures originate from lost/stale state, rewriting/context mismatches, network/browser differences, merchant guest-session policy, or a combination.
- Whether a customer-completed challenge stays valid through repeated product/search/cart navigation and reload.
- Whether duplicate work is an application retry, ordinary dependency loading, or a proxy bug. Request counts alone do not answer that.

Cookie counts remained nonzero in observed requests. Counts alone do not prove that the correct credential values, scope and lifetime were preserved. No undocumented error number is labelled a definitive bot reason.

## Evidence and next checks

Evidence is under artifacts/mobile-session-investigation/: the initial phone session, post-action session, action timeline and cached-script/frame inspection. Raw script sources, raw merchant bodies and credentials are not saved. The user-provided pasted report remains its own separate source.

Next: observe one successful mobile add and an explicit cart read with the improved API timeline/capture, then implement the proven full-snapshot contract. Separately compare state before and after a customer-completed verification without restarting or clearing the session. Follow the architecture decision steps in PROXY-ARCHITECTURE-PLAN.md.

No user server restart or phone navigation/login/cart mutation/challenge interaction was performed by the agent. New server diagnostics require restart; do that only after preserving the current investigation state. New browser observation needs the launcher/page refresh for v40. Existing in-memory merchant sessions are not durable across restart.
