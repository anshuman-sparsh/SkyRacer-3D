# P3: Gameplay balance clarity and replay retention

Implemented on `auto-branch`, with P2 commit `45e2cc913587f615b6c1fdf00be840479652b7b9` as the baseline. This milestone changes presentation and personal practice goals, not competitive gameplay rules. No branches, PRs, pushes, merges, deployments, dependencies, external assets, or services were introduced.

## Difficulty review: first 30–180 seconds

The existing game has no time-based difficulty ramp. Cruise speed starts at 28 world units/second (100.8 km/h); every six collected rings permanently add 2 km/h for that flight. Blue rings activate the existing automatic boost. Every seventh **spawned collectible**, rather than every seventh collection, is pink. Pink rings immediately target 165 km/h initially, with the existing extra 5 km/h per four previously collected pink rings. These events can feel like a difficulty spike when their meaning is unclear.

The opening segments at z=0 and z=-24 exclude barriers and hazard rings. This is a short spatial lead-in, not 30 seconds of beginner protection. Later spawn probabilities remain 65% collectible on non-hazard segments, 15% hazard, and 55% barrier, subject to the existing placement checks. Random layouts may repeat patterns; this review does not establish that every generated sequence is equally easy or that every collectible can be chained by every aircraft route.

The collection deadline remains 30 active seconds. Its warning starts after 20 seconds; a valid collection on the expiration frame resets the timer before termination. Pauses, ads, and background suspension do not advance it. No numerical balance edits were justified by real player measurements, so P3 improves the **communication of pacing** rather than inventing new difficulty curves or changing old results.

Reproduce the controlled comparison:

```powershell
node scripts/profile-difficulty.js 45e2cc9
node scripts/profile-difficulty.js
```

This is a CPU-only ghost traversal at constant base cruise speed for 180 one-second samples. The ghost is deliberately outside collisions; it is not an achievable flight, an FPS benchmark, or a player-success simulation. Counts include the generated look-ahead area. The historical comparison loads historical TrackManager logic with unchanged current entity dependencies.

All three seed layouts matched P2 exactly, including positions, ring types, and RNG consumption:

| Daily date / version 3 | Collectibles at 30 / 60 / 120 / 180 seconds | Pink / hazards / barriers by 180 seconds |
| --- | --- | --- |
| 2026-11-11 | 24 / 40 / 72 / 111 | 15 / 33 / 119 |
| 2026-11-12 | 25 / 44 / 85 / 116 | 16 / 30 / 126 |
| 2026-12-01 | 27 / 38 / 81 / 121 | 17 / 40 / 124 |

The November 11 layout SHA-256 is `6aeed576e3efe06eb2eedea156e6d422a867c5d63cc28c65fc34fd575dac9e67`, also pinned as a regression fixture. This sample demonstrates preservation, not universal course fairness. If owner testing finds genuinely unfair sequences or excessive surge difficulty, a separate Poki Classic policy or versioned course change with server validation is required.

## Implemented experience

