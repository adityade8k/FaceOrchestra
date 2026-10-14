# Basics, tutorials and guided play

Kuch’s current experience is the shared standard for the prepared song tutorials. Demonstrate plays the selected phrase; Practice / Retry starts a fresh count-in; Previous / Next selects a lesson without awarding mastery. Preview plays the complete arrangement. Tempo −5 / +5 and the Metronome handle preserve the selected tempo through retries and phrase changes. Stop cancels pending starts and handoffs. Exit restores the saved Play scene.

The white square marks the current note; the gray circle marks the next. Yellow sustain feedback is a guide and never releases or locks a live note. Keep Trigger held for bends. Release and press again for repeated attacks. All melody Honks remain visible. Grip the blue melody frame to move and rotate it; use an orange corner or thumbstick left/right to scale it. Reset restores the original layout and deleted melody Honks. Frame edits are disabled during an attempt.

Raag Jog, Kuch and Nazariya share ordered bend snapping during practice and guided recording. The dial shows processed live pitch; haptics mark crossings. A delayed learner keeps unfinished targets, can return to an earlier pitch and retry, and must move the wrist again before another target advances. Assistance never runs during demonstrations or replay. Normal Play remains continuous; see [Controls](controls.md).

Prepared backing uses ordinary fixed Loopers and Metronome outputs. No take or cable changes during a run. A learner recording, deletion or changed connection stops the arrangement and preserves the edit. See [Compositions](compositions.md) for free-play construction and counts.

**Record Songs** uses the same definition, frame, cues and authored targets. Only the learner plays the melody. Capture/replay/export instructions are in [Capture](mixed-reality-capture.md). Guided Play Offset shifts visible cues only, never the sound, assessment clock, snapping progress or recorded expression.

## Basics

### Lesson sequence

Step numbers and totals come from `src/tutorial/basicsSteps.js`.

1. Honk.
2. Bend a sounding note.
3. Move the horn.
4. Rotate it.
5. Reach minimum scale.
6. Reach maximum scale, then return smoothly to working size.
7. Right ear up/down, then left ear up/down.
8. Sound and bend, then sound while adjusting an ear.
9. Move the nose up and down while sounding.
10. Sound A, E, I, O, and U.
11. Duplicate with Grip + A.
12. Duplicate to three, move into contact, and play the chord.
13. Freeze with B, then grab and move the frozen group.
14. Unfreeze with a fresh B press.
15. Clear tutorial horns with X.
16. Create and place a horn through the instrument menu.
17. Start the metronome and hear two pulses.
18. Change BPM and hear the changed pulse.
19. Choose four beats with the looper's right handle.
20. Connect a looper socket to the horn.
21. Connect a metronome output to a free looper socket.
22. Arm and record a usable phrase through the actual recording lifecycle.
23. Play the recorded phrase, hear it through its duration, and stop.
24. Add a repeat gap, then return to zero.
25. Record a second phrase.
26. Connect the second looper to the first looper's metronome output.
27. Play the first, queue the second, and hear the switch.
28. Equip a stick and make two separate strikes with withdrawal.
29. Finish: return to free play or replay onboarding.

Song practice and mixed-reality capture remain in their existing workflows.

### Completion and recovery

`BasicsTutorial` maintains the current index, completed IDs, objective evidence, fresh input tokens, and the pending success transition. `BasicsFixtures` tracks tutorial-owned entity IDs and stores a scene checkpoint at each lesson's entry. Back, Next review, and Reset restore that checkpoint without resetting completion history. This restores the appropriate horn count, frozen group, routes, and actual learner takes. Missing or distant targets show a Reset lesson message. Entering XR relocates the tutorial workspace and its checkpoints to the tracked viewer.

The normal XR coordinator reports accepted intents after their handlers run. Entry timestamps and `BasicsInputGate` reject queued input, held buttons, uncentered sticks, and virtual/demo controllers. Continuous checks run after the normal performance pass. Setup, Help, navigation, and restored state cannot award objectives. Completed review steps never schedule automatic advancement.

Evidence uses real live pitch/volume parameters, confirmed controller audio voices and a running AudioContext, grip displacement/quaternion changes, supported scale limits, contact-graph membership, lock-service membership, connections, recording revisions and completion, and the playback engine's sounding tracks. Compound objectives have separate evidence; the ears and nose require ordered changes. Silent vowel clicks do not count. Silent ear/nose movement cannot be saved up and credited when sound begins later.

