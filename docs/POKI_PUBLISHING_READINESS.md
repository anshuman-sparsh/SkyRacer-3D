# SkyRacer 3D — Poki P0 engineering readiness

Prepared 10 November 2026. This is an engineering candidate, **not Poki acceptance, CSP approval, legal approval, or device certification**. No browser automation, production deployment, Poki upload, database modification, or new PR is part of this milestone.

## Build and run

```sh
npm ci
npm test
npm run build              # Existing web distribution -> dist/
npm run build:poki         # Standalone Poki candidate -> dist-poki/
npm run preview:poki       # http://127.0.0.1:4173/ (manual browser testing)
```

Both build commands run the complete Node test suite. `build:poki` also checks the output for missing/absolute asset paths, backend credentials/transports, analytics, debug tooling, source maps, and test/SQL artifacts. Vite checks the rendered module graph for forbidden dependencies. The Poki root is `dist-poki/index.html`; upload the **contents** of that folder through the Inspector/dashboard, not the repository, `dist`, `.env` files, or the temporary online test output. Relative asset URLs support nested hosts. The official SDK is the sole platform-provided external script; the game can proceed without it. Offline-capable means gameplay works once bundled files are available, not an installable/offline-first PWA.

The standard command still uses the existing online services, Google Fonts and Vercel analytics. It contains no Poki SDK implementation or SDK script. `vercel.json` is unchanged: only main automatically deploys. Do not deploy either distribution without a new owner instruction.

### Optional online candidate — NOT APPROVED

Default Poki builds ignore web backend credentials and use local services. Runtime query parameters cannot turn online mode on. The optional variant is compiled only when **all** these build-environment values are provided:

| Variable | Required value / meaning |
| --- | --- |
| `POKI_ONLINE_APPROVED` | Literal `true`, set by owner only after actual approval |
| `POKI_CSP_APPROVAL_REFERENCE` | Owner-supplied record of that approval; the build checks presence, not authenticity |
| `VITE_SUPABASE_URL` | Exact approved HTTPS origin |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public client key, never a service-role/secret key |
| `POKI_PRIVACY_POLICY_URL` | Owner-published HTTPS policy page |

Then run `npm run build:poki` in that environment. These values are deliberately absent from committed Poki configuration. The gated variant has Classic/Daily/Hangar online service wiring, separate Poki identity storage, no custom telemetry, no country-attribution requests, and no Friend sharing. Its Privacy Policy button uses the documented `PokiSDK.openExternalLink()` method and has no direct-navigation fallback. A failed SDK therefore leaves this external link unavailable: the owner must resolve policy accessibility with Poki before shipping online mode. Public nicknames currently have format/uniqueness/immutability checks, **not a profanity moderation system**. Approve a moderation approach before enabling this public-name variant. The default candidate collects no nicknames.

The gated variant was compile-tested with fake endpoints/public placeholder credentials in a temporary folder; that is not an approval and made no backend requests. No Supabase function or schema changes are needed for the default candidate.

## Architecture and mode behavior

Vite aliases `#platform`, `#game-services`, and `#friend-panel` select implementations at build time. One game engine and one set of models, ring rules, obstacle generation, collision math, score formula, deadline and aircraft abilities are shared. No duplicate source tree or new runtime dependency was introduced.

| Feature | Standard web | Default Poki |
| --- | --- | --- |
| Classic | Existing local best plus verified online submission | Device-local best score and best ring count; Menu -> Local records; no rank or registration |
| Daily | Server UTC date/version and verified ranking | Explicit **Local Daily**; device UTC date and existing v3 seeded layout; best per UTC date/version; automatic local save, no nickname or global ranking |
| Midnight | Existing server submission rules | An issued local attempt keeps its original date/version; the next attempt uses current UTC; previous 90 daily best entries retained |
| Friend | Existing server-verified challenge links | Menu/result actions hidden; no URL-triggered challenge dialog or share link |
| Hangar | Existing server-verified totals/unlocks | Clearly labeled device-local milestones from completed Classic/Daily flights; free starters; Silver Arrow at 100 rings, Voidrunner at 10,000 distance + 500 rings, Nova Vortex at 25,000 + 1,500 |
| Apex Overdrive | Existing earned online reward | Remains locked because Friend wins are unavailable; card explains why |
| Aircraft abilities | Existing per-flight equipment snapshot | Same ability parameters for earned local equipment; never uploaded to web competitions |
| Preferences | Existing storage keys | Namespace `skyracer_poki_v1:` for scores, themes, equipment, local progression, and optional online identity |

