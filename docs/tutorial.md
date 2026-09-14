# Honk Orchestra composition tutorial

Choose **Tutorial → Start Lesson** or **Full Simulation** from the opening panel. Desktop and XR panel buttons use the same handlers. Run `npm run dev`, open `http://localhost:5173`, wait for assets and enable audio by clicking. Simulation uses real virtual controller rays, squeeze gestures, stick-body collisions, connections, recording and Web Audio. It never constructs or repairs a take’s events.

## Two backing parts

One Metronome drives two labelled, separately placed Loopers:

| Stable role | Clock route | Recorded part |
| --- | --- | --- |
| `chordLooper` — Chord Looper | Any available Metronome output → compatible Looper socket | One member of each touching chord group on a distinct available track. Any member may represent its chord. |
| `percussionLooper` — Percussion Looper | A separate output from the same Metronome → a compatible socket | Percussion Honk and Metronome-body taps occupy distinct actual tracks; Looper-body taps use its existing self-percussion lane. |

The lesson stays at **80 BPM**, with a **16-beat / 12-second assessment window and Gap 0**. Completed automatic takes retain the entire 16-beat window. Manual Stop before the endpoint stores a content-trimmed shortened take. The four voicings, Jog melody, vowels, responsive chord contact behavior and bend lessons remain the same. Only squeeze spheres trigger frozen Honks.

Practice proceeds through:

1. Place the Metronome and both Loopers, connect both clock cables, start 80 BPM and set both Gaps to zero.
2. Place and wire all four chord groups; audition E/O, soften the backing and rehearse chord holds.
3. Arm only Chord Looper, count in, record Groups 1–4 on zero-based beats 0/4/8/12, holding about 3.7 beats each. First set the right handle to 16 beats. Capture stops automatically; validate the completed take and use linked Play to listen.
4. Place and wire the percussion Honk; equip a stick and rehearse all three targets and the pattern.
5. Set the right handle to 16 beats and arm only Percussion Looper. The Metronome supplies the count-in, with any existing chord take as accompaniment. On zero-based beats 0/4/8/12 strike the Honk; 2/6/10/14 the Metronome; 3/7/11/15 Percussion Looper. Withdraw between strikes. Capture stops automatically after 16 beats. Validate twelve real recorded collisions and listen with linked Play.
6. On the “Start both parts together” step, choose **Practice** to listen to both parts launched on the same beat, put away the stick and continue the seven-note melody, descending bend and A–B–A–C–B–D lessons.

Every actual learner take remains on its real Looper, including partial, imperfect and low-scoring takes. Starting a new recording replaces that Looper’s take at its first sound. Cancelling while still record-armed preserves the prior take; cancelling an active capture finalizes it through ordinary Stop. The other Looper’s recording remains untouched. Metronome strikes retain their established fan-out routing; recorder arming determines which take receives them. Both modes preserve full holds, expressive curves and release endpoints up to capture stop. Automatic takes retain their full beat window; natural tails sound beyond it. Manual percussion includes the finite lifetime of its normal envelopes and resonators, including the final hihat on beat 15. Pre-onset wait and post-sound wait before Stop add no duration. Interior rests remain intact.

Before each recording exercise, the setup checkpoint reads the actual right-handle setting. The default 16 passes immediately. Practice and Demonstrate both arm the real recorder; neither runs a competing capture-stop timer. The panel distinguishes **Ready — begin on the cue**, count-in, actual **Beat 1/16 … 16/16**, remaining beats and automatic or shortened completion. The last two beats show an orange visual warning without adding sound. Missing the cue is explained without shifting assessment timestamps. No first sound leaves Record armed.

The timing circles retain the green preparation and yellow hold/release animation. A stationary white reference stays at the squeeze target; a small amber ring shows the desired wrist roll. It follows the same Eb-to-C bend curve as the conductor and assessment: initial level hold, gradual three-semitone descent, then settling on C. Direction is projected from the active controller’s captured orientation using the actual roll-to-pitch mapping for either hand and viewing orientation. It does not move the squeeze collider or change learner pitch. Untimed guidance begins on the learner’s actual onset; timed guidance follows musical clock phase. Navigation, release, cancelled demonstrations and Exit clear the cues.

## Play and Start All

**Play restarts every eligible recorded Looper connected to the same Metronome on one shared next beat**, from each take’s own origin and first-event offset. Standalone Play remains independent. Empty, armed and actively recording Loopers are excluded. Existing playback continues until the common boundary. Repeated presses for the same target reuse the pending launch and audio anchor. Deletion, disconnection and Stop cancel stale scheduled launches. The tutorial’s “Start both” action uses this same group operation.

