# Manual Honk response and frozen squeeze repair

Baseline: `60039a07519b2787531bd332aee1313a5efca5d7`, checked against the fetched `origin/fix/faithful-looper-playback`. The initial working tree was clean. This repair is a working-tree diff on that branch.

## Established causes and changes

**Frozen input:** both Trigger-begin routing and held-frame acquisition promoted a locked body hit into a squeeze. Held-frame acquisition also promoted a gripped Honk. Both now call the same acquisition method, backed by `isHonkSqueezeTarget`: the exact registered `honk.squeeze` object must be named `HIT_horn`, have the `holdSqueeze` profile, belong to the current registered instrument, remain attached, and have visible ancestors. Neither lock state, a body hit, nor grip grants squeeze ownership.

A valid capture survives pointer movement and roll, and a fresh sphere hit can acquire or retarget during a hold. Trigger-up and a new press clear the capture. Invalidated captures release their chord; deletion does so immediately. Frozen morph editing remains disabled, including a drag already underway when locking. Hover still exposes squeeze, grip, and connection targets, while frozen morph controls no longer advertise an editable action. Locked Looper and Metronome body routing remains intact.

**Repeated manual raycasts:** each held controller previously selected a general hit twice and queried locked bodies once within `updateHorn`. It now selects once and passes that result directly through adjacent routing/acquisition work. Hover and later performance queries remain separate because grip/relationship transforms can occur between them. No geometry cache keyed only by frame number was introduced.

**Per-mesh pose work:** authored mesh wrappers previously applied/restored the authoritative pose separately for each raycast. `RaycastSystem` now batches each owner's target list inside one `withInteractionPose` scope. The existing nested mesh wrappers and Stick pose separation remain. Each query refreshes current world transforms and rejects hidden/detached targets; exception-safe restoration remains in the Honk. Measured pose/matrix work decreases, but the controlled phase's elapsed time is largely unchanged on this desktop; triangle intersection work dominates that small fixture.

**Repeated start requests:** membership used to call `startAudioVoice` every held frame. It now starts new members or voices actually missing from the audio service. `AudioSystem.hasVoice` exposes the service's active/pending status through `HonkInstrument.hasAudioVoice`; the controller's or instrument's active-ID set alone cannot suppress a retry. Failed context activation/startup can retry while owned, and existing start tokens cancel old asynchronous generations on release. Updates continue every frame and departing owners retain the controller release profile.

The baseline browser trace already created exactly three voices per stable chord attack, with aligned Web Audio timestamps. It did **not** establish serial note startup, repeated oscillator recreation, or per-hop smoothing as causes. No audio scheduling, synthesis, gain, tuning, envelope, contact hysteresis, recording samples, animation tuning, or Looper timing was changed. Contact membership still comes from the revision-cached full connected component, and each member receives the same current controller intent in one processing pass. Quieter polyphony normalization is retained; it is distinct from delayed onset.

## Reproduce the measurement

Start `npm run dev`, open the app in Chrome, then run in DevTools:

```js
const trace = await (await import('/scripts/benchmark-manual-honks-browser.mjs')).benchmark();
copy(JSON.stringify(trace, null, 2));
```

Use a disposable desktop page. The benchmark creates isolated applications with memory-only storage, real model assets, actual runtime methods, the real contact system, real Web Audio/HonkVoice nodes, and rendering. Each of eight cases uses 60 display callbacks, two synthetic controllers, one or three Honks, locked/unlocked state, three 15-frame holds with five-frame gaps, and C separating/rejoining during the second unlocked chord. A-B-C is transitive: A and C do not directly touch. Four cases also run an actual Looper and an independent Metronome click. An additional ten grip queries run during a controlled eased release to separate pose work from playback/display phase.

The script asserts its synthetic controller actually selects the registered sphere. It returns input timestamps, frame/phase costs, query/mesh/full-hierarchy update counts, contact revisions and membership, each member's processed squeeze, actual node creations, and named voice onset/dispatch/release events. Timings are diagnostic, not absolute CI assertions. Node behavior tests assert operation bounds and elapsed/audio-event relationships.

