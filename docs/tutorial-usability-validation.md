# Tutorial usability validation

Historical report: preparation and backing-generation controls were superseded by the six-control radial-only lesson. See [current validation](tutorial-radial-validation.md).

Implemented on `Tutorial`, starting from clean commit `51bf57bac1a7813625b6b5a3eebc7d3fd09d73d9`. Shared audio synthesis, looper capture/playback, collision detection, metronome admission and shake code remain unchanged.

## Changes

- All 49 steps retain Previous / Next / Demonstrate / Practice in fixed positions. Practice owns the current attempt; results wait for Practice Again or Next. Setup assistance, skipped steps and learner passes are distinct.
- The conductor demonstrates setup through normal creation, connection and control APIs with visible controller motion, and music through real squeeze rays and stick collisions. Recording demonstrations restore takes. Explicit Record Backing / Record Percussion create real takes and resume pending navigation after success.
- Prerequisite preparation reuses valid instruments and routes, repairs missing voices/settings, checks actual contact stability and searches for clear placement space relative to the viewer and panel. Invalid space, targets, cables or recordings expose recovery actions.
- Logical roles bind to actual instruments, representatives, tracks and clock ports. Repair prefers a take’s captured track; a different valid wiring layout can request a new real backing recording without changing the existing take silently.
- Green rings shrink toward onset; yellow opens on onset, holds and shrinks on release. Percussion uses a pulse and withdrawal. The score and metronome anchor drive cues per frame; untimed practice has no imposed beat deadline. Honk/chord text sprites are removed.
- Scores show targets, onsets, hold/release and bend components, with missing/extra-event penalties, expected/heard details and brief suggestions. [Scoring tolerances](tutorial.md#practice-demonstrations-and-cleanup) are documented.
- Strike targeting caches a point on a real body triangle. Current deformed vertices and world transforms reconstruct that point; replacement, geometry changes and deletion invalidate it. Stick bounds and scratch objects are reused. Static panel content and beat-status texture updates are separate; DOM buttons retain their nodes.

## Confirmed failure and performance causes

1. Practice previously advanced its index immediately after validation, dismissing feedback. Reusing a top-level practice action also risked starting the lesson over. Attempts, persistent results and navigation now have separate state transitions and action IDs.
2. Revalidating every earlier setup checkpoint could send practice backward after a scene change. Preparation now happens explicitly, preserves progress and reports a repair cause at the current step.
3. Setup demonstrations often only focused an outline. They now execute the relevant normal action. Recording demos need isolated capture evidence and take restoration; that evidence is kept with the take and cannot become learner credit.
4. Endpoint grading could miss a pending release. The bounded grace period waits for it. During this audit, keeping recording open until assessment allowed release-smoothing samples past beat 16 and produced a 17-beat take. Capture now stops in the written final breath after real release, while assessment remains separate. No event or duration is rewritten.
5. `moveStick` repeatedly traversed body meshes, computed world bounds and raycast, despite the target-cache name. Its repeated bounds/raycast work is removed. Shared collision detection still decides every hit.
6. Changing beat text caused full button replacement and large panel texture uploads. Keyed DOM updates and a separate small status texture remove that work from static content.
7. An intermediate build queried body triangles for non-percussion setup cues. Its chord profile regressed to 6.4 ms p95. Restricting body queries to percussion restored the focused chord sample to 4.7 ms p95 (baseline 4.6 ms). Simulation also retains its original known composition layout; free-space placement remains for demonstrations and prerequisite preparation. Raw intermediate results are retained for this investigation.

## Validation

- `npm run verify`: **162 source files checked; 446/447 tests pass**. The sole failure is unchanged from baseline: `MetronomeHandleRig.test.js:43` expects −90° while the existing configuration is −80°. Baseline was 434/435 passing; all 34 tutorial tests pass.
- Full browser regression passed: the real simulation completed in **176.676 seconds**, with four three-voice chord gates, twelve recorded percussion collisions, two independent 16-beat takes and A/B/A/C/B/D. Both recording demonstrations restored takes without granting learner credit.
- Browser learner paths passed setup, all-step navigation, demonstrate/practice/results/retry, wrong-target feedback, arbitrary real tracks and chord representatives, late final release, explicit missing-recording preparation, cancelled and delayed demonstrations, genuine learner bend, solo listening and Start All. A subsequent focused run verified the final route/setting/playback changes.
- Real XR panel-plane ray capture and trigger ownership passed in desktop Three.js. The [panel texture](tutorial-result-panel.png) and [scene](tutorial-scene.png) were inspected. Target-cache checks covered translation, rotation, scaling, current morph vertices, geometry replacement and deletion. Real input rays continue selecting the squeeze sphere through the decorative cues.
- Existing browser regressions passed same-frame Honk transforms, contact voices, frozen formations, sphere/collider agreement, selective shake disconnect, one-metronome admission, source tempo and shared Web Audio launch origin. With automatic clicks muted, peak sampled RMS was 0.346 for backing and 0.706 for percussion; zero-volume click signal was zero. These are signal-presence checks, not listening judgments.

Evidence: [full browser report](tutorial-usability-browser.json), [final learner report](tutorial-usability-learner.json), [all-step audit](tutorial-step-audit.md), [raw performance measurements](tutorial-performance.json).

## Performance

The comparison uses an untouched archive of the starting commit (served on port 5174) and the updated application (5173) in the same dedicated desktop Chrome profile, viewport and 80 BPM composition. Each scene samples 240 animation frames. CPU measurements wrap the app’s actual frame scheduler and phases; RAF intervals and renderer draw calls are observed separately. Audio and rendering retain their ordinary schedules. Profile commands and raw distributions are in `scripts/run-tutorial-profile.mjs`, `scripts/profile-tutorial-scenes.mjs` and the linked JSON.

```sh
npm run test:tutorial:browser
TUTORIAL_TEST=usability npm run test:tutorial:browser
TUTORIAL_APP_URL=http://127.0.0.1:5174/ node scripts/run-tutorial-profile.mjs /tmp/before.json
node scripts/run-tutorial-profile.mjs /tmp/after.json
```

| Scene | Before CPU p50 / p95 / p99 (ms) | After CPU p50 / p95 / p99 (ms) | RAF interval p95 (ms) | Draw calls p50 |
| --- | --- | --- | --- | --- |
| Free play · one Honk | 0.30 / 0.60 / 0.70 | 0.10 / 0.30 / 0.50 | 16.70 → 16.80 | 10 → 10 |
| Held three-voice chord | 4.40 / 4.60 / 4.70 | 4.40 / 4.60 / 4.80 | 16.70 → 16.70 | 161 → 155 |
| Percussion demonstration | 1.30 / 3.70 / 5.20 | 1.30 / 2.70 / 4.50 | 16.80 → 16.70 | 167 → 166 |
| Two recorded Loopers | 1.20 / 2.00 / 2.30 | 1.20 / 1.70 / 2.10 | 16.70 → 16.70 | 167 → 162 |

During the sampled percussion demonstration, `moveStick` p95 fell from **2.60 ms to 0.10 ms**. Target raycasts fell from **87 to 0** (310 current-geometry cache queries still ran). DOM mutations fell from **55 to 9** and full static panel texture updates from **5 to 0**. The separate small beat-status texture still updates normally.


These are desktop CPU wall times, not GPU or headset frame times. Browser/JIT, scene placement and scheduling affect small measurements; no heap-allocation or headset-performance claim is made.

## Remaining checks

No physical headset or acoustic listening test was performed. Confirm stereo ring readability, perceived cue/audio onset, panel distance/size, controller tracking under fast strikes, reach and free-space comfort in seated and standing XR, recentering after a head turn, hardware session loss/reentry, and the perceived backing/melody balance. Desktop rays, exact cue phase tests and audio signal measurements do not establish those ergonomic or perceptual results.

Dense scenes can exhaust the placement search; the tutorial reports that condition and asks the learner to make room. A changed recording layout requires explicit recording for its current tracks. Progress is session memory; exiting restores free play through the existing persistence path.
