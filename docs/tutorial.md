# Composition tutorial

The opening panel offers **Play** and **Tutorial**. Under Tutorial, choose **Start Practice** or **Simulate Composition**. Both use the existing Honk instruments, Web Audio voices, contact graph, controller gestures, stick collision system and Looper recorder.

## Desktop

Run `npm run dev`, open `http://localhost:5173`, choose Tutorial, then Simulate Composition. The click enables audio under the browser's autoplay rules. Wait for the instrument assets to load. The simulation visibly places and wires instruments, auditions timbres, practices chord release and three stick targets, records its own backing, verifies playback, and performs A, B, A, C, B, D.

Pause releases the virtual hands and stops backing playback. Resume repeats the current musical action with a fresh count-in; an interrupted take is discarded and recorded again. Restart starts a new isolated simulation. Stop and Exit restore free play. A delayed musical frame or hidden tab pauses the conductor instead of sending overdue gestures. Keep the tab visible. Simulation targets roughly two minutes plus loading and count-in alignment. Practice includes additional untimed note learning and individual phrase rehearsals. The routes use the same state machine and validators; simulation never awards omitted practice checkpoints.

Desktop controls and XR buttons call the same semantic handlers. The desktop preview offers placement and setup controls; the live playing exercises are designed for tracked XR controllers. The simulator needs no headset, console command, external service, microphone or subsequent coding session.

## Headset

Serve over HTTPS (`npm run dev:https`) or an existing secure deployment, enter AR/VR, and choose Tutorial → Start Practice. The panel is placed in front of you on XR entry; during the lesson it sits to the side. It remains anchored until Recenter. Recenter changes the panel position, not the instruments.

Use the lesson's Select button to select the exact preset through the ordinary preview system. Aim the preview and press Trigger to place it; Grip cancels. The regular A radial menu still provides the individual Metronome and Looper. Group presets have touching Honks; leave space between different groups. The seven-note melody row has independent Honks, including both Ga variants and upper Sa.

Hold Trigger on a Metronome output and release it over Looper node 6. Connect the first Honk of each backing group to nodes 1–4, and the separate percussion Honk to node 5. The lesson's Connect buttons use those same connection services and validate the actual endpoints. Set the clock to 80 BPM and Looper Gap to zero. Mouth Trigger cycles vowels, the nose changes volume, and the Looper volume handle balances playback. E and O are auditioned before selecting O for this arrangement.

Aim at the yellow squeeze sphere and hold Trigger to sound a Honk and its touching partners. Keep the backing wrist level. Point the other hand into empty space and hold Grip to equip a stick. Release Grip to unequip. A stick disables squeezing on its hand. Swap hands changes the suggested hand assignment; either physical hand can perform either part.

Chord entries are on numbered beats 1, 5, 9, 13, held approximately 3.7 beats. For each four-beat section, tap Honk on beat 1, Metronome on beat 3, Looper on beat 4. Withdraw after every tap. Record is armed until the first actual chord or stick onset. After the last chord, press Stop during its short breath **before the next downbeat**. The recorder includes release-motion samples until Stop; a late Stop can create an extra beat and must be retried.

Note learning has no running deadline: hold the correct note for at least half a second, then release. The g → S exercise uses one Eb4 voice, bent down three semitones and settled on C. Timed phrases start after a count-in at a backing boundary. Errors stop lesson credit while the clock continues; Retry preserves valid setup. Missing, disconnected or retuned lesson instruments send the lesson back to the affected setup action.

Demonstrate performs the current musical action with virtual hands, without earning practice credit. Setup demonstrations identify the actual controls and targets. Exit cancels demonstrations and gestures. Leaving XR restores the free-play scene and returns to the desktop preview.

## Musical definition

“VIRAG 2 — JOG STUDY” is an original Jog-inspired instrument study. It does not reproduce a named song or traditional bandish. Sa is C, tempo is 80 BPM, and the 16-beat backing lasts 12 seconds with no added gap. The accompaniment and percussion pattern are an original arrangement, not a claim of authentic tabla bols.