For the baseline, extract `git archive 60039a0` into a temporary directory, copy the **same** benchmark script into its `scripts/` directory, serve it on another port, and repeat. Disable Chrome's network cache before navigating between revisions so imported modules cannot mix. The full models are included in `git archive`, even when the current checkout uses sparse patterns.

Environment: macOS, Node v24.7.0, headless Chrome 152, pinned Three.js 0.164.1, SwiftShader WebGL, autoplay enabled for the synthetic input. Each table compares one complete run on each revision. Cold shader compilation is included in frame totals; phase medians/p95 are more useful here. Render timings measure CPU submission, not headset GPU time or FPS. Event timestamps measure software dispatch, not acoustic latency. Accompaniment advances in real time, so its attack/click totals can differ when runs take different elapsed time.

## Browser work counts and timings

No-accompaniment counts over the same 60-frame gesture sequence (before → after):

| Honks | Locked | General / locked queries | Mesh raycasts | Start requests | Actual voices / oscillators |
| ---: | :---: | --- | ---: | ---: | --- |
| 1 | no | 213 / 168 → 168 / 123 | 426 → 336 | 45 → 3 | 3 / 6 → 3 / 6 |
| 3 | no | 213 / 168 → 168 / 123 | 1278 → 1008 | 130 → 10 | 10 / 20 → 10 / 20 |
| 1 | yes | 213 / 168 → 168 / 123 | 930 → 705 | 45 → 3 | 3 / 6 → 3 / 6 |
| 3 | yes | 213 / 168 → 168 / 123 | 2790 → 2115 | 135 → 9 | 9 / 18 → 9 / 18 |

The unlocked three-Honk case includes one C rejoin, hence ten voice creations rather than nine. A split takes effect on frame 27 after moving C on frame 25; rejoin takes effect on frame 32 after returning C on frame 31, on both revisions. This is the preserved three-update exit/two-update entry hysteresis.

Measured `updateHorn` CPU milliseconds, including hit selection and live/playback performance (median / p95):

| Honks | Locked | Looper + click | Before | After |
| ---: | :---: | :---: | ---: | ---: |
| 1 | no | no | 1.4 / 1.5 | 0.7 / 0.8 |
| 3 | no | no | 2.6 / 2.8 | 1.3 / 1.5 |
| 1 | yes | no | 1.9 / 2.1 | 0.7 / 0.8 |
| 3 | yes | no | 3.6 / 4.1 | 1.3 / 1.5 |
| 1 | no | yes | 4.6 / 5.5 | 2.4 / 2.8 |
| 3 | no | yes | 6.1 / 7.1 | 3.0 / 3.5 |
| 1 | yes | yes | 5.5 / 6.5 | 2.4 / 2.8 |
| 3 | yes | yes | 7.2 / 8.6 | 2.9 / 3.4 |

The locked three-Honk case is the clearest reduction: one general ray per held frame replaces two general rays plus a locked-body ray. Hover continues to perform its separate queries and has roughly unchanged costs. Render draw calls remain 10 for one Honk and 28 for three without accompaniment.

Ten controlled grip queries during a three-Honk eased release: 90 mesh raycasts remain 90, pose switches fall 90 → 30, and full-hierarchy updates fall 180 → 90 (60 apply/restore updates plus 30 current-transform refreshes). Elapsed CPU is 12.9 → 11.8 ms: no material speed claim for this phase. Settled queries now explicitly refresh each owner's transforms; total full-hierarchy updates in the locked three-Honk 60-frame case increase 960 → 1833. The measured net improvement comes from fewer expensive raycasts, while the additional refreshes protect same-frame correctness.

Software onset observations (three stable attacks, no accompaniment):

| Honks | Locked | Input to first voice dispatch, before | After | Largest within-chord audio timestamp spread, before / after |
| ---: | :---: | ---: | ---: | ---: |
| 1 | no | 3.1–4.8 ms | 2.3–4.1 ms | 0.000 / 0.000 ms |
| 3 | no | 5.3–6.8 ms | 3.9–5.0 ms | 0.000 / 0.000 ms |
| 1 | yes | 4.6–5.6 ms | 3.2–4.5 ms | 0.000 / 0.000 ms |
| 3 | yes | 8.6–9.7 ms | 6.2–7.0 ms | 0.000 / 0.000 ms |