Classic records still update during a flight; local cumulative Hangar totals advance once on termination. Refreshing an unfinished flight does not credit a completion. Local data is editable/clearable by the device owner and is never described as verified. Storage denial switches to memory and displays a session-only saving notice. There is no cross-site/cloud save, migration from website records, or local-to-server reward import.

## SDK and advertisement event map

Sources: `src/boot.js`, `src/platform/PokiAdapter.js`, `src/platform/poki.js`, and `src/main.js`.

| Game transition | SDK action |
| --- | --- |
| Startup | Load official async SDK; initialize before game module; SDK failure falls back to playable mode |
| Scene/UI ready and first frame rendered | `gameLoadingFinished()` once |
| Player clicks Start Flight / Play Daily for first flight | `gameplayStart()`; first entry has no commercial break |
| Running -> pause, Help, Menu, leaderboard, Daily dialog, hidden tab | `gameplayStop()` once |
| Running -> barrier, black ring, ring timeout | `gameplayStop()` once |
| Player chooses Fly Again or Resume after a prior flight | `commercialBreak()` while stopped; wait for settlement; then `gameplayStart()` if the launch is still valid |
| Results -> main menu / Hangar | Stay stopped; no ad |
| Dialog closes | Stay paused; explicit Resume required |
| Page disposal | Stop if necessary; invalidate pending launches |

The adapter tracks loaded/playing/blocked states and a cancellation generation. Repeated starts/stops are suppressed. Ads are requested only from the stopped state following explicit intent to play; Poki decides whether an ad displays. No rewarded ads, ad networks, cooldowns, forced ad watches, or ad-block messages were added.

During a commercial request, physics/render updates are gated, held inputs reset, gameplay controls become inert, and the audio master gain is forced to zero. The player's Audio On/Off preference is separate from ad muting. Promise rejection and synchronous SDK errors release the gate and allow play. Duplicate requests cannot overlap. Hiding the tab, opening a menu, replacing the mode, or disposing the app cancels a late launch. Pending audio initialization also settles before a canceled launch releases ownership. A hung ad promise intentionally has **no game-side timeout** that could resume gameplay underneath an actual ad; Inspector must verify SDK settlement and recovery. Startup alone has a 4-second fail-open bound. No SDK events are sent during an ad.

## External resources and approval inventory

All entries below describe actual code paths. **No third-party approval has been obtained.** Poki's own SDK and its managed ad traffic are platform integration, not permission for arbitrary app network calls.

| Destination / URL | Purpose and data | Default Poki | Approval / alternative |
| --- | --- | --- | --- |
| `https://game-cdn.poki.com/scripts/v2/poki-sdk.js` | Official SDK initialization, loading/gameplay events and platform ad delivery; Poki controls its own data handling | Only external script | Required platform integration; SDK failure leaves game playable |
| `https://buihgnttywtkbrtscpzn.supabase.co/auth/v1/signup` | Anonymous account creation; anonymous identity/token, request metadata including IP | Excluded | NOT APPROVED; local alternative |
| Same origin `/auth/v1/token?grant_type=refresh_token` | Restore anonymous session; refresh token | Excluded | NOT APPROVED; local alternative |
| Same origin `/functions/v1/leaderboard` | Profile/nickname, run ID, score, rings, distance, rankings; bearer token and public API key | Excluded | NOT APPROVED; local Classic records |
| Same origin `/functions/v1/daily-challenge` | UTC course identity, attempt/result, public nickname, daily ranking; token/key | Excluded | NOT APPROVED; Local Daily |
| Same origin `/functions/v1/hangar-progress` | Verified aggregate totals and unlocked aircraft; token/key | Excluded | NOT APPROVED; separate local milestones |
| Same origin `/functions/v1/friend-challenge?challenge=...` | Challenge IDs, public names, target score, results and expiry; token/key | Excluded in both Poki variants | NOT APPROVED; hidden until separate approved SDK-sharing integration |
| Same origin `/functions/v1/game-events` | Run mode, result, duration, termination reason; anonymous token/key | Excluded in both Poki variants | NOT APPROVED; no custom telemetry in Poki |
| Supabase `/rest/v1/*`, Storage, Realtime | No direct frontend calls found; Edge Functions perform database operations server-side | No client path | Do not request broad wildcards unnecessarily |
| `https://www.skyracer.online/api/country` (and apex host equivalent) | Website's same-origin Vercel route; sends run ID and receives a signed IP-derived country proof | Excluded; explicitly disabled in gated transport | NOT APPROVED; omit country labels in Poki |
| Vercel Analytics `/_vercel/insights/*`, `https://va.vercel-scripts.com/v1/script.debug.js` development fallback | Standard web page analytics, request/browser metadata; library owns ingestion routing | Dependency excluded in both Poki variants | NOT APPROVED; Poki SDK metrics only |
| `https://fonts.googleapis.com/css2?...`, `https://fonts.gstatic.com/*` | Standard site's Space Grotesk / Inter / IBM Plex Mono fonts | HTML requests removed; existing system-font fallbacks used | External asset requests not allowed; no approval assumed |
| Three.js | Local npm dependency bundled by Vite | Included locally | No CDN or runtime asset library request |
| Website PNG logo/favicon | Standard public assets: 969,023 + 395,208 bytes | Not copied; procedural inline SVG favicon | No remote logo/image/audio requests |
| Audio / stars / aircraft / track | Procedural Web Audio and Three.js geometry/materials | Included locally | No downloaded assets |
| Privacy policy URL | Only an owner-configured HTTPS URL in the optional approved variant | No outbound link in local build | Owner must publish accurate policy; SDK opens link |

