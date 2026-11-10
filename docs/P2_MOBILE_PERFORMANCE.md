# P2: Mobile polish and performance

Implemented on `auto-branch`, against P1 baseline `be2c4dd9d6bb020cd8b8cc89465e753c59b56f67`. No dependencies, external assets, backend changes, deployments, or automated browser checks were added.

## Changes and ownership

| Files | Change |
| --- | --- |
| `src/managers/InputManager.js` | Aggregate held keyboard and pointer boost sources; consume the newest coalesced steering coordinate; global release/cancel fallback when pointer capture fails; release gestures safely on blur/orientation changes; remove listeners on teardown. Steering sensitivity, deadzone, smoothing, and aircraft physics are unchanged. |
| `src/styles/racing-ui.css` | Touch Pause on both builds, separated Menu/boost targets, 44px action targets, compact HUD, safe-area spacing, wrapping Hangar header, scrollable dialogs, selectable editable fields, and native vertical Hangar scrolling. |
| `src/core/QualityProfile.js`, `src/core/Renderer.js` | Capability-based decorative quality; bounded drawing-buffer pixels; atomic, deduplicated renderer sizing. Unknown hardware hints use safe defaults rather than pretending to identify a GPU. |
| `src/entities/TrackSegment.js`, `src/utils/Memory.js` | Instance identical static lane/rail/pillar meshes at their original transforms; release instance buffers while retaining shared geometry/material ownership. No random calls or course placement rules changed. |
| `src/hangar/LazyHangarPreview.js`, `src/hangar/HangarPreview.js`, `src/ui/HangarPanel.js` | Load preview code on intent; cancel stale asynchronous opens; cap idle preview rendering at 30 Hz while dragging remains RAF-driven; observe host resizing; release contexts, geometry, listeners, and observers. |
| `src/main.js` | Observe actual canvas container size; cancel gestures when portrait/landscape changes; skip scene rendering behind Hangar, ads, or hidden documents; cap idle start/pause rendering at 10 Hz in both builds. Preserve suspended resources for back/forward cache and return paused. |
| `src/ui/FlightCoach.js` | Reuse hint records and scan milestone constants without per-frame array allocation. Existing P1 wording, completion, storage, and timing remain intact. |
| `scripts/profile-track-structure.js` | Reproducible CPU scene-structure comparison against a historical Git revision; no browser or WebGL required. |
| `tests/mobile-quality.test.js`, `tests/mobile-input.test.js`, `tests/mobile-lifecycle.test.js`, `tests/hangar-lifecycle.test.js`, `tests/render-resources.test.js`, `tests/poki-launch.test.js` | Regression coverage for quality bounds, input ownership/cancellation, responsive wiring, lifecycle/SDK behavior, lazy loading, resource cleanup, and preserved track transforms. |

Quality changes only decoration. Touch/compact devices use 150 speed particles; devices reporting at most 4 GB memory or 4 logical processors use 120; other desktops retain 180. Scenery/particle quality is selected at startup. Drawing-buffer quality is recalculated on resize, including orientation changes. DPR is capped at 1 for reduced quality and 1.5 otherwise, with respective 2-million/6-million pixel budgets. Preview has an additional 750,000-pixel limit. These signals do not measure actual GPU speed.

## Before/after measurements

Same dependency installation and production build commands were used for both revisions. Chunk sizes below are Vite decimal kB, rounded to two decimals. The optional preview chunk is excluded from initial game JS; Three.js is listed separately.

| Indicator | P1 baseline | P2 |
| --- | ---: | ---: |
| Tests passing | 223 | 242 |
| Standard initial game JS, raw / gzip | 139.65 / 42.65 kB | 141.30 / 43.32 kB |
| Poki initial game JS, raw / gzip | 120.09 / 37.30 kB | 121.45 / 37.89 kB |
| Deferred Hangar preview, raw / gzip | Included in main | 3.83 / 1.33 kB |
| CSS, raw / gzip, both builds | 36.32 / 7.60 kB | 38.73 / 8.03 kB |
| Standard Three.js, raw / gzip | 490.37 / 122.55 kB | Unchanged |
| Poki Three.js, raw / gzip | 489.24 / 122.26 kB | Unchanged |
| Complete Poki artifact | 694,505 bytes, 5 files | 702,098 bytes, 6 files |
| Renderable batches per track segment | 12 | 7 |
| Full / reduced segment triangles | 396 / 300 | 396 / 300 |
| Unique segment geometry / materials | 5 / 7 | 5 / 7 |
| Standard start/paused scene cadence | Each RAF | At most 10 Hz |
| Main scene behind Hangar | Idle rendering | No scene rendering |
| Idle preview cadence | Each RAF | At most 30 Hz |
| Repeated identical renderer sizing | Resize work each call | No buffer resize |

The artifact grows by 7,593 bytes (about 1.09%): lifecycle/input safeguards and responsive styling outweigh deferred preview savings. This is not a bundle-size reduction. Initial preview initialization and its code fetch are deferred until Hangar opens.