- One optional personal goal per flight: collect rings, fly for an active duration, or reach a score. Sequence is deterministic: 3 rings → 30 seconds → 3,000 points; then 6 → 60 → 6,000; then 10 → 90 → 10,000, repeating that capped tier. Only a completed flight that meets its goal advances the sequence. Failure retains the same goal for retry; partial progress never carries between flights. Abandoning a flight gives no completion.
- The start screen previews the goal. After onboarding, a brief static hint uses the existing coach slot; completion gets another brief message. The ten-second deadline warning takes priority. Score changes do not trigger per-frame live-region announcements. Goals neither require boosting nor encourage deliberately taking hazard risks.
- Game-over shows actual progress, remaining units, a progress bar, and completion/near-goal feedback. Near-goal wording requires at least 80% completion. A completed goal saves once even if termination is repeated; final-frame pickups/time count. Successful Fly Again initializes the next goal only after the existing launch/ad checks succeed. Cancelled ads preserve the result, and resume preserves the current flight's progress.
- Personal-best comparisons highlight a positive score within 5% of the previous best, retaining the exact point gap. Ties and improvements remain distinct. Friend results stay separate; unknown Daily bests never produce invented record claims.
- Existing Hangar goals now appear before takeoff as well as after game-over, with explicit remaining requirements. Only supplied local/confirmed snapshots contribute. Meeting totals without an unlocked ID still says “Awaiting unlock confirmation.” No unverified current run is added to online progress. Offline Apex remains excluded and locked.
- Pickup text distinguishes blue energy boost and pink surge, shows the actual ring bonus, confirms timer reset, and identifies an earned cruise-speed increase. Existing P1 ring/record milestones take priority over this secondary feedback. A barrier near-miss can show a short “BARRIER CLEARED” acknowledgement without points or rewards. No extra particles, sounds, rendering contexts, or animation systems were added; the existing ring chime remains.
- Failure copy distinguishes solid orange barriers, fatal red-orange X ring centres, and 30 active seconds without a collectible. The coach explains aiming through centres, blue boosts, pink surges, and the deadline.
- Long results/start panels now allow native wheel scrolling inside their content while gameplay still blocks wheel scrolling. Existing touch scrolling and contained overscroll remain in place. Fly Again stays ahead of optional progress, goals, and save forms.

## Persistence and competitive safeguards

Personal goals use `practice_objectives_v1` within existing safe storage: `skyracer_web_coach_v1:` on the website and the isolated `skyracer_poki_v1:` namespace in Poki. Only a bounded integer completion counter is persisted; no run results, currencies, aircraft rewards, global rankings, or verified achievements are manufactured. Corrupt/blocked storage falls back to in-memory practice; clearing storage resets it. This local counter is not tamper-proof or synchronized across devices/tabs and has no competitive authority.

No edits were made to TrackManager, HoverCraft, ScoreManager, RingCollectionDeadline, ring collision entities, Daily seed/version code, LocalProgress, aircraft abilities, backend validation/migrations, or PokiAdapter. Existing physics, random draw order, course version 3, scoring, local unlock conditions, verified progression, ad lifecycle, audio restoration, and P2 quality/resource policies remain unchanged. Session objective observations reuse one metrics object, and DOM writes occur only when displayed text/state changes.

## Retention hypotheses and measurement

These are hypotheses, not measured improvements. No new telemetry or network requests were added. Existing standard-site run-start/run-end analytics can support duration comparisons where available; offline Poki sends no retention data. Owner playtest notes can evaluate these without new services.

| Change | Hypothesis | Suggested comparison |
| --- | --- | --- |
| Pickup/surge and failure explanations | Fewer early failures feel unexplained | Record failure reason and ask new pilots to explain it after each flight; compare the proportion correctly understood and first-flight duration buckets under 30 / 30–60 / 60–180 seconds. |
| One bounded practice goal | A reachable target gives purpose without extra menus | Count goals reached and flights attempted per fixed-length owner test session, including failed repeats. Compare to P2 with comparable players/devices. |
| Exact near-best/near-goal gaps | Visible, truthful improvement encourages a voluntary retry | Record game-over-to-Fly-Again time, excluding commercial duration, and whether a second/third flight occurs. Do not attribute ad time to replay friction. |
| Remaining Hangar requirements before/after flights | Unlocks feel understandable rather than remote | Ask pilots to identify the next craft and its actual remaining requirements; count errors and Hangar visits. Keep verified and device-only results separate. |
| Scrollable short-screen results | Players can reach replay/save/goal controls | Test short portrait/landscape panels, keyboard navigation, wheel and touch scrolling; record any inaccessible action. |

Numerical thresholds (5% near-best, 80% near-goal, capped goal targets, four seconds of available hint exposure) are presentation rules, not changes to game balance or unlock requirements. Real beginner/expert playtests are needed before claiming improved retention, fairness, or difficulty.

## Changed files