Completed 2/4/8/16-beat takes at Gap 0 repeat from that absolute clock origin and meet again every 16 beats; shorter wraps do not restart longer takes. Gap adds only its explicit beats. Shortened manual takes keep their actual fractional lengths. No rounding or stretching forces alignment. Count-ins and assessment keep their original cue coordinates regardless of when the learner first sounds.

The existing 25 ms audio scheduler prepares up to 120 ms ahead; rendering does not deliver the audio. A stall retains the originally requested launch beat, skips obsolete attacks and reconciles any currently held note. Launch diagnostics distinguish when the audio was prepared from when transport was observed; late observation is not a claim that missed audio sounded on time.

The programmatic `resumePlayback` method is separate: it resumes the paused source position on the next beat. The physical **Play** button always restarts. Looper Pause remains immediate internally and next-beat when externally clocked. Metronome Pause safely stops connected playback/recording and cancels scheduled voices. Volume zero is a separate mute operation and leaves clock phase and Loopers running; it does not mute recorded wooden stick taps.

## Clocks and compatibility

`LOOPER_STANDALONE_BPM = 70` is the standalone authority. Each disconnected Looper uses the stable local origin at the page’s monotonic time zero, without a Metronome object, automatic click or separate speed control. Its label reads **70 BPM · Internal**. New standalone recordings are armed until onset and record against this known grid. Connected Loopers use only their Metronome’s BPM; a paused external clock cannot silently become an independent one.

Timeline schema 8 stores explicit `lengthMode` (`fixed-window` or `content-trimmed`) and `fixedWindowBeats` alongside `sourceBeatIntervalMs` separately from content duration and explicit Gap. Manual finalization subtracts one shared first-onset offset from all tracks, retaining interpolation support and the final release/expression sample. `onsetOffsetMs` records this shift; at constant recording tempo, runtime `startedAtMs + onsetOffsetMs` identifies the original musical onset. Tempo changes are stored in beat-relative source coordinates. Tutorial evidence retains original wall timestamps for early/late scoring. Percussion events serialize their envelope lifetime as `durationMs`. A 15.7-beat chord take at 80 BPM lasts 11.775 seconds at its source tempo and about 13.457 seconds at internal 70 BPM. Changing BPM preserves source phase; disconnect stops safely and the next Play uses the local grid.

Legacy takes with explicit source metadata or `timingMode: metronome` retain that known reference. An ordinary legacy take with absent/unreliable metadata (including inferred tempo) keeps its native millisecond intervals; Play still quantizes its launch to the next beat. Its tempo is not guessed. Loading earlier schemas removes saved leading wait and beat/Stop padding from actual gates and strike envelopes, while retaining full holds, expressive gestures and interior rests. Gap is reapplied once from its explicit setting. Such a take is not promised a known beat count at the displayed playback grid.

## Admission, recovery and shake

`InstrumentAdmissionPolicy`, shared by the active registry, factory and pre-geometry runtime creation, enforces zero or one Metronome. It covers menu/preset creation, tutorial/simulation, duplication, restoration and pending/reentrant requests. A pending preview reserves the slot, its placement remains valid, and cancellation/deletion releases it. The exact rejection message is “Only one metronome can be placed. Use the existing metronome.” Free-play snapshots are inactive serialized data and reserve nothing. Free play has no two-Looper limit.

Legacy scenes restore only the first saved Metronome in array order. `SceneRestorer.lastReport` lists skipped objects, affected clock connections and warnings, and retains `originalScene` for recovery. Normal persistence keeps the original storage value and blocks autosave after a partial restore. Clocks are never silently merged. Tutorial exit likewise preserves a recovery snapshot if restoration is partial.

Grip and deliberately shake a Looper to remove only its incoming clock cable through `disconnectTarget('looper', id)` and the normal callback. Honk assignments and take data remain; playback and queued audio stop safely. Grip and shake a Honk to remove only that actual source’s direct Looper assignments. A frozen formation’s transform wrapper does not become the disconnected source. Both clock cables and unrelated assignments remain. Shaking a Metronome invokes neither rule.

The detector retains one boundary sample in its bounded 360 ms window. It requires at least two meaningful reversals, 0.16 m dominant-axis range, 0.38 m total travel and average speed of 0.85 m/s. Hysteresis is 0.055 m per reversal. Gaps over 100 ms, steps over 0.3 m or speed over 8 m/s reset history as tracking discontinuities. A real Grip is required. Release, target changes, previews, session changes and cancellation reset history. Cooldown is 700 ms and one feedback message is emitted per successful disconnect. These settings still need ergonomic headset confirmation.