The note treatment draws on [Tanarang's Jog description](https://tanarang.com/raag-jog/) and [Rajan Parrikar's Jog discussion](https://www.parrikar.org/hindustani/jog/). Both discuss the Ga variants and the descending komal-Ga-to-Sa gesture. Parrikar describes differing treatments of Ni; this study consistently chooses komal Ni (Bb) and does not prescribe a universal vadi. D and A are not settled melody notes. Continuous bends may pass through intermediate frequencies.

The physical melody Honks are C4, Eb4, E4, F4, G4, Bb4, C5. Labels distinguish `G = E4` (shuddha Ga) and `g = Eb4` (komal Ga). Each descending bend holds Eb for 20%, glides down over 50%, and settles on C for 30%. A following C4 event is articulated separately.

## Implementation and evidence

- `src/tutorial/composition.js`: pitches, voicings, percussion, phrases, bend curves, presets and named tolerances. All modes consume this score.
- `lessonSteps.js`: explicit step descriptions, prerequisites, entry rules, evidence origins, retry and cleanup policies.
- `TutorialSession.js` and `validation.js`: pure action validation, one-to-one matching, checkpoints, failed attempts and prerequisite repair. They import neither Three.js nor Web Audio.
- `TutorialAdapter.js`: stable lesson role bindings; ordinary spawn/placement, cable and control commands; real sphere targeting; stick poses; observation of processed live bends and voice/contact membership. Timeline serialization is cached after recording ends.
- `CompositionConductor.js`: nonblocking absolute-time actions in the application's INPUT phase. Validation runs after performance/recording, and through the safe preview path while spawning. It owns no render loop or scheduling timers and never writes timeline events.
- `TutorialPanel.js`: desktop DOM and actual XR plane buttons sharing semantic actions. Texture updates are keyed to changed content. UI trigger capture lasts until release, preventing a panel press from squeezing an instrument behind it.
- `TutorialRuntime.js`: mode transitions, separate learner/simulation progress, demonstrations, bounded diagnostics, session cleanup, and the in-memory free-play snapshot.

Only learner-origin gestures count in Practice; simulation, demonstration, looper automation and clock pulses cannot grant learner credit. Notes require a fresh held gesture and release. Bend assessment reads the processed musical bend using the configured range and roll mapping, allowing ±50 cents at C for at least 150 ms. Timed onset tolerance is ±0.25 beat, with a 0.35-beat duration tolerance. The backing must pass both observed chord/percussion checks and finalized timeline checks, including each actual percussion route and zero Gap.

`RuntimePersistencePolicy` explicitly blocks normal save/restore during practice, simulation and mode transitions. Lesson objects are removed before the free-play snapshot is restored through `SceneRestorer`. Normal persistence is not cleared or overwritten by lesson mode. Optional progress currently stays in memory with composition/version metadata; refresh opens the normal saved scene without lesson objects.

## Verification

Run `npm run check` and `npm test`. Focused tests: `node --test tests/tutorial/Tutorial.test.js`.

For an automated run, open the app in a dedicated Chrome profile with `--remote-debugging-port=9225`, then run `npm run test:tutorial:browser`. Set `TUTORIAL_CDP_URL` or `TUTORIAL_APP_URL` if needed. The runner reloads that page, exercises the visible launch controls, reports each milestone and writes `/tmp/face-orchestra-tutorial-validation.json`.

The browser integration module is `scripts/validate-tutorial-browser.mjs`. In a dedicated browser profile with the app loaded, an automation harness can run:

```js
const { app } = await import('/src/main.js');
const { validate } = await import('/scripts/validate-tutorial-browser.mjs');
await validate(app, { onProgress: console.log });
```

The desktop simulator itself never requires this console code. The integration module checks launch choices, a complete real simulation and recorded take, four strikes of each target kind, chord-member activation, phrase progression, real practice rejection, demonstration/playback isolation and restoration of saved free play. It restores the profile's original persistence value after its fixture. It must run with real time, real assets and Web Audio; mocked collision or synthesized timeline tests are not end-to-end evidence.

Baseline at `2a2288c2357c9f724fab6d678a2c2909e3d0c64c`: import check passes; 386 of 387 existing tests pass. The existing `MetronomeHandleRig` configuration expectation fails (`-80` actual versus `-90` expected). This feature does not change that handle configuration.

Headset testing and acoustic monitoring must be reported separately from browser/audio-state verification.

## Verified results

On 2026-09-12, `npm run check` passed for 152 source files. `npm test` passed 406/407 tests, including all 20 tutorial tests; the single failure is the baseline Metronome handle expectation described above.

`npm run test:tutorial:browser` completed the actual simulation in **131.4 seconds** after loading, with four Honk, four Metronome and four Looper collisions recorded, a 12-second backing take, and A–B–A–C–B–D validated. Setup reached Record at about 18 seconds, playback at 34 seconds, and melody setup at 47 seconds. Clock-boundary count-ins account for the remaining difference from the two-minute target. Real playback and demonstrations did not grant learner credit, incorrect practice actions were rejected, XR plane Trigger capture passed, and mode transitions restored saved free play without changing its persistence value.

The existing `validate-manual-honks-browser.mjs` regression also passed (49 sphere comparisons, locked three-voice chords, quaternion bends, grip transforms and deletion). The additional exported `validateChordRelease(app)` browser check confirmed that releasing one hand cannot credit a chord held by the other. Free play returns to two hardware controllers and no lesson objects. The result is recorded in [tutorial-validation.json](tutorial-validation.json).

These were Chrome browser tests using real assets and Web Audio. **Sound was not acoustically monitored; audio state was verified. No headset was used.** Spatial comfort, controller ergonomics and acoustic balance in a headset remain unverified. Progress is in memory only. Desktop live practice remains a preview of the XR-oriented exercises; Simulate Composition is fully desktop accessible.

## Changed files

New composition/tutorial modules: `src/tutorial/composition.js`, `lessonSteps.js`, `validation.js`, `TutorialSession.js`, `TutorialAdapter.js`, `CompositionConductor.js`, `TutorialPanel.js`, `TutorialRuntime.js`.

Integration: `src/main.js`, `src/app/FaceOrchestraApp.js`, `src/app/runtime/RuntimeHost.js`, `SessionRuntime.js`, `RuntimePersistencePolicy.js`, `SpawnRuntime.js`, `XRInteractionRuntime.js`, `HonkPerformanceRuntime.js`, `src/spawning/SpawnCatalog.js`, `src/instruments/formations/formationRecipes.js`, `style.css`.

Verification and documentation: `tests/tutorial/Tutorial.test.js`, `scripts/validate-tutorial-browser.mjs`, `scripts/run-tutorial-browser.mjs`, `package.json`, `README.md`, `docs/tutorial.md`, `docs/tutorial-validation.json`.
