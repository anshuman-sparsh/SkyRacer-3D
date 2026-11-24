# P4: Final Poki readiness audit and release candidate

Audit date: **2026-11-11 (Asia/Calcutta)**. Branch: **auto-branch**. Baseline: P3 `47e20edb4d8472a5a0eb052a196a98f5bb24b37e`.

**Verdict: PASS for code-level preparation of the default offline candidate; ready for OWNER manual Poki Inspector testing. Browser acceptance and publication are not verified or approved.** No automated browser, Playwright, screenshots, visual tests, live ads, remote database changes, uploads, pushes, PRs, merges, or deployments were performed. No reproducible critical/high defect remains from this code-level audit; this is not a claim of zero bugs.

## Official references checked

The following current official pages were fetched during this audit. Recheck them before submission if the requirements change:

- [Requirements](https://developers.poki.com/guide/requirements-quality)
- [HTML5 SDK](https://developers.poki.com/guide/sdk-html5)
- [External resources policy](https://developers.poki.com/guide/external-resources-policy)
- [Inspector](https://developers.poki.com/guide/inspector)
- [Adding your game](https://developers.poki.com/guide/adding-your-game)
- [Content and player safety](https://developers.poki.com/guide/content-player-safety)
- [Thumbnail requirements](https://developers.poki.com/guide/game-thumbnail)
- [Supabase API-key guidance](https://supabase.com/docs/guides/getting-started/api-keys), for the credential/isolation review; its changelog was also checked. No Supabase APIs or schemas were changed.

The supplied Poki pages do not state a universal numeric MB cap. They emphasize small downloads and avoiding long loads; no invented 5/10/50-MB certification threshold is used here. A small artifact alone does not prove acceptable loading on real connections.

## Audit scope and evidence

Reviewed the build entry/aliases, SDK adapter, launch/state/frame loops, input, camera/renderer/quality/recovery, scene/particles/entities/collision/track/deadline/score rules, audio, safe storage/local Daily, aircraft ownership/abilities, Hangar/preview cleanup, P1 coaching/replay, P3 goals/feedback, dialogs/menus, online service/auth/score coordination, backend validation boundaries, country route, dependency inventory, CI, and publication output. Backend invariants are exercised by the existing SQL/PGlite and service tests; deployed database/RLS/configuration and historical Git secrets were not inspected remotely. Static responsive checks are not visual verification.

### Compliance matrix

PASS below means code/static/test evidence for this candidate. OWNER ACTION means a required manual check or publishing deliverable. POKI APPROVAL REQUIRED means authorization cannot be supplied by a local flag. A failing manual check must become FAIL and be fixed before requesting review.

| Area | Result | Evidence / remaining action |
| --- | --- | --- |
| SDK boot, failed/blocked initialization | PASS | Official v2 script in head; boot initializes before main; bounded startup fallback leaves a playable no-SDK session; late init cannot inject events. Real blocker behavior still needs Inspector. |
| Loading signal | PASS | One guarded loading-finished event after initialization and first scene setup; no automatic gameplay start on load. |
| Gameplay start/stop ordering | PASS | Player-owned launch, pauses/menus/termination/background stop, deduplication; actual launch/frame VM tests. |
| Commercial opportunities | PASS | Resume/replay requests only while stopped and returning to gameplay; first flight has no forced ad; no ad-frequency timer or rewarded ads. |
| Ad isolation and sound | PASS | Game UI inert, input reset/disabled, master audio ad mute independent of user preference, frame work skipped; rejected ads fail open, pending ads never time out into gameplay. |
| Real SDK/ad lifecycle and recovery | OWNER ACTION | Inspector event log and real no-ad/ad/cancel/failure/background runs, muted and unmuted, on actual devices. |
| Iframe keyboard/wheel/touch behavior | PASS | Movement prevents game scroll; native controls retain keys; results/dialogs scroll internally with overscroll containment; Escape/P pause. Verify parent page on devices. |
| Mobile/tablet, rotation, safe areas, full canvas | OWNER ACTION | Capability-based touch controls, container/viewport resize and CSS rules exist and are tested. Visual fit and actual gesture behavior require hardware checks. |
| GPU interruption | PASS | Context loss pauses/saves/cancels pending launch, suppresses rendering, restores paused rather than silently flying. Reload remains necessary if the browser cannot restore. |
| Storage denial / incognito | PASS | Namespaced safe storage and memory fallback, clear session-only notice; corrupt local Daily map recovery tested. Verify private-browser behavior manually. |
| Offline progression and records | PASS | Classic/local Daily/device milestones remain local; no fabricated global ranks or verified rewards; practice goals have no unlock authority. |
| Apex offline | PASS | LocalProgress never grants Apex; preference alone cannot grant its ability; Friend is unavailable. |
| Unapproved application requests | PASS | Default bundle excludes Supabase/auth/country calls, Vercel/custom analytics, remote fonts/assets, online pending identity keys and Friend sharing; module and static audits pass. |
| Actual Network/CSP warnings | OWNER ACTION | Inspector and browser Network must verify all requests. Poki's own SDK-managed ad traffic is expected, not a backend exemption. |
| Optional online variant | POKI APPROVAL REQUIRED | Disabled for this candidate. Exact CSP approval, accessible hosted/in-game policy, and public-name moderation review are required before considering it separately. |
| Credentials and dependencies | PASS | Current tracked source/config scan found no private key, `sb_secret_` value or service-role JWT; frontend configuration contains public names/key only. Full installed npm audit: 0 known advisories. Not a historical-secret or live-project certification. |
| Third-party license preservation | PASS | Generated notices accompany both builds; offline package includes Three.js and Vite runtime MIT notices. Website additionally retains Vercel Analytics notice. |
| Package portability/integrity | PASS | Relative paths, referenced/deferred chunks, allowed files, no source maps/config/tests, deterministic root-level ZIP, per-entry SHA-256 and independent .NET extraction verification. |
| Standard website isolation | PASS | Standard production build/tests pass; no Poki SDK/events in its output; web service/analytics paths remain separate. No live website test performed. |
| Content, originality, rights, marketing assets | OWNER ACTION | Procedural racing content has no chat/purchases/third-party ad code. Owner must review gameplay/art rights and supply thumbnails; Poki moderation decides acceptance. |
| Official release approval | POKI APPROVAL REQUIRED | Not requested, obtained, or implied by this audit. |

## Bugs and release gaps fixed

| Severity | Reproduction / defect | Fix and regression evidence |
| --- | --- | --- |
| High | Lose the main WebGL context mid-flight: Three.js stops drawing, but the game previously had no loss gate and could continue physics/deadline behind an unusable canvas. | `WebGLRecovery` prevents default loss destruction, pauses/saves, cancels pending launch, blocks frames/starts, and resets timing/resizes after restoration. Actual main wiring and frame tests prove no auto-resume or duplicate SDK start. Listener teardown precedes deliberate context loss at disposal. |
| Medium | On a hybrid tablet, use touch Pause/Resume then switch to keyboard. Focus remained on the native touch button, where movement keys were intentionally excluded. | Add the touch Pause action to the existing canvas-focus restoration path. Actual launch regression checks focus after resume. No input sensitivity or physics tuning. |
| Medium | Corrupt `local_progress_v1` so `daily` is `[]`, then finish local Daily. Date properties on the array worked in memory but disappeared when JSON serialized it. | Reject array-shaped maps on restore; preserve valid totals; new Daily score survives reload. No unlock threshold or valid save format changed. |
| Medium | Complete Daily, start a different attempt/date, then receive the old attempt's delayed success/error. It could overwrite the newer best comparison or error text, including through the automatic-submit catch. | Bind result/error UI updates to the finished attempt object. Accepted old results still refresh authoritative Hangar progress; global submission ownership is released. Actual submit/automatic-error handlers are covered by deferred-response regression tests. Server scores and progression rules are unchanged. |
| Medium | Existing artifact audit accepted a missing deferred preview chunk, ignored undeclared config files, and did not produce/check an upload archive. | Audit static/dynamic imports, preload maps, HTML/CSS paths, traversal/symlinks, prohibited content and allowed file inventory. Produce deterministic ZIP/manifest, round-trip deflate, verify archive writes and independently read the result. Negative fixtures cover missing/remote/development/secret-containing files. |
| Medium | Minified distributed engine had no retained Three.js copyright/permission notice. | Generate `THIRD_PARTY_NOTICES.txt` from installed dependency licenses; require it in the Poki audit and archive. Existing gameplay and asset requests are unaffected. |
| Low | CI validated only the standard distribution, leaving Poki packaging regressions untested on later revisions. | Existing workflow now also runs `npm run package:poki`; no deployment job was added. This workflow has not been remotely executed during P4. |

No numerical gameplay, course RNG, collision, score, ability, server migration/validation, or verified progression edits were made. PokiAdapter and P0 ad lifecycle are unchanged. P1–P3 tests remain in the full suite.

## Remaining issues and owner gates

- **High / OWNER ACTION:** actual Inspector events, ads/audio focus, device visuals/controls, iframe scrolling, loading, and repeated-flight memory still need manual testing. These block publication, not opening this candidate in Inspector. Treat any failure as a release blocker.
- **High / conditional POKI APPROVAL REQUIRED:** online Supabase features are not approved. The gated online variant also needs its nickname moderation/privacy requirements reviewed before public use. Do not enable it based on local compilation or a placeholder approval-reference string. Offline mode avoids this dependency.
- **Medium:** an SDK commercial promise that never settles intentionally keeps play/input blocked. Do not add a watchdog that resumes under a video. If reproducible in Inspector, record the event log and raise it with Poki before release; reload is the recovery for a permanently stuck session.
- **Medium:** unrecoverable WebGL loss requires reload. WebGL-less browsers get the existing startup failure message, not a new fallback renderer. Verify browser support with actual target devices.
- **Medium:** first-time chunk/network failure and browser-cached failed imports may require reload; Hangar fallback remains usable for selection. Universal generated-course fairness and real-device smoothness are not proven by CPU fixtures.
- **Low:** local practice/progress is device-local, clearable and not tamper-proof; practice counters are not cross-tab synchronized. English-only copy is unchanged. No global rank or competitive reward is derived from these counters.
- **Publishing OWNER ACTION:** confirm developer terms, rights/originality, content suitability, metadata and marketing assets. Static thumbnail should follow the current guide (full-bleed square, at least 628×628); animated thumbnail is needed before global release. Existing website logo/favicon is not automatically a suitable Poki thumbnail.

## External requests, CSP, and privacy

Default release: only the **official SDK script** is an external application script reference. Three.js, shaders, geometry, stars, audio, UI fonts (system fallbacks), and preview code are local/procedural. License text may contain textual URLs; it is not executed or fetched by the game. Offline local-service tests run with fetch blocked and make zero application service requests. This is code evidence, not a captured browser network trace.

Do not enable `POKI_ONLINE_APPROVED`. No CSP exception or legally approved privacy policy exists in this milestone. If online features are later proposed, use Settings → CSP in Poki for Developers to request the exact required service URLs and purposes; provide a live hosted policy linked inside the game, and re-upload after approval. See the detailed endpoint/data inventory in `POKI_PUBLISHING_READINESS.md`. Never request broad wildcards or assume leaderboard approval covers analytics, country attribution, Friend sharing, or remote assets. Any permitted outgoing action must use Poki's SDK link API; default mode has none.

Owner policy review should accurately distinguish Poki-managed advertising from device-local saves and any separately approved backend data. Confirm actual retention, logs, deletion/contact information and applicable platform/privacy obligations; no legal certification is supplied. The optional online policy UI already uses the SDK rather than direct navigation. Public-name moderation is an additional gate for online publication; default offline mode collects no public nickname.

## Reproducible final build and release artifacts

Use the locked dependencies with Node 22 (the existing CI version). On Windows PowerShell:

```powershell
npm ci
$env:POKI_ONLINE_APPROVED = 'false'
npm run build
npm run package:poki
node scripts/check-poki-build.js
node scripts/profile-difficulty.js 47e20ed
node scripts/profile-difficulty.js
Get-FileHash artifacts/poki-release/skyracer-poki-rc.zip -Algorithm SHA256
```

`package:poki` runs the complete test suite, clean Poki production build, static artifact checks, and ZIP creation. Packaging independently enforces the offline policy even if environment flags suggest online approval. To repackage an already-verified build without rebuilding: `node scripts/package-poki.js`.

| Artifact | Final measured result |
| --- | --- |
| `dist-poki/` | **7 files, 710,615 bytes** uncompressed |
| `artifacts/poki-release/skyracer-poki-rc.zip` | **184,721 bytes**, index.html directly at ZIP root |
| ZIP SHA-256 | `b90416e09d03e72c09366a2c53d50aeca794d97476d089e59b26a79ba23a195d` |
| `artifacts/poki-release/skyracer-poki-rc.manifest.json` | Per-file path/byte/SHA-256 inventory and archive hash; companion verification file, **outside** the game ZIP |
| Poki main JS | 121.78 kB raw / 37.45 kB gzip |
| Poki Three.js | 489.24 kB raw / 122.26 kB gzip; unchanged |
| Deferred preview JS | 3.83 kB raw / 1.33 kB gzip |
| CSS | 39.35 kB raw / 8.12 kB gzip; unchanged |
| Standard main JS | 143.78 kB raw / 43.62 kB gzip |

The seven game files are root HTML, runtime notices, stylesheet, bootstrap, main, Three.js, and optional preview. No source, credentials/config, node_modules, backend, tests, source maps or repository metadata is packaged. Dist/ZIP/manifest outputs remain ignored, regenerated artifacts; only source fixes/tooling/docs are committed. Fixed ZIP timestamps and sorted entries make packaging deterministic for identical built bytes. Changing code/build versions can change hashes.

Validation: **281 tests passed, 0 failed, 0 skipped** (15 new P4 tests). Standard build and `npm run package:poki` passed, including the Poki build/static checks. npm audit of production and development dependencies returned **0 known vulnerabilities**; this reflects registry advisories at audit time, not proof of absence. Independent .NET ZipFile reading checked every decompressed entry against the manifest. `git diff --check` passed; standard output contains no Poki SDK lifecycle code.

All three Daily version-3 ghost layout hashes match P3/P2 exactly through 180 seconds:

| Date | SHA-256 |
| --- | --- |
| 2026-11-11 | `6aeed576e3efe06eb2eedea156e6d422a867c5d63cc28c65fc34fd575dac9e67` |
| 2026-11-12 | `132ef7aef24bf646678863def59cc587492123470236416e2355e74e65f62ac7` |
| 2026-12-01 | `996b952803aa10d4b5d83b3466d03fc699123fb553996093fb1ebf96eafd4b3a` |

These are CPU ghost-layout checks, not playable-flight or visual tests. No FPS or device performance number was measured or invented.

## Exact owner Inspector procedure

1. Open [Poki Inspector](https://inspector.poki.dev/) in a supported desktop browser. Use its folder-open/upload action and select **dist-poki**, with index.html at its root. Do not choose the repository or artifacts parent. If a version is already uploaded by you in Poki for Developers, its Versions tab can open Inspector preloaded instead.
2. Open the QA modules on the left. Work through every point; mark actual results, including manual failures. Do not mark untested items PASS.
3. Watch Event Log. Initial load should produce one loading-finished signal and no gameplay start. Click START FLIGHT: one start. Pause, open Menu/Help/Hangar where available, hit a barrier/X ring, or time out: stop once. Resume/Fly Again: commercial opportunity when applicable, no lifecycle events during the pending video, then one start only after return to play. First-flight ad omission is intentional. A no-ad outcome is normal.
4. Repeat rapid clicks, successful/no-ad/rejected commercial opportunities, user audio on/off, tab/app interruption and backgrounding during pending launch/ad. Never accept play underneath an ad or automatic resume after a cancelled/backgrounded launch. Save the log for any SDK failure.
5. Use Scaling Tests at the bottom: 640×360, 836×470, 1031×580, narrow phone portrait, landscape and tablet sizes. Inspect all controls, overlays, text and safe areas; verify the SDK pill remains visible/unobstructed. CSS reserves pill space, but only this manual check establishes visual fit.
6. Switch Desktop/Mobile mode. Scan Inspector's QR code on a real phone and tablet; keep watching the desktop event log. Test iOS Safari and Android Chrome where available, plus a desktop keyboard/mouse browser. An emulator does not establish device performance.
7. Inspect Warnings (External Resources, unexpected behavior, optimization) and browser Network/Console. The game's own requests must remain local except the official SDK/platform-managed traffic. Record every unexpected domain/CSP/404/script error. Check the displayed file size and measured loading time on representative connections.
8. Re-run after fixes, keeping candidate ZIP/hash/browser/device/date and logs with your QA notes. Inspector success is evidence for a review request, not official approval.

## Manual desktop/mobile/tablet checklist

- **Core:** Classic, local Daily retry/UTC-midnight rollover, true best-only records, ring colour/effects, sixth-ring speed increase, 30-second warning/timeout and expiration-frame pickup, orange barrier/X-ring failure, near-misses, personal goals and game-over gaps. Scores/handling must match P3.
- **Progress:** unlock Silver Arrow/other earnable aircraft through legitimate local totals, retain counters after unlocking, only two starters labelled FREE, reload equipment/theme/goals, Match Appearance, Apex stays locked. Practice goal completion never grants aircraft or verified credit. Website online progression must still require server acceptance.
- **Replay/pause:** first-flight guidance, Fly Again, rapid taps, Escape/P and touch Pause, switching from touch Resume back to WASD/arrows, Menu/Help, results scrolling, keyboard focus and form typing. Goal/result survives a pending/cancelled ad and resets only for a successful new flight.
- **Devices:** portrait↔landscape while flying/paused/in dialogs/results; notch/home-indicator safe areas, tablet touch scheme, split-screen/container resize, browser URL-bar changes, two-finger steer+boost and cancellation. No clipped/overlapping controls or unintended page scroll/selection. Verify SDK pill over all screens.
- **Failure resilience:** private browsing/denied or full storage, offline reload where cached versus uncached assets, blocked/rejected/late SDK initialization, optional preview loading failure and fallback. Expect session-only notice when persistence is unavailable; never a fabricated online rank.
- **GPU/background:** simulate context loss using DevTools/WEBGL_lose_context if supported, then restore: flight must pause, status disappear after restore, and manual resume must be required. Test tab hiding, app switching, browser back/forward cache and reload; no phantom duration, movement, sound or SDK starts. An unrecoverable context may require reload.
- **Audio/ads:** ring/boost audio, pause/background engine silence, audio-on/off preference, immediate ad mute, no game input or SDK events under video, correct restoration on return. Use actual Inspector ads; local mocks cannot certify this.
- **Memory/rendering:** repeat 30 flights and at least eight Hangar open/close cycles. Inspect GPU contexts/resources/listeners and memory trends with DevTools. Preview contexts should close, repeated flights should not accumulate assets, and paused/hidden/ad/Hangar frame work should remain reduced. Record actual device metrics; no smoothness certification is claimed here.
- **Standard website:** manually smoke-test online Classic/Daily/Friend, country labels, authoritative Hangar unlocks, all controls and theme, on the separately built web distribution. This milestone did not deploy it or mutate its backend.

## Submission steps after owner QA

1. Complete and retain the Inspector/device/network checklist. Fix every failing item and rebuild/retest the exact candidate.
2. Review developer terms and ownership/content obligations; prepare accurate title, description, controls and thumbnail assets. No marketing assets or legal approvals are generated by this engineering audit.
3. Keep the default offline build. If requesting any external service, finish Poki's CSP/privacy and public-name safety review **before** treating the optional online distribution as releasable.
4. Sign in to Poki for Developers and upload the verified game files/ZIP through the version workflow offered there; do not include the companion manifest or source repository. Reopen that uploaded version in Inspector to confirm the hosted version behaves identically.
5. Submit for the applicable moderation/playtest/review stage and follow Poki's feedback. A static thumbnail is needed for player-fit testing; prepare the animated thumbnail before global release. Poki alone decides acceptance and publishing readiness.

## Files changed

`src/core/WebGLRecovery.js`, `src/main.js`, `src/platform/LocalProgress.js`; release tooling `scripts/check-poki-build.js`, `scripts/package-poki.js`, `scripts/third-party-notices.js`, `vite.config.js`, `package.json`, `.gitignore`, `.github/workflows/code-checks.yml`; regression tests `tests/p4-recovery.test.js`, `tests/poki-release.test.js`, `tests/poki-launch.test.js`, `tests/mobile-lifecycle.test.js`, `tests/p3-integration.test.js`; and this report. Package-lock/dependency versions and gameplay/backend rules were not changed. Exact final commit SHA is supplied in delivery; use `git rev-parse HEAD` to identify the checked-out revision.
