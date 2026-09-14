# Honk Orchestra composition tutorial

Choose **Tutorial → Start Practice** or **Simulate Composition** from the opening panel. Desktop and XR panel buttons use the same handlers. Run `npm run dev`, open `http://localhost:5173`, wait for assets and enable audio by clicking. Simulation uses real virtual controller rays, squeeze gestures, stick-body collisions, connections, recording and Web Audio. It never constructs or repairs a take’s events.

## Two backing parts

One Metronome drives two labelled, separately placed Loopers:

| Stable role | Clock route | Recorded part |
| --- | --- | --- |
| `chordLooper` — Chord Looper | Any available Metronome output → compatible Looper socket | One member of each touching chord group on a distinct available track. Any member may represent its chord. |
| `percussionLooper` — Percussion Looper | A separate output from the same Metronome → a compatible socket | Percussion Honk and Metronome-body taps occupy distinct actual tracks; Looper-body taps use its existing self-percussion lane. |

The lesson stays at **80 BPM**, with **16 beats / 12 seconds and Gap 0 for each take**. The four voicings, Jog melody, vowels, responsive chord contact behavior and bend lessons remain the same. Only squeeze spheres trigger frozen Honks.

Practice proceeds through:

1. Place the Metronome and both Loopers, connect both clock cables, start 80 BPM and set both Gaps to zero.
2. Place and wire all four chord groups; audition E/O, soften the backing and rehearse chord holds.
3. Arm only Chord Looper, count in, record Groups 1–4 on zero-based beats 0/4/8/12, holding about 3.7 beats each. Stop after the final release. Validate and listen to Chord Looper alone.
4. Place and wire the percussion Honk; equip a stick and rehearse all three targets and the pattern.
5. Arm only Percussion Looper. Its count-in aligns with the Chord Looper phrase while chords accompany it. On zero-based beats 0/4/8/12 strike the Honk; 2/6/10/14 the Metronome; 3/7/11/15 Percussion Looper. Withdraw between strikes. Stop, validate twelve real recorded collisions, and listen to Percussion Looper alone.
6. Choose **Start All**, listen to both aligned parts, put away the stick and continue the seven-note melody, descending bend and A–B–A–C–B–D lessons.

A percussion retry replaces only Percussion Looper if the new take passes. A failed or cancelled attempt restores its previous completed take. The validator compares the successful chord take before accepting percussion. Metronome strikes retain their established fan-out routing; recorder arming determines which take receives them. Duration comes from real musical onsets and normal releases, including the last percussion onset on beat 15. No manual duration repair is used.

## Play and Start All

**Play always restarts from the recording origin on the first beat strictly after the press**, including standalone playback. An exact-beat press targets the following beat. The equality tolerance is `1e-9` beat, only to absorb floating-point rounding. Individual Play never waits for a bar or 16-beat phrase and never resets the Metronome. A first attack recorded 100 ms after the origin remains offset by 100 source milliseconds (scaled with tempo).

Separate starts share tempo but can have different phrase origins. **Start All** validates both recorded Loopers, neither recording nor record-armed, and one shared running Metronome connection before changing either transport. It captures one request time, target beat and Web Audio time anchor for both. It displays “Starting both on the next beat”. Existing playback continues until the common boundary, then releases/restarts through the normal scheduler. Validation checks launch beat and actual source phase, plus playback evidence for both parts.

The existing 25 ms audio scheduler prepares up to 120 ms ahead; rendering does not deliver the audio. A stall retains the originally requested launch beat, skips obsolete attacks and reconciles any currently held note. Launch diagnostics distinguish when the audio was prepared from when transport was observed; late observation is not a claim that missed audio sounded on time.

The programmatic `resumePlayback` method is separate: it resumes the paused source position on the next beat. The physical **Play** button always restarts. Looper Pause remains immediate internally and next-beat when externally clocked. Metronome Pause safely stops connected playback/recording and cancels scheduled voices. Volume zero is a separate mute operation and leaves clock phase and Loopers running; it does not mute recorded wooden stick taps.

## Clocks and compatibility

`LOOPER_STANDALONE_BPM = 70` is the standalone authority. Each disconnected Looper uses the stable local origin at the page’s monotonic time zero, without a Metronome object, automatic click or separate speed control. Its label reads **70 BPM · Internal**. New standalone recordings are armed until onset and record against this known grid. Connected Loopers use only their Metronome’s BPM; a paused external clock cannot silently become an independent one.

Timeline schema 6 stores `sourceBeatIntervalMs` separately from playback tempo. Canonical event timestamps, durations and expressive curves are never retimed in place. A 16-beat 80 BPM source lasts approximately 13.714 seconds at internal 70 BPM. Changing BPM preserves source phase; disconnect stops safely and the next Play uses the local grid.