## Practice, demonstrations and cleanup

For XR, serve HTTPS with `npm run dev:https`. Open the radial menu with **right A or left Y**, roll to a category, pull toward yourself, roll to an item and release the menu button. The preview follows that controller. Trigger places; Grip cancels; the owning thumbstick adjusts distance and scale. A held Trigger must be released before a fresh press can place. Left X still deletes and right B retains its context/lock behavior.

The visible catalog is:

| Category | Entries |
| --- | --- |
| Instruments | Honk, Looper, Metronome |
| Chords | Group 1: C3/G3/C4; Group 2: C3/F3/G3; Group 3: Bb2/C3/G3; Group 4: G2/C3/C4 |
| Scales | C Major; Jog Study: C4/Eb4/E4/F4/G4/Bb4/C5 |
| Presets | Quiet; Melody |

Existing recipe IDs remain available internally for saved scenes. Stick equipment still uses Grip in empty space. Percussion uses an ordinary Honk at any pitch.

Only committed placements bind roles. The first ordinary Looper becomes Chord Looper and the next becomes Percussion Looper. Cancelled previews consume neither role. A replacement fills the missing role while the survivor keeps its identity. Chord and melody roles follow their actual recipe, regardless of the current step. An ordinary standalone Honk becomes the percussion target when its setup is relevant.

Composition chords placed from the radial menu during the lesson enter the existing locked group mode. Every member gets the normal locked appearance. Grab any member to move the chord; only the squeeze target sounds it. During Practice, point at any Honk and press **right B** to lock or unlock it, including separate melody and percussion Honks. Touching chords toggle together. Lock changes persist through lesson updates and Practice retries. Free-play spawning, individual Honks, scales, Loopers and Metronomes retain normal lock defaults.

Every active lesson has exactly six controls, with stable positions and labels: **Previous Step, Next Step, Demonstrate, Practice, Recenter, Exit**. Demonstrate and Practice toggle their own cancellation using an active appearance. Scores and recovery advice are text. The same Practice button retries a result. The larger desktop text scrolls within the fixed controls; the XR panel reflows complete text into separate instruction and feedback areas.

Placement, wiring, tempo, timbre and stick setup are observed automatically. Demonstrate and Practice are disabled there. A valid current setup shows completion feedback and enables Next; the learner chooses when to continue. Deleted, retuned or disconnected objects invalidate the affected setup. Connections use any compatible sockets. Next never creates, connects or repairs anything.

Musical exercises and recordings can be skipped. Missing recordings do not block Next or trigger automatic backing generation. Empty playback steps say “No recording yet; you can skip this step”. Melody practice and demonstrations use the running Metronome with zero, one or both available backing parts. Only an action missing its own required physical targets, clock, route or recording is disabled.

Demonstrate uses real conductor rays and stick collisions on the existing scene. It grants no learner credit or navigation. Completion, cancellation and navigation restore the prior checkpoint, takes, instrument settings and stopped/paused/playing transport state; active playback resumes from its saved source position through the normal next-beat scheduler. Temporary example recordings are discarded only while the demonstration still owns that session and Looper operation. New learner transport/recording activity invalidates restoration for the affected Looper; asynchronous audio readiness and cleanup cannot roll back a newer take. Only the separately launched full simulation constructs its setup automatically.

Practice starts the current musical exercise, arms its intended recording or playback when needed, and supplies a count-in. Only fresh learner input counts. Results remain until Practice or Next. All actual recordings persist regardless of score. Assessment changes feedback and progress only. Active captures finalize before cached take publication and grading; cleanup never sends idle Stop, which normally clears an idle Looper. Outcomes distinguish passed, practiced, assisted and skipped work.

One green billboard belongs to each of the four chord roles, the Metronome and the two Looper roles. Cached visible body bounds are combined in world coordinates, including all group members. Native note/BPM text is accounted for separately. The billboard’s bottom clears the highest visual by the configurable margin in `TutorialLabels.js`; the result is converted to its parent coordinates. Transform, morph, retuning and text changes update bounds without repeated geometry traversal. Billboards cannot receive rays.

All tutorial Honks retain their native note text. A shared scale is assigned from the known base, so repeated refreshes do not accumulate resizing. Font arrival and retuning create the same label style. This changes neither pitches nor chord spacing.

Yellow identifies the target. During timed work, green shrinks toward onset; yellow opens at onset, stays expanded through a sustained note and shrinks at release. Percussion uses preparation, a short strike pulse and withdrawal. These rings use the same score and metronome anchor as the conductor and run per frame. Untimed practice has no beat deadline. Rings and billboards do not receive raycasts. Static text and buttons update only when changed, independently of the small beat-status texture and per-frame rings.