Track batching reduces potential draw submissions by 41.7% per segment before frustum culling. It does not reduce triangle count; batching changes culling granularity and adds eight static instance matrices (512 bytes per segment). CPU tests preserve furniture transforms and bound volumes. Actual GPU draw counts depend on visibility and are not measured here.

Particle position uploads shrink from 2,160 bytes to 1,800/1,440 bytes in reduced/limited profiles; their draw count remains one. A 3840×2160 CSS viewport at DPR 2 previously used the 1.5 cap (18,662,400 drawing-buffer pixels); the new desktop budget limits it to 6,000,000. This is a calculated policy example, not a hardware performance measurement.

Resource tests repeat 30 same-seed track restart cycles without increasing shared geometry/material identities, and eight preview open/close cycles with at most one live preview renderer and matching creation/disposal counts. They use real Three.js scene objects plus mocked renderers; they do not prove stable browser GPU memory.

Reproduce the structural comparison:

```powershell
node scripts/profile-track-structure.js be2c4dd
node scripts/profile-track-structure.js
npm run build
npm run build:poki
```

## Validation results and limits

- Complete suite: **242 passed, 0 failed**. Both production build commands run the suite.
- Standard production build: passed.
- Poki production build and `scripts/check-poki-build.js` artifact checks: passed.
- No automated browser, screenshot, Playwright, FPS, real-device, network-timing, or visual testing performed. Owner verification remains necessary.
- SDK integration and ad ordering were not redesigned. Tests cover background suspension/back-forward restoration without duplicate gameplay starts, plus existing P0 ad/restart and P1 persistence tests.
- The preview fallback keeps Hangar selection available if WebGL/module loading fails. A browser-cached module fetch failure may require reloading the page; retry behavior cannot be guaranteed by the wrapper.
- Capability hints can misclassify powerful touch devices or machines with few reported cores; conservative quality may be softer than necessary. No automatic FPS-based quality oscillation was introduced.
- Hidden/blocked loops retain lightweight RAF scheduling but skip scene rendering. This preserves existing lifecycle coordination.

Official compatibility references: [Poki quality requirements](https://developers.poki.com/guide/requirements-quality) and [HTML5 SDK lifecycle](https://developers.poki.com/guide/sdk-html5). Passing local tests does not certify Poki acceptance.

## Owner manual checks

1. Test standard and Poki builds on desktop keyboard/mouse, an actual phone, and a tablet. Include 640×360, 836×470, 1031×580, phone portrait/landscape (for example 390×844 and 844×390), and tablet portrait/landscape (for example 1024×1366). Check browser zoom, notches, home indicators, and tablet split-screen/container resizing.
2. Steer with one finger and hold/release BOOST with another. Move outside the canvas before release; cancel gestures by switching apps, losing focus, or rotating. No stuck steering/boost should remain. Browser URL-bar height changes within the same orientation should not cancel an active gesture. Check Space + Shift + pointer boost together; releasing one source must preserve another held source. Confirm unchanged handling, collisions, abilities, scoring, rings, and seeded Daily layouts.
3. During flight, verify Pause, Menu, BOOST, coach hints, milestone notices, and HUD do not overlap or clip. Open Help and Hangar: close/equip controls should be reachable, headings wrap, dialogs scroll vertically, and text inputs remain editable/selectable without focus zoom. Gameplay surfaces should not scroll, select text, or trigger context menus. Verify keyboard buttons, focus, and mouse controls still work.
4. Rotate while playing, paused, in Help, in Hangar, and on game-over. Canvas and camera should fill the actual container with correct aspect. Verify safe-area controls remain visible and Fly Again is prominent and responsive. Repeat fast restarts and P1 onboarding/completion/personal-best/unlock flows.
5. Open/close Hangar rapidly, including before its first chunk finishes loading; change selection while loading. Confirm only the latest selected craft appears, native vertical scrolling works over the preview, drag rotation responds, and closing removes the preview canvas. Repeat at least eight times; inspect DevTools resources if available. Check offline/loading-failure fallback without losing equip controls.
6. Switch tabs/apps, lock/unlock the device, and navigate away/back using browser history. Return must remain paused with usable rendering/input, retained progress, and no duplicate SDK gameplay start. Explicit resume should restore the intended audio setting. Check both cached-history restoration and full page reload.
7. In the Poki test environment, repeat initial start and Fly Again with successful, cancelled, and failed commercial breaks. Verify no input or game rendering during ads, correct gameplay start/stop events, audio restoration for both audio-on and audio-off preferences, and fast replay with no extra clicks. SDK overlay must remain unobstructed in Hangar.
8. On real devices, compare visual quality, skyline, particles, smoothness, initial load, and memory over at least 30 flights. Inspect rendering while paused/hidden/in Hangar. Record actual device/browser and measurements separately; no FPS or mobile smoothness claim has been made by this implementation.