Legacy takes with explicit source metadata or `timingMode: metronome` retain that known reference. An ordinary legacy take with absent/unreliable metadata (including inferred tempo) keeps its native millisecond event timing and duration; Play still quantizes its origin to the next beat. Its tempo is not guessed and its events are not destructively rewritten. Such a take is not promised a known beat count at the displayed playback grid.

## Admission, recovery and shake

`InstrumentAdmissionPolicy`, shared by the active registry, factory and pre-geometry runtime creation, enforces zero or one Metronome. It covers menu/preset creation, tutorial/simulation, duplication, restoration and pending/reentrant requests. A pending preview reserves the slot, its placement remains valid, and cancellation/deletion releases it. The exact rejection message is “Only one metronome can be placed. Use the existing metronome.” Free-play snapshots are inactive serialized data and reserve nothing. Free play has no two-Looper limit.

Legacy scenes restore only the first saved Metronome in array order. `SceneRestorer.lastReport` lists skipped objects, affected clock connections and warnings, and retains `originalScene` for recovery. Normal persistence keeps the original storage value and blocks autosave after a partial restore. Clocks are never silently merged. Tutorial exit likewise preserves a recovery snapshot if restoration is partial.

Grip and deliberately shake a Looper to remove only its incoming clock cable through `disconnectTarget('looper', id)` and the normal callback. Honk assignments and take data remain; playback and queued audio stop safely. Grip and shake a Honk to remove only that actual source’s direct Looper assignments. A frozen formation’s transform wrapper does not become the disconnected source. Both clock cables and unrelated assignments remain. Shaking a Metronome invokes neither rule.

The detector retains one boundary sample in its bounded 360 ms window. It requires at least two meaningful reversals, 0.16 m dominant-axis range, 0.38 m total travel and average speed of 0.85 m/s. Hysteresis is 0.055 m per reversal. Gaps over 100 ms, steps over 0.3 m or speed over 8 m/s reset history as tracking discontinuities. A real Grip is required. Release, target changes, previews, session changes and cancellation reset history. Cooldown is 700 ms and one feedback message is emitted per successful disconnect. These settings still need ergonomic headset confirmation.

## Practice, demonstrations and cleanup

For XR, serve HTTPS with `npm run dev:https`, enter AR/VR and choose Practice. Select the requested preset, aim, Trigger to place, Grip to cancel. Recenter moves the panel. Chords must touch internally and remain separate from other groups; melody Honks remain independent. Hold Trigger on a yellow squeeze sphere, keep your wrist level for chords, and roll downward for Eb4 → C4. Grip in empty space equips the stick; releasing Grip puts it away. Either physical hand can perform either part.

Every step keeps **Previous Step / Next Step / Demonstrate / Practice** in the same positions. Context actions sit below the musical instruction. Demonstrate is primary on entry; Practice is primary once demonstrated. Revisiting a demonstrated step keeps that preference. Practice starts the current step, arms its recording or playback when needed, and supplies a count-in for timed exercises. Results remain visible until Practice Again or Next. Next can bypass a demonstration or failed attempt.

Only fresh learner-origin input earns musical practice credit. Outcomes distinguish **passed**, **practiced**, **assisted** and **skipped**. Setup has a completion check, without a music score. Setup provided by Spawn, Prepare or Demonstrate remains assisted. Demonstrations use normal creation, connection/control APIs and visible virtual controller motions; musical demos use real squeeze rays and stick collisions. Existing valid instruments, placement and routing are reused. A recording demonstration restores the previous takes afterward; **Record Backing** and **Record Percussion** explicitly create/replace only the selected take through the conductor. They show progress and can be stopped.

Next prepares missing prerequisites explicitly. It validates actual pitch/contact/tempo stability, reuses valid roles, repairs missing voices, finds clear placement space within reach, and connects available sockets. A missing recording leaves the current step visible with the appropriate recording action. Completing that real recording resumes the pending navigation. Cancellation, insufficient space, disconnected targets or missing assets expose a recovery message and Prepare/Practice actions. Practice never rewinds earlier checkpoints after a setup change.

Yellow identifies the target. During timed work, green shrinks toward onset; yellow opens at onset, stays expanded through a sustained note and shrinks at release. Percussion uses preparation, a short strike pulse and withdrawal. These rings use the same score and metronome anchor as the conductor and run per frame. Untimed practice has no beat deadline. Rings do not receive raycasts; note and chord names stay on the panel. Static text and buttons update only when changed, independently of the small beat-status texture and per-frame rings.