Thresholds are centralized in `basicsSteps.js`: 9 cm translation, 20° rotation, 0.22 normalized bend (0.88 semitones), 0.22 ear change, 0.16 actual nose-gain change, 0.015 scale tolerance, and 5 BPM. Sound is observed for 140 ms; success remains visible for 850 ms before advancing.

### Guidance and controls

- The compact panel faces the viewer above the active instrument or chord bounds, with a 10 cm clearance. Its pose is smoothed, its position stays stable during grip transforms, and it remains in place when horns are cleared. Later lessons anchor near the relevant clock or looper. The existing pitch label is kept small and close to the hat. The shared panel returns to its original layout for other modes.
- Target rings, direction arrows, controller badges, the existing bend gauge, a volume bar, vowel checks, and recording status provide feedback without success sounds. Help exposes the current lesson's explanation without playing or altering instruments.
- A already duplicates the gripped instrument; without Grip it opens the radial menu. Left Y also opens that menu. No remapping was needed.
- Scaling is edge-based: each left/right joystick push changes size by 0.25. The helper explains centering between pushes. Limits remain 0.5 and 8.
- Existing collider aliases are viewer-relative: the authored `left` target is at negative local X. Onboarding uses the clown's perspective, so its right ear refers to that target. Instrument pitch mappings are unchanged. Completion reads canonical live parameters, rather than rendered morph weights.
- B already freezes contact-group membership and relative transforms, disables facial edits, and still permits sounding the chord. Onboarding uses this real lock service.
- X normally deletes the pointed instrument. Only the clear-horns lesson intercepts X to delete all tutorial-owned horns. It never operates on the saved Play composition.
- The right looper handle supports 2/4/8/16 beats. The bottom handle supports a 0–4 beat gap; zero adds no gap.
- There is no fixed pre-roll countdown in this recording workflow: Record arms it, silence waits indefinitely, and the first sound starts the beat window. READY and RECORDING are shown separately.
- Direct looper-to-looper sequencing is absent. The lesson teaches the supported alternative: connect loopers to the same metronome output and queue a switch at the cycle boundary. Exclusivity is per output; different outputs may play together.


## Raag Jog procedural lessons

Only committed placements bind roles. The first ordinary Looper becomes Chord Looper and the next becomes Percussion Looper and the third becomes Alternative Looper. Cancelled previews consume no role. A replacement fills the missing role while the survivor keeps its identity. Chord and melody roles follow their actual recipe, regardless of the current step. An ordinary standalone Honk becomes the percussion target when its setup is relevant.

Composition chords placed from the radial menu during the lesson enter the existing locked group mode. Every member gets the normal locked appearance. Grab any member to move the chord; only the squeeze target sounds it. During Practice, point at any Honk and press **right B** to lock or unlock it, including separate melody and percussion Honks. Touching chords toggle together. Lock changes persist through lesson updates and Practice retries. Free-play spawning, individual Honks, scales, Loopers and Metronomes retain normal lock defaults.

Every active lesson has exactly six controls, with stable positions and labels: **Previous Step, Next Step, Demonstrate, Practice, Recenter, Exit**. Demonstrate and Practice toggle their own cancellation using an active appearance. Scores and recovery advice are text. The same Practice button retries a result. The larger desktop text scrolls within the fixed controls; the XR panel reflows complete text into separate instruction and feedback areas.

Placement, wiring, tempo, timbre and stick setup are observed automatically. Demonstrate and Practice are disabled there. A valid current setup shows completion feedback and enables Next; the learner chooses when to continue. Deleted, retuned or disconnected objects invalidate the affected setup. Connections use any compatible sockets. Next never creates, connects or repairs anything.

Musical exercises and recordings can be skipped. Missing recordings do not block Next or trigger automatic backing generation. Empty playback steps say “No recording yet; you can skip this step”. Melody practice and demonstrations use the running Metronome with zero, one or both available backing parts. Only an action missing its own required physical targets, clock, route or recording is disabled.

Demonstrate uses real conductor rays and stick collisions on the existing scene. It grants no learner credit or navigation. Completion, cancellation and navigation restore the prior checkpoint, takes, instrument settings and stopped/paused/playing transport state; active playback resumes from its saved source position through the normal next-beat scheduler. Temporary example recordings are discarded only while the demonstration still owns that session and Looper operation. New learner transport/recording activity invalidates restoration for the affected Looper; asynchronous audio readiness and cleanup cannot roll back a newer take. Only the separately launched full simulation constructs its setup automatically.

