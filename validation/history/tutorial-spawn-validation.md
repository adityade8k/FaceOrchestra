# Tutorial Spawn validation

Historical report: panel Spawn was superseded by the radial-only lesson. See [current validation](tutorial-radial-validation.md).

Implemented on `Tutorial` from the clean existing tutorial commit `172a8eb`.

Tutorial Spawn now passes the initiating physical controller through the action handlers to normal placement. It reserves the request before audio startup, blocks duplicates, waits for the clicking Trigger to be released, and accepts a fresh placement press. Grip cancels and permits retry. A preview does not complete practice or count as assistance. Navigation invalidates requests still awaiting audio. Desktop Spawn explains that an initiating XR controller is required; it does not substitute a virtual or default right hand.

Tutorial chord Spawn uses `HonkLockService.lockMembers` after the preview's members have been placed and their original materials restored. The service's existing creation event applies locking and the normal locked appearance to every member. Native note geometry and text are retained and fitted to the close chord spacing. The creation marker is consumed once, so a subsequent user unlock persists. Radial presets, other tutorial instruments, demonstrations, prerequisite assistance and simulation retain their existing lock defaults. The owning controller can adjust preview distance and scale with its thumbstick.

## Results

- **172 focused browser assertions passed.** Both physical-controller objects exercised actual panel rays and the input coordinator: initiating-hand ownership, held-trigger rejection, fresh placement, other-hand rejection, thumbstick distance/scale, duplicate requests, Grip cancellation and retry, learner completion only after placement, audio-startup races and stale-request cancellation.
- All four tutorial chord presets entered the existing locked group mode. Both hands grabbed a non-anchor member and moved the entire chord with preserved offsets. Body Grip plus Trigger produced no voice; each member's ordinary squeeze target produced three voices and released them normally. Right-secondary user unlock persisted across subsequent updates.
- Preset pitches and native note strings were retained. Label geometry remained visible and fit without overlap. The [captured placed chord](tutorial-spawn-locked-chord.png) was visually inspected. Green tutorial Honk sprites remain absent.
- Metronome cancellation released its singleton reservation. Melody, percussion Honks and both Loopers stayed unlocked. Actual right-primary radial-menu opening, controller roll, pull, selection and release created ordinary C-major previews and unlocked chords in both tutorial and free play, with unchanged native label scale.
- The **full browser regression passed**, including the **176.726-second** simulation, both real recording demonstrations, learner navigation/retries, actual recording preparation, timing/bend scoring, shared-clock audio, selective shake, persistence/cleanup and existing Honk interaction/presentation regressions. Recording demonstrations retained four chord events and twelve percussion collisions, restored both takes and granted no learner credit. The focused browser suite was rerun after the final native-label fit.
- `npm run verify`: **162 source files checked; 446/447 Node tests passed.** The sole failure is the existing `tests/instruments/metronome/MetronomeHandleRig.test.js:43` expectation of −90° against the unchanged −80° configuration. `git diff --check` and browser-script syntax checks passed.

Raw evidence: [placement checks](tutorial-spawn-browser.json), [full regression](tutorial-spawn-full-browser.json).

```sh
TUTORIAL_TEST=spawn npm run test:tutorial:browser -- /tmp/tutorial-spawn-validation.json
npm run test:tutorial:browser -- /tmp/tutorial-spawn-full-browser.json
npm run verify
```

These are desktop Chrome tests using the application's controller objects, actual Three.js rays, placement/group services and Web Audio. No physical headset test or acoustic listening test was performed. Stereo label readability, comfort and tracking on hardware remain unverified.