Musical results retain 0–100 components for targets, timing, hold/release and required bends. Weights are 45%, 25%, 20%, 10%, renormalized when a component does not apply. Missing and extra events reduce the score. Passing requires every expected target, no extra events, total ≥70, timing ≥60, hold/release ≥70 and bend ≥70 when applicable. The scoring module retains its existing tolerances. Untimed exercises stop after the first completed event or the 20-second recovery bound.

The final event may release up to **0.9 beat / 675 ms** past the endpoint before assessment forces a result. The recorder closes capture at its own exact 16-beat endpoint; grading may wait for release evidence without extending capture or releasing the live gesture. Automatic takes retain the final breath through the endpoint. Manual Stop before that point retains a shortened content-trimmed take. The final 3.7-beat chord hold can end at beat 15.7 and pass. Timing and hold tolerances use original learner evidence; normalization cannot improve an early/late score. Take checks use actual track IDs and genuine capture evidence.

Navigation, retry, tab hiding, cancellation, Exit and XR transitions release owned input and cancel previews/count-ins/cues. Completed recordings survive lesson navigation. A delayed musical demonstration frame (>250 ms) stops safely; full simulation can resume with Demonstrate and a fresh count-in. No feedback audio enters recordings.

`RuntimePersistencePolicy` blocks lesson saves. Exit and leaving XR remove lesson objects and restore the inactive free-play snapshot. Progress stays in memory. Desktop lesson controls are available, while manual placement requires normal controller input; full simulation also works from desktop.

## Musical definition

“VIRAG 2 — JOG STUDY” is an original Jog-inspired instrument study. It does not reproduce a named song or traditional bandish. Sa is C, tempo is 80 BPM, and the written 16-beat exercise spans 12 seconds. Completed backing loops retain 16 beats; manually shortened loops retain their actual performed lengths with no added gap. The accompaniment and percussion pattern are an original arrangement, not a claim of authentic tabla bols.

The note treatment draws on [Tanarang's Jog description](https://tanarang.com/raag-jog/) and [Rajan Parrikar's Jog discussion](https://www.parrikar.org/hindustani/jog/). Both discuss the Ga variants and the descending komal-Ga-to-Sa gesture. Parrikar describes differing treatments of Ni; this study consistently chooses komal Ni (Bb) and does not prescribe a universal vadi. D and A are not settled melody notes. Continuous bends may pass through intermediate frequencies.

The physical melody Honks are C4, Eb4, E4, F4, G4, Bb4, C5. The panel distinguishes `G = E4` (shuddha Ga) and `g = Eb4` (komal Ga). Each descending bend holds Eb for 20%, glides down over 50%, and settles on C for 30%. A following C4 event is articulated separately.

## Implementation and validation

The score and roles live in `composition.js`; `lessonSteps.js` defines the route. `TutorialSession` and `validation.js` independently assess each take and evidence origin. `TutorialAdapter` owns role bindings, take snapshots and commands. `CompositionConductor` runs in the app’s INPUT phase and writes no timeline data. `TutorialPanel` renders shared desktop/XR actions. `LooperController` owns quantized transport, source-tempo conversion and its existing audio scheduler. Honk and percussion scheduled voices retain cancellable ownership.

Run `npm run check`, `npm test`, or `npm run verify`. For full browser validation, open the app in a dedicated Chrome profile with `--remote-debugging-port=9225`, then run `npm run test:tutorial:browser`. Override `TUTORIAL_CDP_URL` / `TUTORIAL_APP_URL` if needed. The runner reloads the page, uses real time/assets/input/collisions/Web Audio, prints milestones and writes `/tmp/face-orchestra-tutorial-validation.json`. The profile’s original storage is restored after testing.

This radial-menu update started from clean branch `Tutorial` at `ef47265`, containing the latest tutorial. The existing Metronome handle test expects −90° while configuration is −80°; this work leaves that configuration unchanged.

See [looper-recording-validation.md](looper-recording-validation.md) for the recording regression evidence, and [tutorial-radial-validation.md](tutorial-radial-validation.md) for the preceding radial-menu validation. The usability and Spawn reports describe superseded interfaces. The prior transport/audio report remains in [tutorial-validation.json](tutorial-validation.json).

**No headset or acoustic listening test was performed.** Automated audio signal measurements do not establish perceived balance, spatial comfort or hardware-controller ergonomics. The manual XR checklist remains unperformed unless separately recorded.