Node/formant creation is measured separately in each event. Neither revision shows an added sequential-note delay in these attacks. Three voices keep three independently processed envelopes and the existing polyphony gain normalization. This does not measure when sound reaches the listener.

## Validation and ownership coverage

- `npm run check`: all 144 source files pass syntax/import/architecture guards.
- Forty new tests call actual Trigger-begin, held `updateHorn`, release, hover, or ray-query methods. Only browser math/render dependencies are substituted in Node; real registries, contact graph/hysteresis, Honk performance, AudioSystem, HonkVoiceService and HonkVoice run in the manual fixture. Browser geometry/rotation checks complement those substitutions.
- Coverage includes every Honk role locked/unlocked; a body masquerading as `HIT_horn`; off-target hold/bend/repress; frozen grip; two controllers; hidden, detached, unregistered, removed and deleted captures; lock/unlock and morph-drag cancellation; independent manual/Looper/Metronome owners; transitive split/rejoin; rapid release generations; pending starts; failed AudioContext activation and retries; and old-token cancellation.
- Ray tests cover owner-batched pose apply/restore counts, throwing queries, existing hit priorities, and same-frame transform/visibility/target/lock/removal changes.
- Browser `validate-manual-honks-browser.mjs`: 49 batched/raw authoritative ray comparisons (9 hits), real roll away from the sphere, lock/unlock during hold, frozen grip rejection, exact group translation, same-frame movement, and deletion cleanup pass. The existing presentation validator still passes 81 comparisons (55 intersections), sphere/socket invariance, and eased visible squeeze `0.82` with authoritative squeeze `0`.
- Existing authoritative-pose/Stick, presentation, faithful playback, contact ownership, scheduled voice, projected vowel, timeline-index, metronome/Looper clock and pending-spawn checks remain in the full suite.
- Final `npm test`: **387 tests, 386 pass**. The sole failure is the unchanged `MetronomeHandleRig.test.js:43` expectation: actual `-80`, expected `-90`. Baseline was 347 tests, 346 pass with that same failure. Tracked asset fixtures remain present. No unrelated setting or test was modified.

Run the browser regression independently with:

```js
await (await import('/scripts/validate-manual-honks-browser.mjs')).validate();
await (await import('/scripts/validate-honk-presentation-browser.mjs')).validate();
```

## Changed files

- Input/lifecycle: `XRInteractionRuntime.js`, `HonkPerformanceRuntime.js`, `ControllerHonkRelease.js`, `LifecycleRuntime.js`, `XRInteractionCoordinator.js`, `HonkInteractionProfile.js`.
- Query/voice status: `RaycastSystem.js`, `HonkInstrument.js`, `AudioSystem.js`, `HonkVoiceService.js`.
- Validation: the two new browser scripts; `ManualHonkInteraction.test.js`, `ManualHonkPerformance.test.js`, `RaycastSystem.test.js`; two small Node fixture helpers; this report and its architecture link.

The `60039a0` indexed timelines, track-scoped contact scheduling, cached components, per-update sphere snapshots, projected vowels and presentation/interaction separation are preserved.

## Remaining hardware check

Acoustic latency, audible timbre/release quality, controller tracking feel and headset FPS remain unverified. The measured desktop work reduction does not establish the exact perceptual cause of the reported headset delay.

On a headset, compare one Honk with an already-touching A-B-C chord, unlocked and blue. Squeeze rapidly, roll off the sphere, release, then press each body/morph/connector and empty space; those presses must stay silent. Grip/move the blue group, unlock/relock and delete during a note. Repeat with both controllers, separate/rejoin C mid-note, then repeat with a recording/playback Looper and a linked Metronome. Confirm simultaneous attacks, expected normalized loudness, unchanged tone/pitch/release and visuals, faithful replay, and only departing owners releasing. Capture display intervals plus input/audio events if any audible delay remains; distinguish the preserved two-update contact-entry/three-update exit hysteresis from settled-chord onset.
