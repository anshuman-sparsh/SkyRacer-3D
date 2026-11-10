# P1 — Onboarding and replay retention

Implementation on the existing `auto-branch`. No new branches, PRs, merges, pushes, deployments, external services or backend changes are part of this milestone. Physical-device and Poki Inspector verification remain with the owner. No retention uplift, platform approval or browser validation is claimed.

## First flight

- The home message stays **Open Menu → Help & controls to learn how to play**. There is no additional tutorial screen or required click.
- Once flying, a compact, non-interactive coach introduces steering/height, blue/pink collectibles and their 30-second deadline, red-orange X hazards, and boost. All four concepts begin appearing within the opening ten active seconds; each hint lasts at most 2.5 active seconds. Practicing a control can advance its hint after 1.5 seconds. Nearby hazards can prioritize the hazard instruction.
- Desktop prompts name WASD/arrows and Space/Shift. Touch/tablet prompts name dragging and the existing BOOST control. No input sensitivity, smoothing, steering response, flight difficulty or hazard layout was changed.
- Seen hints are saved as a small completion mask. Partial completion survives retries and reloads. Existing pilots with a prior Classic record skip general onboarding unless they already have incomplete saved coaching. An early crash can therefore continue the remaining instructions on the next flight.
- Poki uses its existing `skyracer_poki_v1:` storage wrapper; standard web coaching uses `skyracer_web_coach_v1:`. Blocked reads/writes fall back to session memory. Nothing is uploaded or linked to a player identity.
- Guidance stops on pause, menus, ads and game over. The final-ten-second ring warning takes priority and suspends hint exposure. Returning players retain the normal deadline and full Help dialog.

## Results and replay

- Barrier, hazard-ring and ring-timeout endings now explain the specific cause and the relevant next-flight action. Daily/Friend mode labels remain in the HUD; they no longer replace the cause-specific results heading.
- Results compare the score against a snapshot captured **before that flight**. Classic comparisons are local; Daily comparisons use the known Daily best; Friend results keep their separate existing result UI. Exact ties are not presented as a new record. A missing Daily record does not fabricate a rank or a verified best.
- Fly Again is a larger primary action directly below the score comparison, before optional registration or other secondary actions. Pending launches disable duplicate taps and display **PREPARING FLIGHT…**, restoring normal labels after failure/cancellation.
- Next-aircraft progress uses confirmed server Hangar totals on the standard site and completed-flight local totals in offline Poki. Server rewards are never optimistically credited. An existing Hangar refresh updates the result card through a callback; rendering the card adds no backend request. The progress bar follows the limiting requirement when an aircraft needs two milestones. Poki never promotes unavailable Apex Overdrive as its next local reward.
- First-ring and ring-count milestones, plus passing a previous score best, get short text confirmations. There are no new particles, sounds, confetti or reward rules.
- Classic retry terrain/score resets happen **after** ad settlement and cancellation checks, keeping the old result intact while an ad is pending or abandoned. Duplicate clicks share the existing launch guard. Daily retry uses the issued date/version and one seeded reset, removing the unused intermediate random reset. Its final generated course is unchanged.
- P0 SDK ordering is retained: stop -> commercial opportunity -> start after successful launch. First entry remains ad-free. No rewarded ads, ad cooldown or SDK API changes were added.

## Mobile and rendering

- The coach is pointer-transparent, uses short device-specific copy and a compact mobile layout, and never steals touch steering or BOOST. The deadline takes visual priority. Replay has a minimum 44-pixel target even in short landscape viewports and uses `touch-action: manipulation`.
- Duplicate record boxes are omitted on game over to keep the primary action nearer the score; the HUD and main-menu records remain available. Text/progress updates are event-driven or only applied when the hint/milestone changes.
- Ring pickup confirmation alternates two equivalent CSS animation names instead of forcing a synchronous `offsetWidth` layout read on every collected ring. Both respect reduced-motion preferences.
- The crash still animates for two simulation seconds. After it settles, the game-over loop does not update craft, track accents or WebGL frames. A resize marks that view dirty and redraws it once, including after an ad or background interruption. Active-flight rendering/physics are unchanged; the existing P0 hidden-tab/ad render gate remains first.
- This is code-level evidence of removed work, not measured device frame-rate or input-latency data. The main renderer, camera, scenery settings, aircraft abilities and all competitive calculations remain as before.