Musical results show 0–100 components for targets, timing, hold/release and required bends. Weights are 45%, 25%, 20%, 10%, renormalized when a component does not apply. Missing and extra musical events reduce the score, including a percussion tap during a note exercise. Timing uses a 0.35-beat reference tolerance (262.5 ms at 80 BPM); hold/release uses 0.5 beat (375 ms). Accuracy is 100% inside 35% of the reference tolerance and falls linearly to zero at twice the tolerance. Passing requires every expected target, no extra events, total ≥70, timing ≥60, hold/release ≥70 and bend ≥70 when applicable. Pitch tolerance is 35 cents; the Eb→C glide must settle within 50 cents of C for 150 ms. Setup and untimed attempts have explicit Finish Attempt plus bounded recovery (30 and 20 seconds respectively).

The final note or strike may release up to **0.9 beat / 675 ms** past the endpoint before assessment forces a result. A still-held gesture cannot stall forever. Real recording stops in the written final breath once gestures are released; grading remains separate and waits for the endpoint/grace. A release that makes the captured take exceed 16 beats receives a timing/recording recovery result, without trimming or changing events. Recorded-take checks bind to actual track IDs and the take’s genuine capture evidence, even for explicitly assisted recordings. That evidence does not become learner credit.

Navigation, retry, tab hiding, demo cancellation, exit and XR transitions release owned input, cancel previews/count-ins/cues and preserve completed takes. A delayed musical demonstration frame (>250 ms) stops safely and offers a fresh demonstration. Simulation retains Pause/Resume with a fresh count-in. Practice results include a brief panel completion pulse; no feedback audio is added to recordings.

`RuntimePersistencePolicy` blocks lesson saves. Exit and leaving XR remove lesson objects and restore the inactive free-play snapshot through the normal restorer. Progress stays in memory. Desktop live practice previews exercises intended for tracked controllers; the complete simulation is desktop accessible.

## Musical definition

“VIRAG 2 — JOG STUDY” is an original Jog-inspired instrument study. It does not reproduce a named song or traditional bandish. Sa is C, tempo is 80 BPM, and the 16-beat backing lasts 12 seconds with no added gap. The accompaniment and percussion pattern are an original arrangement, not a claim of authentic tabla bols.

The note treatment draws on [Tanarang's Jog description](https://tanarang.com/raag-jog/) and [Rajan Parrikar's Jog discussion](https://www.parrikar.org/hindustani/jog/). Both discuss the Ga variants and the descending komal-Ga-to-Sa gesture. Parrikar describes differing treatments of Ni; this study consistently chooses komal Ni (Bb) and does not prescribe a universal vadi. D and A are not settled melody notes. Continuous bends may pass through intermediate frequencies.

The physical melody Honks are C4, Eb4, E4, F4, G4, Bb4, C5. The panel distinguishes `G = E4` (shuddha Ga) and `g = Eb4` (komal Ga). Each descending bend holds Eb for 20%, glides down over 50%, and settles on C for 30%. A following C4 event is articulated separately.

## Implementation and validation

The score and roles live in `composition.js`; `lessonSteps.js` defines the route. `TutorialSession` and `validation.js` independently assess each take and evidence origin. `TutorialAdapter` owns role bindings, take snapshots and commands. `CompositionConductor` runs in the app’s INPUT phase and writes no timeline data. `TutorialPanel` renders shared desktop/XR actions. `LooperController` owns quantized transport, source-tempo conversion and its existing audio scheduler. Honk and percussion scheduled voices retain cancellable ownership.

Run `npm run check`, `npm test`, or `npm run verify`. For full browser validation, open the app in a dedicated Chrome profile with `--remote-debugging-port=9225`, then run `npm run test:tutorial:browser`. Override `TUTORIAL_CDP_URL` / `TUTORIAL_APP_URL` if needed. The runner reloads the page, uses real time/assets/input/collisions/Web Audio, prints milestones and writes `/tmp/face-orchestra-tutorial-validation.json`. The profile’s original storage is restored after testing.

This usability update started from clean branch `Tutorial` at `51bf57bac1a7813625b6b5a3eebc7d3fd09d73d9`, containing the last reviewed tutorial. Baseline verification: 434/435 tests passed. The existing Metronome handle test expects −90° while the configuration is −80°; this work leaves that configuration unchanged.

See [tutorial-usability-validation.md](tutorial-usability-validation.md) for the current test evidence, performance comparison and remaining checks. The prior transport/audio report remains in [tutorial-validation.json](tutorial-validation.json).

**No headset or acoustic listening test was performed.** Automated audio signal measurements do not establish perceived balance, spatial comfort or hardware-controller ergonomics. The manual XR checklist remains unperformed unless separately recorded.
