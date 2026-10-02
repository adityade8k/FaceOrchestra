# Practice performance audit

The reported problem is frame drops during **headset/XR practice**. Work remains local on `ver-12`, based on `e6fd0a068d0fa957492d9fb8979c685f26f91695`, preserving the preceding Kuch arrangement, timing-ring and status-badge changes. The comparison baseline includes those local changes.

## Findings and changes

1. **Repeated detailed-body raycasts dominated practice CPU work.** Hover and live input repeatedly intersected the morphed Honk body and its nested outlet even when a squeeze/control hit already determined the selection. The general selector now tests controls first and skips body-only subtrees when the existing selection priorities make their hits irrelevant. When no control hits, it tests the remaining bodies; ambiguous nearest-close/looper cases repeat the complete query, preserving ordering and exact-distance ties. Grip, locked-body selection, authoritative poses and same-frame transform updates retain their existing paths. No geometry is approximated and no hit is reused across frames.
2. **Kuch rewrote desktop keyboard attributes every frame, including in XR.** The measured baseline generated 5,400–5,760 mutations per 360 frames. Keyboard state now updates only when it changes, and hidden XR keyboard work is skipped. Returning to desktop immediately synchronizes the current target and enabled state.
3. **Hidden menus still laid out text and dirtied canvas textures.** Menu updates now retain the latest model and transport text while hidden, then draw that state synchronously when reopened. Musical timing cues and audio continue independently.

Label bounds and the six-group timing-ring pool were small costs in these profiles; their musical update cadence was retained. The score, bend smoothing, audio transport and delayed-frame guards were not relaxed.

## Measurement scope

`scripts/audit-practice-performance.mjs` runs local Chrome with real models, normal animation-loop phases, controller input, Web Audio, and live chord recording. It measures five scenarios: idle, melody practice on desktop, melody practice with the XR-style panel, melody practice with the menu hidden, and chord recording. Synthetic input follows the exercise; it is not evidence of human mastery. Melody measurements use the initial drill without prerecorded backing. Each normal-speed scenario samples 360 frames after setup/count-in. CPU phase timings include measurement overhead and exclude GPU completion time. Rendering measurements time CPU submission only.

The available machine uses Apple M4 Pro/ANGLE Metal, at a desktop refresh cadence of about 60 Hz. Showing the XR-style panel on desktop does **not** reproduce stereo rendering, headset GPU limits, passthrough, tracking, or the XR compositor. The scene still draws roughly 290–303 calls and 306–307 thousand triangles in the measured practice views. That remaining render load needs a headset profile before selecting any graphics-quality tradeoff.

Run the same measurement with:

```sh
CAPTURE_SOFTWARE_GL=0 node scripts/audit-practice-performance.mjs test-results/practice.json
CAPTURE_SOFTWARE_GL=0 PRACTICE_CPU_RATE=4 PRACTICE_FRAMES=180 node scripts/audit-practice-performance.mjs test-results/practice-stress.json
```

Raw measurements and Chrome CPU profiles are retained under ignored `test-results/`; the compact comparison is in [practice-performance.json](audits/practice-performance.json).

## Results and validation

Measured 95th-percentile animation-update CPU time, excluding render submission:

| Scenario                     | Before |  After |
| ---------------------------- | -----: | -----: |
| Melody, desktop controls     | 2.6 ms | 1.3 ms |
| Melody, XR-style panel shown | 2.5 ms | 1.1 ms |
| Melody, menu hidden          | 2.4 ms | 1.0 ms |
| Chord recording              | 4.0 ms | 1.3 ms |

These comparable normal-speed profiles had no sampled frame intervals above 25 ms, both before and after. The numbers demonstrate less CPU work, not an observed increase in headset frame rate. They cover the raycast and keyboard changes; the subsequent hidden-menu deferral additionally eliminates hidden canvas redraws, verified behaviorally.

- `npm run verify`: **649 passed, zero failed**.
- General browser audit: passed navigation, scene restoration, Basics preservation and persistence checks. The actual-mesh regression compared 49 rays against complete selection, retained authoritative grip distances and same-frame transforms, and observed **zero body-triangle queries for a squeeze-control hit**. Locked chord voice ownership, roll, unlock, movement, release and deletion passed.
- Selection-policy tests: 1,500 deterministic combinations of controls, bodies, overlapping priorities and exact-distance ties match full selection. Keyboard regression verifies zero idle/hidden mutations and correct state after returning from XR.
- Hidden-menu redraw and immediate restoration checks passed. The later **guided practice regression failed**: pitch observations contained 100–133 ms gaps, violating the unchanged starting-hold/onset rules. One run also missed the initial green-cue window. A same-browser control restoring the previous ray/panel methods and redundant keyboard writes failed too. This remains an unresolved frame-pacing validation limitation; the failure is retained in the report rather than scored as a pass.
- At four-times CPU slowdown, missed frames and long tasks remained, including frame intervals up to about 250 ms. That stress run preceded the hidden-menu redraw change and is not a headset simulation.
- ADB is installed, but `adb devices -l` returned no attached device. **Physical headset, GPU/compositor, full-song-with-backing performance and acoustic checks were not run in this audit.** Earlier complete-song behavioral results remain historical evidence, not a fresh headset performance test.

## Remaining headset check

Re-test the affected exercise on the user's headset, with the menu both shown and hidden, then with the recorded backing playing. Capture CPU/GPU frame timing and missed XR frames at that headset's actual refresh rate. Check fast green cues, continuous bends, chord recording, and audio landing together. Lower CPU work in desktop Chrome is not proof that the reported headset glitch is resolved.


## New practice features: follow-up validation

The radial gauge, phrase sections, tempo/progression controls and prepared-backing shortcut are now implemented. See [kuch-practice.md](kuch-practice.md) for the current functional results. The earlier introductory real-input regression was rerun successfully (62 checks); its historical failed control comparison remains recorded above. The new complete Easier bends run also passes all 167 held gestures and 185 pitch landmarks.

A seven-scenario profile of the new features at 60 BPM sampled 360 frames per scenario. Its full-song/backing cases had update CPU p95 around 1.2 ms, render-submission p95 around 1.1 ms, and no frame gaps above 25 ms. A subsequent fresh-browser full-song profile, including the final pooled arc presentation, was inconsistent: update CPU p95 was 53.8 ms with the XR-style panel and 9.8 ms hidden; 136 and 156 of 359 intervals exceeded 25 ms, respectively. Frame p99 was 266.7 and 116.8 ms. These regressions in measured frame pacing are retained, not averaged away.

A read-only process check after the slow run showed unrelated heavy CPU consumers, approximately 127%, 99% and 99%. Work increased across input, transforms, performance and rendering; cue CPU p95 remained below 1 ms. This supports possible system contention but does not establish the root cause, isolate a rendering regression, or explain a headset's behavior. No unrelated applications were closed or modified. The two runs differ in warm-up order and final arc pooling, so they are not a controlled causal comparison. Both raw profiles and compact results are retained in [kuch-practice-performance.json](audits/kuch-practice-performance.json).

`adb devices -l` again found no attached device. Physical XR, stereo rendering, compositor/GPU timing, acoustic quality and bend comfort remain unrun. Headset frame drops are not claimed fixed.
