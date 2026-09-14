# Radial-only tutorial validation

Implemented from clean branch **Tutorial**, commit **ef47265**. This report supersedes the earlier Spawn and preparation interfaces. Validation completed on 2026-09-14.

## Delivered behavior

- The active lesson has exactly six stable controls: Previous Step, Next Step, Demonstrate, Practice, Recenter and Exit. Removed panel actions have no hidden dispatch routes.
- All learner creation uses the normal radial preview, placement and cancellation system. Right A and previously unused left Y open the same menu on their respective hands; left X delete and right B context/lock remain intact. A held selection Trigger cannot commit until released and pressed again.
- Visible catalog: three Instruments; the four canonical composition Chords; C Major and Jog Study; Quiet and Melody. Legacy recipes remain available internally. The percussion target is an ordinary Honk at any pitch.
- Only committed placements bind roles. Ordinary Loopers fill Chord Looper and Percussion Looper in order; cancellation consumes no role, and replacement preserves the survivor. Recipe identity determines chord and melody roles.
- Composition chords created from the radial menu during a lesson lock through the existing service on placement. Body grabs move the group silently; squeeze targets sound the chord. Intentional unlock persists. Free-play defaults remain unchanged.
- Setup observes actual scene state without Practice. Next waits only for the current physical setup. Music and recordings can be skipped; no prerequisite construction or backing generation occurs. Musical actions explain missing requirements.
- Demonstrations restore checkpoints, takes, settings and stopped/paused/playing transports. Practice keeps successful intentional takes and supports cancellation/retry. A physically held stick remains equipped when entering percussion Practice.
- Seven green billboards cover the four chord roles, Metronome and two Loopers. Cached combined body bounds and separate native text bounds determine world-space clearance, converted into the label parent’s coordinates. Shared native note styling is idempotent and handles delayed font readiness and retuning.

## Verification

**Node/import checks:** syntax, relative imports and architecture guards pass for 164 source files. **453 of 454 Node tests pass.** The unchanged failure is `tests/instruments/metronome/MetronomeHandleRig.test.js:43`: the test expects −90°, while existing configuration is −80°. Spawning, input mapping, locking, tutorial, faithful looper playback and added role/navigation regressions pass.

**Full rendered browser regression:** [raw evidence](tutorial-radial-browser.json). The complete composition passed in **176.7263 seconds** with four real recorded chords, twelve real percussion collisions, synchronized playback and the complete A/B/A/C/B/D performance. Both recording demonstrations completed using real inputs and restored the previous takes without learner credit. Existing audio/clock, selective shake, persistence, cleanup, controller release, Honk interaction and presentation regressions also passed.

The revised learner route passed **742 assertions**, using controller roll/pull/menu-release input and real committed previews rather than tutorial spawning helpers. It covered:

- Both controller hands, held-trigger protection, Grip cancellation, retry, both ordinary Looper roles and replacement.
- All four chord recipes and Jog Study, canonical pitches, locked appearance, non-anchor group movement, silent body grabs, three-voice squeeze interaction and persistent user unlock.
- Actual application connection APIs using alternative Metronome outputs and Looper tracks, including non-anchor chord representatives. Setup completion and invalidation occur without Practice.
- Skipping both recordings and reaching melody without generated takes. A real untimed melody note passed with no backing; timed phrase attempts began and cancelled correctly with zero backing and with one genuine learner-recorded chord take.
- A four-chord learner recording scored 100 and survived navigation. Recording-demo cancellation and navigation restored both takes; complete recording demonstrations were also tested by the full suite.
- Restoration of playing source position and a clock-quantized paused transport after a demonstration.
- Delayed native font availability, actual retuning, consistent native text scale and repeated idempotent refresh.
- All seven billboards clearing independently measured visible geometry and native BPM text, including rotated/scaled Loopers. Billboards did not intercept rays. Cached mesh collections were reused over 120 repeated updates.
- Six unchanged button labels/positions, complete canvas text fitting its assigned regions, and zero idle DOM mutations.

The [rendered lesson screenshot](tutorial-radial-lesson.png) was visually inspected. Native pitch spelling retains the application's existing chromatic names (for example D# is enharmonic to Eb). Learner placement remains under user control; labels clear their own instrument/group bounds, while crowded arrangements can still overlap other objects in a particular view.

## Performance

Same Chrome profile and 1600 × 1013 desktop viewport, 240 animation-frame samples per scene, comparing archived `ef47265` with this implementation. These are CPU wall-time measurements, not headset or GPU measurements.

| Scene | Before p95 frame CPU | After p95 frame CPU | Median draw calls before → after |
| --- | ---: | ---: | ---: |
| Free play | 0.6 ms | 0.7 ms | 10 → 10 |
| Held chord | 5.2 ms | 4.4 ms | 155 → 171 |
| Percussion demonstration | 2.6 ms | 2.5 ms | 166 → 183 |
| Two-Looper playback | 2.1 ms | 1.9 ms | 162 → 179 |

Tutorial samples show no observed CPU regression. Small differences should not be treated as a general speedup. Restored native text and billboards add draw calls. Idle panel DOM mutations remained zero, with nine during the sampled percussion step transitions in both versions. The focused cached label update measured **0.1 ms p95**; it performed no repeated mesh collection.

Raw profiles: [before](tutorial-radial-performance-before.json), [after](tutorial-radial-performance-after.json).

## Reproduction and remaining checks

Run `npm run verify`. With the app at port 5173 and a dedicated Chrome test profile exposing CDP port 9225, run:

- `npm run test:tutorial:browser -- /tmp/tutorial-validation.json` for the full regression.
- `TUTORIAL_TEST=radial npm run test:tutorial:browser -- /tmp/tutorial-radial-validation.json` for the focused learner route. The old `spawn` and `usability` selectors now run this current route.
- `node scripts/run-tutorial-profile.mjs /tmp/tutorial-profile.json` for the four-scene desktop profile.

No headset, hardware-controller ergonomics, haptics, acoustic listening or GPU performance test was performed. Physical cable-drag gestures remain on the [manual XR checklist](manual-xr-regression.md); automated alternate-socket checks use the real connection APIs.

An additional tablet/phone viewport audit was not run because its browser permission request was declined. Desktop rendering and the XR canvas geometry/layout checks above passed; narrower viewport and in-headset readability remain unverified.