For an online submission, request the exact Supabase URLs above in Poki for Developers -> Settings -> CSP, explaining data purpose, identifiers, retention and offline alternatives. Do not submit wildcard approval for unrelated services. Keep the approval record and policy current, then re-upload the approved variant as directed by Poki. Never enable this variant merely because it compiles.

### Privacy-policy information checklist — owner/legal work

- Describe Poki SDK advertising and data handling using the actual applicable Poki terms; do not invent promises about SDK internals.
- Explain device-local scores, UTC daily records, equipment/theme preferences, persistence limitations, clearing storage and session-only operation.
- For approved online mode, explain anonymous Supabase IDs, stored access/refresh tokens, permanent public nicknames, public scores, run statistics, verified totals and hosting providers.
- Explain IP/request logs, geography, retention/deletion/access contacts and data processing locations based on actual provider configuration. Poki country attribution is disabled; do not copy the website's country behavior into this policy unchanged.
- Confirm child-audience, consent and regional requirements with qualified review; decide public-name moderation/reporting before enabling online mode.
- Publish a live accessible policy webpage and test the SDK-mediated in-game policy action. No legally approved policy is supplied or claimed here.

## Compliance and verification matrix

| Requirement | Classification | Source / code evidence | Manual verification / approval remaining |
| --- | --- | --- | --- |
| Separate portable distributions | Implemented and code-tested | Vite aliases, `BuildPolicy`, both builds, build-integrity checker | Inspector folder upload and nested-path load |
| SDK initialization and one loading signal | Implemented and code-tested | Adapter startup/rejection/timeout tests, boot entry | Inspector load/event log; real SDK may fail independently |
| Ordered player-driven starts/stops | Implemented and code-tested | Adapter lifecycle tests and actual launch function evaluated in Node VM | Every menu/keyboard/death path in Inspector |
| Safe commercial opportunities | Implemented and code-tested | Adapter + VM rapid-click, stale callback and failure tests | Real ad/no-ad, tab changes, audio focus and mobile audio restoration |
| Physics/input/audio gated during ads | Implemented and code-tested | Actual frame-loop VM test; InputManager lock; independent AudioEngine ad gain | Real overlay input ownership; muted/unmuted device tests |
| No unapproved backend or analytics | Implemented and code-tested | Compile-time service aliases, rendered-module audit, static output audit, network-blocked service tests | Inspector warnings and browser Network panel; SDK traffic expected |
| Offline Classic/Daily/Hangar | Implemented and code-tested | LocalProgress tests, namespaced records, local UI labels | Human playthrough and visible copy/achievement checks |
| Honest disabled Friend/Apex features | Implemented, manual testing pending | Poki Friend panel adapter, local catalog copy | Confirm no share/registration action appears |
| Storage denial / incognito | Implemented and code-tested | Getter/read/write corruption tests, reload test, memory fallback | Incognito, quota denial, visible saving notice |
| Desktop/mobile/tablet controls | Implemented and code-tested | Touch detection/input/scroll tests; touch Pause button | Physical Android/iOS/tablet and keyboard tests |
| Scaling, safe areas, fullscreen canvas | Implemented, manual testing pending | Existing camera aspect/FOV and renderer resizing retained; preview resize added; compact/pill-aware CSS | 640x360, 836x470, 1031x580, portrait, landscape, notches |
| Fast first minute / hazard clarity | Implemented, manual testing pending | Existing Start/Fly Again, short device-specific steering/boost/ring/death copy | Observe new-player comprehension and restart speed |
| Loading/performance | Implemented, manual testing pending | Build sizes below; lazy Hangar renderer, no hidden/ad frames; Poki idle rendering 10 Hz | Inspector loading time and real mobile frame rate |
| Public-name moderation | Not yet implemented for optional online variant | Existing format validation is not profanity filtering; no names in default candidate | Owner/Poki decision before enabling public-name mode |
| Online service CSP exception | Requires Poki approval | Fail-closed build gate; network inventory | Actual approved endpoints and owner policy |
| Privacy publication / thumbnails / agreement | Requires owner action | Checklist only | Hosted policy if needed, artwork, dashboard/terms/review |