- Runtime: `src/ui/FlightObjectives.js`, `src/ui/FlightFeedback.js`, `src/ui/ObjectivePanel.js`, `src/ui/FlightCoach.js`, `src/ui/ReplaySummary.js`, `src/main.js`, `src/platform/DeviceSupport.js`, `src/styles/racing-ui.css`, `index.html`.
- CPU profiler: `scripts/profile-difficulty.js`.
- Regression tests: `tests/flight-objectives.test.js`, `tests/flight-feedback.test.js`, `tests/p3-difficulty.test.js`, `tests/p3-integration.test.js`, and `tests/poki-launch.test.js`.
- This document: `docs/P3_GAMEPLAY_RETENTION.md`.

## Validation and limitations

Full automated suite: **266 tests passing**, including 24 added P3 tests. Both `npm run build` and `npm run build:poki` run the full suite; both passed, including Poki artifact checks. Controlled baseline/current course comparisons matched for all three dates. `git diff --check` passed. No automated browser, Playwright, screenshot, visual, real-device, or live-ad tests were performed.

| Production size | P2 | P3 |
| --- | ---: | ---: |
| Standard main JS, raw / gzip | 138.72 / 41.98 kB | 142.88 / 43.40 kB |
| Poki main JS, raw / gzip | 116.69 / 35.76 kB | 120.85 / 37.21 kB |
| CSS, raw / gzip | 38.73 / 8.03 kB | 39.35 / 8.12 kB |
| Complete Poki artifact | 702,098 bytes | 707,300 bytes |

Vite sizes are decimal kB rounded to two places. Poki grows by 5,202 bytes (about 0.74%); its file count remains six. Three.js and the deferred preview sizes remain unchanged. P3 adds small text/controller modules and styling; there are no new dependencies or Three.js objects. There is no FPS, device smoothness, universal course fairness, actual retention uplift, or Poki publishing certification claim. Secondary pickup feedback can be suppressed by a P1 milestone or deadline warning. Goals remain voluntary and independent of verified achievements. Native module-loading/network limitations documented in P2 are unchanged.

## Owner manual checks

1. On standard and Poki builds, play as a new pilot with fresh isolated storage. Confirm the four P1 hints remain readable, explain blue/pink boosts and red-orange X danger, and finish without extra clicks. Confirm the optional goal never overlaps the warning/controls or causes rapid screen-reader announcements.
2. Collect blue rings, pink rings, and the sixth/twelfth rings in a flight. Verify the existing chime, boosts, surge, timer reset, cruise progression, and point formula; new text must describe the existing effect. Pass near an orange barrier: acknowledgement must not add score or count a ring. Avoid X-ring centres; a hit must retain the existing fatal behavior.
3. Let the countdown expire, hit a barrier, and hit a hazard ring. Check each distinct title/reason. Pause for more than 30 seconds, resume, and confirm neither the deadline nor active-time goal advanced while paused. Repeat background/foreground and orientation changes from P2.
4. Finish below, at, and above a goal. Confirm progress resets on retry and the goal changes only after success. Check rings → time → score rotation and capped tiers using normal play or isolated test storage; never edit production unlock records. Reload to verify completed-goal persistence. Block storage and verify in-memory play/replay still works. Confirm website/Poki counters are isolated.
5. Compare scores just below 95% of a known best, within 5%, tied, and improved. Exact gaps should remain correct. Daily compares only its known best; Friend must not show a fabricated personal/global record.
6. Check the next Hangar craft and remaining requirements on start and game-over, after local flights and after successful/failed online verification. Unverified online runs must not become aircraft credit. Maxing personal goals must never unlock aircraft; Apex must remain unavailable in offline Poki.
7. In the Poki test environment, rapidly tap Fly Again; exercise successful, cancelled, failed, and delayed commercial breaks. Completed goal/result must stay visible while pending/cancelled; successful launch resets once. Resume preserves the flight goal. Verify SDK start/stop counts, ad input lock, audio-on/off restoration, and no play behind ads.
8. Test keyboard/mouse, phone and tablet touch; portrait/landscape, notches, small 640×360 landscape, and tablet split-screen. Scroll results with wheel/touch, including save forms, and verify Fly Again remains easy to reach. Check Help/Hangar, safe areas, keyboard focus, accessible text/contrast, and P2 rendering/resource behavior across repeated restarts. Owner observation is required for visual quality and performance.