Practice starts the current musical exercise, arms its intended recording or playback when needed, and supplies a count-in. Only fresh learner input counts. Results remain until Practice or Next. All actual recordings persist regardless of score. Assessment changes feedback and progress only. Active captures finalize before cached take publication and grading; cleanup never sends idle Stop, which normally clears an idle Looper. Outcomes distinguish passed, practiced, assisted and skipped work.

One green billboard belongs to each of the four chord roles, the Metronome and the three Looper roles. Cached visible body bounds are combined in world coordinates, including all group members. Native note/BPM text is accounted for separately. The billboard’s bottom clears the highest visual by the configurable margin in `TutorialLabels.js`; the result is converted to its parent coordinates. Transform, morph, retuning and text changes update bounds without repeated geometry traversal. Billboards cannot receive rays.

All tutorial Honks retain their native note text. A shared scale is assigned from the known base, so repeated refreshes do not accumulate resizing. Font arrival and retuning create the same label style. This changes neither pitches nor chord spacing.

Timed Jog work uses the shared current-note, next-note, sustain and bend cues described above. Untimed technique drills still assess actual learner release.

Musical results retain 0–100 components for targets, timing, hold/release and required bends. Weights are 45%, 25%, 20%, 10%, renormalized when a component does not apply. Missing and extra events reduce the score. Passing requires every expected target, no extra events, total ≥70, timing ≥60, hold/release ≥70 and bend ≥70 when applicable. The scoring module retains its existing tolerances. Untimed exercises stop after the first completed event or the 20-second recovery bound.

The final event may release up to **0.9 beat / 675 ms** past the endpoint before assessment forces a result. The recorder closes capture at its own exact 16-beat endpoint; grading may wait for release evidence without extending capture or releasing the live gesture. Automatic takes retain the final breath through the endpoint. Manual Stop before that point retains a shortened content-trimmed take. The final 3.7-beat chord hold can end at beat 15.7 and pass. Timing and hold tolerances use original learner evidence; normalization cannot improve an early/late score. Take checks use actual track IDs and genuine capture evidence.

Navigation, retry, tab hiding, cancellation, Exit and XR transitions release owned input and cancel previews/count-ins/cues. Completed recordings survive lesson navigation. A delayed musical demonstration frame (>250 ms) stops safely; full simulation can resume with Demonstrate and a fresh count-in. No feedback audio enters recordings.

`RuntimePersistencePolicy` blocks lesson saves. Exit and leaving XR remove lesson objects and restore the inactive free-play snapshot. Progress is saved under stable composition and lesson identifiers. Desktop lesson controls are available, while manual placement requires normal controller input; full simulation also works from desktop.


Procedural connections, spawn actions and assessment remain explicit handlers in `TutorialAdapter`, `TutorialSession` and `CompositionConductor`. Editable instructions, scores, tolerances and lesson settings belong in `src/compositions/jog/definition.js`; Basics settings belong in `src/tutorial/basicsSteps.js`.

## Clocks and compatibility

`LOOPER_STANDALONE_BPM = 70` is the standalone authority. Each disconnected Looper uses the stable local origin at the page’s monotonic time zero, without a Metronome object, automatic click or separate speed control. Its label reads **70 BPM · Internal**. New standalone recordings are armed until onset and record against this known grid. Connected Loopers use only their Metronome’s BPM; a paused external clock cannot silently become an independent one.

Timeline schema 8 stores explicit `lengthMode` (`fixed-window` or `content-trimmed`) and `fixedWindowBeats` alongside `sourceBeatIntervalMs` separately from content duration and explicit Gap. Manual finalization subtracts one shared first-onset offset from all tracks, retaining interpolation support and the final release/expression sample. `onsetOffsetMs` records this shift; at constant recording tempo, runtime `startedAtMs + onsetOffsetMs` identifies the original musical onset. Tempo changes are stored in beat-relative source coordinates. Tutorial evidence retains original wall timestamps for early/late scoring. Percussion events serialize their envelope lifetime as `durationMs`. A 15.7-beat chord take at 80 BPM lasts 11.775 seconds at its source tempo and about 13.457 seconds at internal 70 BPM. Changing BPM preserves source phase; disconnect stops safely and the next Play uses the local grid.

Legacy takes with explicit source metadata or `timingMode: metronome` retain that known reference. An ordinary legacy take with absent/unreliable metadata (including inferred tempo) keeps its native millisecond intervals; Play still quantizes its launch to the next beat. Its tempo is not guessed. Loading earlier schemas removes saved leading wait and beat/Stop padding from actual gates and strike envelopes, while retaining full holds, expressive gestures and interior rests. Gap is reapplied once from its explicit setting. Such a take is not promised a known beat count at the displayed playback grid.