No scores, hazards, timing rules or competitive ability parameters changed. Existing Node regression tests still cover collision sweeps, black rings, scoring, UTC server versions, verified progression, SQL precision/ranking and submission races. Existing standard web tests are retained; one source assertion was updated to expect explicit platform storage injection into ThemeController.

### Code checks and measured output

Baseline: 176 tests passed before implementation. Final result: **203 tests passed, zero failures** (27 added). Both `npm run build` and `npm run build:poki` passed after the final runtime review. The added tests live in `tests/poki-{adapter,launch,local,policy}.test.js`; the launch/frame-loop tests execute the actual game functions in a Node VM with mocks, **not a browser**.

Final measurement (decimal kB; gzip from Vite; excludes SDK-managed traffic and unmeasured external fonts):

| Artifact | Baseline web | P0 web | P0 default Poki |
| --- | ---: | ---: | ---: |
| Game JS including bootstrap | 128.25 / 38.00 gzip | 133.16 / 40.24 gzip | 114.17 / 35.13 gzip |
| Three.js JS | 490.37 / 122.55 gzip | 490.37 / 122.55 gzip | 489.24 / 122.26 gzip |
| CSS | 32.37 / 6.82 gzip | 33.96 / 7.15 gzip | 33.96 / 7.15 gzip |
| HTML | 48.04 / 12.10 gzip | 48.25 / 12.16 gzip | 48.16 / 12.19 gzip |
| Copied PNG bytes | 1,364,231 | unchanged | 0 |

Default Poki publication output is **685,525 bytes raw across five files**, excluding the platform SDK. Final bytes can be reproduced with `node scripts/check-poki-build.js`. The main WebGL renderer remains capped at existing DPR limits; Hangar creates its extra context only when opened, resizes with the viewport, releases it on close/hidden tab and reopens on return. Neither shaders nor mobile frame rate were measured in a browser; no claim of measured device smoothness or sub-10-second loading is made.

## Owner's manual Inspector checklist