## Files changed

| File | Change |
| --- | --- |
| `src/ui/FlightCoach.js` | Pure coach persistence/exposure model and brief milestone state |
| `src/ui/ReplaySummary.js` | Pure score comparison and authoritative next-unlock summary |
| `src/main.js` | Coach/result presentation, preflight best snapshot, deferred retry reset, pending buttons, stopped-scene rendering, layout-read removal |
| `src/ui/HangarPanel.js` | Optional progress observer after valid existing refreshes |
| `index.html` | Small coach/toast, comparison/progress UI and prominent replay action |
| `src/styles/racing-ui.css` | Compact responsive styling, reduced-motion pickup variant, touch target hierarchy |
| `tests/flight-coach.test.js` | New/returning pilots, touch prompts, completion, corrupt/blocked storage, isolation and milestones |
| `tests/replay-summary.test.js` | Best/tie/first-run semantics, honest unlock totals, unavailable local rewards, confirmed progress notification and UI structure |
| `tests/poki-launch.test.js` | Actual launch/restart functions in Node VM: rapid taps, preserved canceled result, one seeded Daily reset, pending-label recovery and idle redraw |

## Checks and owner verification

The complete Node suite passes **223 tests, zero failures** (20 new P1 tests). Both `npm run build` and `npm run build:poki` pass. The Poki command also audits output assets and forbidden network dependencies; Vite retains its rendered-module isolation checks. The standard output is checked for absence of Poki SDK code. Tests use mocks/Node VM, never a browser.

The final Poki candidate is approximately **695 kB raw across five files**, excluding Poki-managed SDK/ad downloads. Its game chunk is about 115 kB (35 kB gzip), Three.js about 489 kB (122 kB gzip), and CSS about 36 kB (8 kB gzip). These are artifact measurements, not a physical-device loading or performance test. No new dependencies were added.

Manually check:

1. New keyboard, phone and tablet players: all concepts understandable in the first ten seconds; no excessive text, obstruction, lost steering or surprise extra click.
2. Returning pilot, partial early-crash tutorial, reload and blocked/incognito storage: correct guidance suppression/continuation and safe session-only behavior.
3. Barrier, red-orange X ring, and timeout endings in Classic/Daily/Friend: correct reason, retained score, accurate previous-best comparison and visible Fly Again.
4. Online Hangar verification arriving after game over; offline local milestone unlocks; all local rewards completed; no invented verified credit or unavailable next reward.
5. Rapid replay taps, ad shown/no-ad/rejection, delayed audio, tab hiding or menu interruption: no reset during the ad, no duplicate registration/start, no abandoned callback resuming a flight.
6. Daily repeat and midnight boundary: original UTC/version behavior, identical seeded course, best comparison scoped to the issued date.
7. 640x360, 836x470, 1031x580, portrait phone and tablet: readable HUD/hints/results, SDK pill clearance, safe areas, scrollable secondary content and replay target visible.
8. Game-over resize after two seconds, visibility changes during an ad, reduced motion, ring pickup confirmations and physical mobile performance.
9. Inspector events and Network warnings: P0 lifecycle still correct; no new external connections. Separately smoke-test the normal web build's online modes and controls.

## Sources reviewed

- [Poki onboarding guidance](https://developers.poki.com/guide/easy-access)
- [Poki requirements](https://developers.poki.com/guide/requirements-quality)
- [SDK event lifecycle](https://developers.poki.com/guide/sdk-overview)

The welcoming first-flight change is guidance and feedback only. No invulnerability, easier course, score bonus, new unlock condition or competitive balance adjustment is introduced.