1. Build default Poki with no approval variables. Open [Poki Inspector](https://inspector.poki.dev/) manually and load the `dist-poki` folder. Verify root index and no missing asset, external-resource, or development-artifact warnings.
2. Check one loading-finished event after the ready screen renders. There must be no gameplayStart on page load, steering keys on the menu, or opening Hangar/Help.
3. Perform: **loading finished -> first flight -> game over -> commercial break -> restart -> pause -> commercial break -> resume -> game over**. Verify alternating start/stop events, no first-entry ad, no duplicate events, no SDK events inside a break, and no ad when entering menus.
4. Repeat for barrier collision, black ring and 30-second ring timeout. Score/ring retention and countdown pause must match the website.
5. Rapidly click Fly Again/Resume; hold BOOST/steering when pausing; open menus or hide the tab before a callback settles. No overlapping ad, frozen input after recovery, score advancement underneath an ad, or automatic restart of an abandoned run.
6. Check ads actually shown, no ad available, blocked/rejected ad, rejected SDK init and no SDK network. The game remains playable. Never add a custom ad watchdog that resumes underneath an active ad.
7. Test Audio On and Off before each ad. During ad playback no engine/chime/boost sound may be audible; after return the user's setting is preserved. Check suspended AudioContext recovery on real iOS/Android.
8. Test WASD/arrows, Space/Shift, P/Esc pause, native Space/Enter buttons, scrolling inside dialogs, and no scroll of the containing Poki page. The optional online build's inputs must retain typing/IME behavior.
9. Run Scaling Tests at **640x360, 836x470, 1031x580**. Test landscape/portrait phone and tablet, hybrid iPad pointer, safe areas and orientation changes. Confirm canvas/camera aspect, touch steering + simultaneous boost, visible Pause/Menu, readable score/deadline, and SDK pill clearance. Do not infer physical-device behavior from a desktop resize.
10. Test Local records, Local Daily (UTC rollover/refresh), Hangar local labels/unlocks, FREE starters and earned counters. No global rank, server-verification claim, nickname form, Friend share link or country request should appear.
11. Use incognito and blocked/quota-full storage. Play, restart, switch themes/equipment and check the session-only notice. With writable storage, reload and confirm local bests/finished-flight milestones survive; web identity and records must remain separate.
12. Inspect Network warnings: only local bundled files and Poki-controlled SDK/ad traffic in the default candidate. No fonts, Supabase, Vercel analytics, country function, remote audio/images or external CDN libraries.
13. Record Inspector loading time/size and human device performance, including first shader compilation, speed particles, skyline, Hangar rotation, repeated dialog open/close and backgrounding. Share issues before submission.
14. Separately build `npm run build` and manually smoke-test the existing website experience (online modes, submissions, nickname identity, verified Hangar, controls/audio/themes). This work has not deployed changes there.

## Owner actions and submission blockers

- **Dashboard:** Obtain Poki developer access, inspect/upload the candidate when ready, complete human QA modules, request moderation/playtesting and ultimately publishing. Nothing has been uploaded.
- **Human devices:** Complete the checklist above and address any real SDK/ad/layout/performance issue. Code tests alone do not establish platform compliance.
- **CSP:** Required only if choosing the online variant. Default local candidate needs no Supabase/analytics exception. Approval remains NOT APPROVED.
- **Privacy/legal:** Review applicable developer agreement/terms and publish the accurate policy required for the chosen services. This document is not a legal policy.
- **Public names:** Resolve moderation and policy accessibility before enabling the gated online variant. Friend sharing remains a separate milestone.
- **Artwork:** Supply static/animated thumbnails and screenshots meeting current dashboard specifications. Existing website PNGs are not automatically approved Poki artwork.
- **Final decision:** Poki's content moderation, playtests and review determine acceptance; no acceptance, release date or monetization outcome is promised.

## File map

- `vite.config.js`, `src/platform/BuildPolicy.js`, package scripts, `.gitignore`: build separation and isolation gates.
- `src/boot.js`, `src/platform/{web,poki,PokiAdapter}.js`: startup, SDK lifecycle, guarded ads.
- `src/platform/{web-services,local-services,poki-online-services,NoTelemetry,unavailable-friend,poki-friend-panel}.js`: service selection, no-telemetry boundary, hidden unavailable sharing.
- `src/platform/{SafeStorage,poki-storage,LocalProgress,DeviceSupport}.js`: namespaced persistence, local progression/Daily, input detection/scroll containment.
- `src/main.js`: platform transitions, launch cancellation, ad freeze, local labels/records, visibility/resize lifecycle.
- `src/managers/{InputManager,ScoreManager}.js`, `src/utils/AudioEngine.js`: input gate, storage injection, independent ad mute and safe pause.
- `src/services/LeaderboardService.js`: optional country-attribution opt-out; normal default unchanged.
- `src/ui/{DailyChallengePanel,HangarPanel}.js`, `index.html`, `src/styles/racing-ui.css`: honest local UI, readiness/storage notices, touch Pause and embedded layout adjustments.
- `scripts/check-poki-build.js`, `tests/poki-*.test.js`, `tests/quick-menu.test.js`: artifact integrity and code-level regression checks.

## Official references reviewed

- [Requirements](https://developers.poki.com/guide/requirements-quality)
- [HTML5 SDK](https://developers.poki.com/guide/sdk-html5)
- [SDK overview and event ordering](https://developers.poki.com/guide/sdk-overview)
- [External resources policy](https://developers.poki.com/guide/external-resources-policy)
- [Inspector](https://developers.poki.com/guide/inspector)
- [Adding a game](https://developers.poki.com/guide/adding-your-game)
- [Quality guidelines](https://developers.poki.com/guide/what-we-look-for)

Review the live official documentation again before actual submission; policy can change.
